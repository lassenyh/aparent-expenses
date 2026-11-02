/**
 * Generates synthetic receipts with known answers for benchmark-receipts.ts.
 * Every merchant, amount and date below is invented; no real receipts are used.
 *
 * Usage: npm run benchmark:fixtures -- [output-dir]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

type Expected = {
  totalCents?: number | null;
  originalAmountCents?: number | null;
  currency?: string;
  merchant?: string;
  receiptDate?: string;
  readable?: boolean;
};

type Case = {
  id: string;
  about: string;
  /** Lines printed on the receipt, top to bottom. "---" draws a dashed rule. */
  lines: string[];
  format: "jpeg" | "png" | "pdf";
  /** Photo-like distortions applied after rendering. */
  photo?: { rotate?: number; blur?: number; dim?: boolean };
  /** Renders the lines twice, side by side, as two receipts on one page. */
  second?: string[];
  expected: Expected;
};

const CASES: Case[] = [
  {
    id: "kiwi-lunsj",
    about: "Dagligvare med flere varelinjer og mva",
    format: "jpeg",
    lines: ["KIWI HAMAR", "Torggata 12, 2317 Hamar", "Org.nr 912 345 678 MVA", "14.10.2026 11:48", "---",
      "BAGUETTE x 12          478,80", "FRUKT                  219,70", "MINERALVANN x 24       357,60", "KAFFE                  228,40", "---",
      "TOTALT                1 284,50", "BankAxept              1 284,50", "---", "MVA 15%   GRUNNLAG 1 116,96   167,54", "Takk for handelen!"],
    expected: { totalCents: 128450, currency: "NOK", merchant: "kiwi", receiptDate: "2026-10-14", readable: true },
  },
  {
    id: "taxi",
    about: "Taxikvittering med driks på null",
    format: "jpeg",
    lines: ["OSLO TAXI AS", "Kvittering for taxitur", "Dato 14.10.2026  Kl 06:12", "Fra: Oslo lufthavn", "Til: Hamar", "---",
      "Takst                  689,00", "Driks                    0,00", "---", "Å BETALE               689,00 NOK", "MVA 12%                  73,82"],
    expected: { totalCents: 68900, currency: "NOK", merchant: "taxi", receiptDate: "2026-10-14", readable: true },
  },
  {
    id: "tusenskille",
    about: "Beløp med punktum som tusenskille",
    format: "png",
    lines: ["CLAS OHLSON", "Storgata 23, Oslo", "13.10.2026 16:30", "---", "LED-PANEL 60W          1.199,00", "GAFFATEIP 50MM           150,90", "---",
      "SUM NOK               1.349,90", "Visa ****4471          1.349,90"],
    expected: { totalCents: 134990, currency: "NOK", merchant: "clas ohlson", receiptDate: "2026-10-13", readable: true },
  },
  {
    id: "kontant-veksel",
    about: "Kontant med vekslepenger, totalen er ikke betalt beløp",
    format: "jpeg",
    lines: ["NARVESEN OSLO S", "Jernbanetorget 1", "12.10.2026 07:55", "---", "BATTERIER AAA 8PK       159,00", "VANN 0,5L x 3            78,50", "---",
      "TOTAL                   237,50", "KONTANT                 300,00", "VEKSLEPENGER             62,50"],
    expected: { totalCents: 23750, currency: "NOK", merchant: "narvesen", receiptDate: "2026-10-12", readable: true },
  },
  {
    id: "rabatt",
    about: "Delsum og rabatt før totalen",
    format: "jpeg",
    lines: ["REMA 1000 BRYN", "11.10.2026 18:02", "---", "KAFFE 500G              89,90", "BRØD                    42,50", "FRUKTFAT               280,00", "---",
      "DELSUM                 412,40", "RABATT FRUKTFAT        -40,00", "---", "TOTALT                 372,40", "Kort                   372,40"],
    expected: { totalCents: 37240, currency: "NOK", merchant: "rema", receiptDate: "2026-10-11", readable: true },
  },
  {
    id: "svenske-kroner",
    about: "Utenlandsk valuta (SEK)",
    format: "jpeg",
    lines: ["SØSTRENE GRENE", "Drottninggatan 40, Stockholm", "2026-10-11 13:05", "---", "KERAMIKSKÅL x 6        252,00", "LINDUK                 168,00", "---",
      "TOTALT SEK             420,00", "Moms 25%                84,00"],
    expected: { originalAmountCents: 42000, currency: "SEK", merchant: "grene", receiptDate: "2026-10-11", readable: true },
  },
  {
    id: "euro-pdf",
    about: "PDF-kvittering i euro",
    format: "pdf",
    lines: ["REWE MARKT BERLIN", "Friedrichstrasse 101", "09.10.2026 19:21", "---", "Wasser 6x1,5l            4,95", "Brot                     2,49", "Obst                    16,36", "---",
      "SUMME EUR               23,80", "MwSt 7%                  1,56"],
    expected: { originalAmountCents: 2380, currency: "EUR", merchant: "rewe", receiptDate: "2026-10-09", readable: true },
  },
  {
    id: "kreditnota",
    about: "Retur og kreditnota, skal bli negativt beløp",
    format: "jpeg",
    lines: ["ELKJØP LØRENSKOG", "KREDITNOTA / RETUR", "08.10.2026 15:44", "---", "Retur: Mikrofonstativ  -1.499,00", "---",
      "TOTALT                -1.499,00", "Tilbakebetalt Visa    -1.499,00"],
    expected: { totalCents: -149900, currency: "NOK", merchant: "elkjøp", receiptDate: "2026-10-08", readable: true },
  },
  {
    id: "parkering-png",
    about: "Skjermbilde av kvittering fra app",
    format: "png",
    lines: ["EasyPark", "Kvittering", "Sone 3021 Aker Brygge", "Start 10.10.2026 09:40", "Slutt 10.10.2026 12:40", "---", "Parkering 3 t          240,00 kr", "---", "Totalt                 240,00 kr"],
    expected: { totalCents: 24000, currency: "NOK", merchant: "easypark", receiptDate: "2026-10-10", readable: true },
  },
  {
    id: "skjevt-foto",
    about: "Skjevt og dempet foto",
    format: "jpeg",
    photo: { rotate: 7, blur: 0.6, dim: true },
    lines: ["CIRCLE K GARDERMOEN", "14.10.2026 18:20", "---", "DIESEL 41,3 L          894,50", "---", "TOTAL                  894,50", "Mastercard             894,50"],
    expected: { totalCents: 89450, currency: "NOK", merchant: "circle k", receiptDate: "2026-10-14", readable: true },
  },
  {
    id: "uskarp",
    about: "Så uskarp at beløpet ikke kan leses",
    format: "jpeg",
    photo: { blur: 9, dim: true },
    lines: ["MENY STORO", "15.10.2026 12:10", "---", "DIVERSE                346,70", "---", "TOTALT                 346,70"],
    expected: { totalCents: null, readable: false },
  },
  {
    id: "to-kvitteringer",
    about: "To kvitteringer på samme bilde, skal ikke summeres",
    format: "jpeg",
    lines: ["COOP EXTRA LILLEHAMMER", "15.10.2026 08:30", "---", "KAFFE                   89,00", "---", "TOTALT                  89,00"],
    second: ["SHELL LILLEHAMMER", "15.10.2026 08:41", "---", "SPYLERVÆSKE             129,00", "---", "TOTALT                 129,00"],
    expected: { totalCents: null },
  },
];

const W = 576; // 80 mm thermal paper at about 7 px/mm
const LINE = 30;

function escapeXml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function receiptSvg(lines: string[], x = 0): { svg: string; height: number } {
  const height = 60 + lines.length * LINE + 40;
  const body = lines
    .map((line, i) => {
      const y = 60 + i * LINE;
      if (line === "---") return `<line x1="${x + 24}" x2="${x + W - 24}" y1="${y - 10}" y2="${y - 10}" stroke="#555" stroke-dasharray="6 5"/>`;
      const anchor = i < 3 ? `x="${x + W / 2}" text-anchor="middle"` : `x="${x + 28}"`;
      const weight = i === 0 || /^(TOTAL|TOTALT|SUM|SUMME|Å BETALE|Totalt)/.test(line) ? "bold" : "normal";
      return `<text ${anchor} y="${y}" font-weight="${weight}" xml:space="preserve">${escapeXml(line)}</text>`;
    })
    .join("");
  return {
    height,
    svg: `<rect x="${x}" y="0" width="${W}" height="${height}" fill="#fbfbf8"/><g font-family="Courier New, Courier, monospace" font-size="21" fill="#1b1b1b">${body}</g>`,
  };
}

async function renderImage(c: Case): Promise<Buffer> {
  const first = receiptSvg(c.lines);
  const second = c.second ? receiptSvg(c.second, W + 60) : null;
  const width = second ? W * 2 + 60 : W;
  const height = Math.max(first.height, second?.height ?? 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#d8d6d0"/>${first.svg}${second?.svg ?? ""}</svg>`;
  let img = sharp(Buffer.from(svg));
  if (c.photo) {
    // Place the slip on a grey table, then tilt, soften and dim it like a phone photo.
    const slip = await sharp(Buffer.from(svg)).png().toBuffer();
    img = sharp({ create: { width: width + 240, height: height + 240, channels: 3, background: "#8d8a84" } })
      .composite([{ input: slip, left: 120, top: 120 }]);
    let buf = await img.png().toBuffer();
    if (c.photo.rotate) buf = await sharp(buf).rotate(c.photo.rotate, { background: "#8d8a84" }).toBuffer();
    if (c.photo.blur) buf = await sharp(buf).blur(c.photo.blur).toBuffer();
    if (c.photo.dim) buf = await sharp(buf).modulate({ brightness: 0.82 }).linear(0.8, 18).toBuffer();
    img = sharp(buf);
  }
  return c.format === "png" ? img.png().toBuffer() : img.jpeg({ quality: 85 }).toBuffer();
}

async function renderPdf(c: Case): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([226, 60 + c.lines.length * 14 + 30]); // 80 mm wide
  c.lines.forEach((line, i) => {
    const y = page.getHeight() - 40 - i * 14;
    if (line === "---") page.drawText("-".repeat(30), { x: 12, y, size: 9, font });
    else page.drawText(line, { x: 12, y, size: 9, font });
  });
  return Buffer.from(await doc.save());
}

async function main() {
  const dir = path.resolve(process.argv[2] || "output/receipt-benchmark");
  await mkdir(dir, { recursive: true });
  const manifest = [];
  for (const c of CASES) {
    const ext = c.format === "jpeg" ? "jpg" : c.format;
    const file = `${c.id}.${ext}`;
    const bytes = c.format === "pdf" ? await renderPdf(c) : await renderImage(c);
    await writeFile(path.join(dir, file), bytes);
    const mimeType = c.format === "pdf" ? "application/pdf" : `image/${c.format}`;
    manifest.push({ file, mimeType, about: c.about, expected: c.expected });
  }
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`${CASES.length} syntetiske kvitteringer skrevet til ${dir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
