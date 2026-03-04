/**
 * AI-drevet analyse av kvitteringer (bilde eller PDF).
 * Bruker OpenAI GPT-4o: Vision for bilder, tekstanalyse for PDF.
 */
import OpenAI from "openai";
import type { AnalyzeReceiptResult } from "./analyzeReceipt.types";
import { convertToNokCents } from "./currency";

const SYSTEM_PROMPT = `Du er en assistent som analyserer kvitteringer.
Svær ALLTID med nøyaktig ett JSON-objekt uten annen tekst:
{"summary": "Kort beskrivelse", "total": <tall med desimaler eller null>, "currency": "NOK" eller "SEK" eller "EUR" eller annen ISO-valutakode}
Regler for summary:
- IKKE bruk ordet "Kvittering" eller "Kvittering fra" i beskrivelsen. Start direkte med innholdet (f.eks. butikk/tjeneste og hva det gjelder).
- Hold beskrivelsen KORT: maks 4–6 ord eller én veldig kort setning (f.eks. "EasyPark parkering Aimo" eller "Kaffe og mat Coop").
- Hvis kvitteringen er fra restaurant, kafé, takeaway, gatekjøkken eller inneholder mat/drikke (f.eks. burrito, pizza, drikke): inkluder minst ett av ordene mat, restaurant, kafé, takeaway, catering eller drikke i summary (f.eks. "Mat El Camino" eller "Takeaway burrito").
- total: totalbeløpet på kvitteringen som tall (f.eks. 149.50), eller null hvis beløp ikke kan leses.
- currency: valutaen på kvitteringen som ISO-kode (NOK, SEK, EUR, USD, DKK osv). Bruk "NOK" for norske kroner.
Bare returner JSON, ingen markdown eller forklaring.`;

const IMAGE_PROMPT = `Analyser denne kvitteringen og returner JSON med "summary" (kort, uten ordet Kvittering; hvis det er mat/drikke inkluder f.eks. mat, restaurant eller takeaway), "total" (beløp) og "currency" (ISO-valutakode) som beskrevet.`;

const PDF_PROMPT = `Analyser følgende tekst fra en kvitterings-PDF og returner JSON med "summary" (kort, uten ordet Kvittering), "total" (beløp) og "currency" (ISO-valutakode) som beskrevet.

Tekst:
`;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;
  return new OpenAI({ apiKey: apiKey.trim() });
}

/** Fjerner «Kvittering»/«Kvittering fra» fra starten av beskrivelsen og trimmer. */
function normalizeSummary(s: string): string {
  return s
    .replace(/^Kvittering\s+fra\s+/i, "")
    .replace(/^Kvittering\s*/i, "")
    .trim();
}

function parseModelResponse(text: string): {
  summary: string;
  total: number | null;
  currency: string;
} {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonStr) as {
      summary?: string;
      total?: number | string | null;
      totalNok?: number | string | null;
      currency?: string;
    };
    const raw =
      typeof parsed.summary === "string" && parsed.summary.length > 0
        ? parsed.summary
        : "Kvittering";
    const summary = normalizeSummary(raw);
    const totalNum = (v: unknown): number | null => {
      if (typeof v === "number" && !Number.isNaN(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };
    const total = totalNum(parsed.total) ?? totalNum(parsed.totalNok);
    const currency =
      typeof parsed.currency === "string" && parsed.currency.trim().length > 0
        ? parsed.currency.trim().toUpperCase()
        : "NOK";
    return { summary: summary || "Kvittering", total, currency };
  } catch {
    return { summary: "Kvittering", total: null, currency: "NOK" };
  }
}

function toResult(
  summary: string,
  total: number | null,
  currency: string
): AnalyzeReceiptResult {
  const originalCents = total != null ? Math.round(total * 100) : null;
  if (originalCents == null) {
    return {
      summary,
      totalCents: null,
      currency: currency || "NOK",
      originalAmountCents: null,
    };
  }
  const isNok = !currency || currency.toUpperCase() === "NOK";
  if (isNok) {
    return {
      summary,
      totalCents: originalCents,
      currency: "NOK",
      originalAmountCents: null,
    };
  }
  const nokCents = convertToNokCents(originalCents, currency);
  return {
    summary,
    totalCents: nokCents ?? null,
    currency,
    originalAmountCents: originalCents,
  };
}

const STUB_RESULT: AnalyzeReceiptResult = {
  summary: "Kvittering",
  totalCents: null,
  currency: "NOK",
  originalAmountCents: null,
};

async function analyzeWithVision(bytes: Buffer, mimeType: string): Promise<AnalyzeReceiptResult> {
  const client = getOpenAIClient();
  if (!client) {
    return STUB_RESULT;
  }

  const base64 = bytes.toString("base64");
  const mediaType = mimeType.toLowerCase().startsWith("image/") ? mimeType : "image/jpeg";

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: IMAGE_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return STUB_RESULT;
    }

    const { summary, total, currency } = parseModelResponse(content);
    return toResult(summary, total, currency);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[analyzeReceipt] OpenAI Vision feilet, bruker stub:", msg);
    return STUB_RESULT;
  }
}

async function extractTextFromPdf(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const data = new Uint8Array(bytes);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return typeof result?.text === "string" ? result.text : "";
  } finally {
    await parser.destroy();
  }
}

/** Render første side av PDF som PNG-bilde (fallback når tekst uttrekk feiler). */
async function pdfFirstPageToPngBuffer(bytes: Buffer): Promise<Buffer | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const data = new Uint8Array(bytes);
    const parser = new PDFParse({ data });
    const result = await parser.getScreenshot({ first: 1, scale: 1.5 });
    await parser.destroy();
    const firstPage = result?.pages?.[0];
    if (firstPage?.data) {
      return Buffer.from(firstPage.data);
    }
    return null;
  } catch {
    return null;
  }
}

async function analyzePdfWithText(bytes: Buffer): Promise<AnalyzeReceiptResult> {
  const client = getOpenAIClient();
  if (!client) {
    return STUB_RESULT;
  }

  let text: string;
  try {
    text = await extractTextFromPdf(bytes);
  } catch (err) {
    console.warn("[analyzeReceipt] PDF tekstuttrekk feilet, prøver Vision på første side:", err instanceof Error ? err.message : err);
    const pngBuffer = await pdfFirstPageToPngBuffer(bytes);
    if (pngBuffer) {
      return analyzeWithVision(pngBuffer, "image/png");
    }
    return STUB_RESULT;
  }

  if (!text.trim() || text.trim().length < 10) {
    const pngBuffer = await pdfFirstPageToPngBuffer(bytes);
    if (pngBuffer) {
      return analyzeWithVision(pngBuffer, "image/png");
    }
    return { summary: "Kvittering (PDF uten lesbar tekst)", totalCents: null, currency: "NOK", originalAmountCents: null };
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: PDF_PROMPT + text.slice(0, 12000) },
      ],
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      const pngBuffer = await pdfFirstPageToPngBuffer(bytes);
      if (pngBuffer) {
        return analyzeWithVision(pngBuffer, "image/png");
      }
      return STUB_RESULT;
    }

    const { summary, total, currency } = parseModelResponse(content);
    return { ...toResult(summary, total, currency), extractedText: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[analyzeReceipt] OpenAI PDF-analyse feilet, prøver Vision på første side:", msg);
    const pngBuffer = await pdfFirstPageToPngBuffer(bytes);
    if (pngBuffer) {
      return analyzeWithVision(pngBuffer, "image/png");
    }
    return STUB_RESULT;
  }
}

export async function analyzeReceipt(
  bytes: Buffer,
  mimeType: string
): Promise<AnalyzeReceiptResult> {
  const isPdf = mimeType.toLowerCase().includes("pdf");

  if (isPdf) {
    return analyzePdfWithText(bytes);
  }

  // HEIC (iPhone) støttes ikke direkte av OpenAI Vision – konverter til JPEG
  const isHeic = mimeType.toLowerCase().includes("heic");
  if (isHeic) {
    try {
      const sharp = (await import("sharp")).default;
      const jpegBytes = await sharp(bytes).rotate().jpeg().toBuffer();
      return analyzeWithVision(jpegBytes, "image/jpeg");
    } catch (err) {
      console.warn("[analyzeReceipt] HEIC→JPEG konvertering feilet:", err instanceof Error ? err.message : err);
      return analyzeWithVision(bytes, mimeType);
    }
  }

  return analyzeWithVision(bytes, mimeType);
}
