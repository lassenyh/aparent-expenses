/** Replace the bank preview's placeholder with an actual, private synthetic receipt. */
import { config } from "dotenv";
import sharp from "sharp";
import { get, put } from "@vercel/blob";

config({ path: [".env.development.local", ".env.local", ".env"], quiet: true });

async function main() {
  if (process.env.DATABASE_SCHEMA !== "expenses_development") {
    throw new Error("This fixture repair must only run in expenses_development.");
  }
  const { prisma } = await import("../src/lib/db");
  try {
    const receipt = await prisma.receipt.findFirst({
      where: {
        originalFileName: "synthetic-bank-check.jpg",
        submission: { accessToken: "synthetic-international-bank-ui-check" },
      },
      select: { id: true },
    });
    if (!receipt) throw new Error("The synthetic bank preview receipt was not found.");

    const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="700">
      <rect width="800" height="700" fill="white"/>
      <g font-family="sans-serif" fill="#111">
        <text x="60" y="90" font-size="30" font-weight="bold">TESTBILAG – IKKE EN EKTE KVITTERING</text>
        <text x="60" y="170" font-size="26">Aparent – test av utenlandsk bankkonto</text>
        <text x="60" y="240" font-size="24">Dato: 02.11.2026</text>
        <text x="60" y="330" font-size="24">Syntetisk testkjøp</text>
        <text x="60" y="420" font-size="34" font-weight="bold">Eksempelbeløp: 100,00 NOK</text>
        <text x="60" y="530" font-size="21">Kun til testing av innsending og PDF.</text>
        <text x="60" y="570" font-size="21">Skal ikke bokføres eller utbetales.</text>
      </g>
    </svg>`)).jpeg({ quality: 85 }).toBuffer();
    const blob = await put("test-fixtures/international-bank-preview.jpg", image, {
      access: "private", contentType: "image/jpeg", addRandomSuffix: true,
    });
    const stored = await get(blob.pathname, { access: "private" });
    if (!stored || stored.statusCode !== 200 || !stored.stream) {
      throw new Error("The uploaded test receipt could not be read back.");
    }
    const downloaded = Buffer.from(await new Response(stored.stream).arrayBuffer());
    if ((await sharp(downloaded).metadata()).format !== "jpeg") throw new Error("Invalid test image.");
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { blobUrl: blob.url, blobPath: blob.pathname, mimeType: "image/jpeg", sizeBytes: image.length },
    });
    console.log("Synthetic preview receipt replaced with a verified private JPEG. Entered form details were preserved.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
