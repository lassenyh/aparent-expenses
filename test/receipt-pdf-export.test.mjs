import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import sharp from "sharp";

import {
  detectReceiptImageFormat,
  normalizeReceiptImage,
} from "../src/lib/images/normalizeReceiptImage.ts";
import { appendReceiptPages } from "../src/lib/pdf/appendReceiptPages.ts";

const fixtureUrl = new URL("./fixtures/receipt.heic", import.meta.url);

test("detects payload signatures before misleading MIME metadata", async () => {
  const jpeg = await sharp({
    create: { width: 8, height: 6, channels: 3, background: "#ffcc00" },
  })
    .jpeg()
    .toBuffer();

  assert.equal(detectReceiptImageFormat(jpeg, "image/heic"), "jpeg");
  assert.equal(detectReceiptImageFormat(Buffer.from("GIF89a"), ""), "gif");
});

test("converts a real HEIC payload to a bounded PDF-safe JPEG", async () => {
  const heic = await readFile(fileURLToPath(fixtureUrl));
  const jpeg = await normalizeReceiptImage(heic, "image/heic");
  const metadata = await sharp(jpeg).metadata();

  assert.equal(detectReceiptImageFormat(heic, "image/heic"), "heic");
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 64);
  assert.equal(metadata.height, 48);
});

test("appends PNG, JPEG, HEIC, and PDF receipts as visible pages", async () => {
  const summary = await PDFDocument.create();
  summary.addPage([300, 400]);
  const summaryBytes = Buffer.from(await summary.save());

  const png = await sharp({
    create: { width: 80, height: 60, channels: 4, background: "#1677ff" },
  })
    .png()
    .toBuffer();
  const jpeg = await sharp({
    create: { width: 90, height: 70, channels: 3, background: "#ffcc00" },
  })
    .jpeg()
    .toBuffer();
  const heic = await readFile(fileURLToPath(fixtureUrl));

  const sourcePdf = await PDFDocument.create();
  const sourcePage = sourcePdf.addPage([200, 300]);
  const font = await sourcePdf.embedFont(StandardFonts.Helvetica);
  sourcePage.drawText("PDF receipt", { x: 30, y: 250, font, size: 18 });
  const pdf = Buffer.from(await sourcePdf.save());

  const payloads = new Map([
    ["memory://receipt.png", png],
    ["memory://receipt.jpg", jpeg],
    ["memory://receipt.heic", heic],
    ["memory://receipt.pdf", pdf],
  ]);
  const receipts = [
    { blobUrl: "memory://receipt.png", mimeType: "image/png", originalFileName: "receipt.png" },
    { blobUrl: "memory://receipt.jpg", mimeType: "image/jpeg", originalFileName: "receipt.jpg" },
    { blobUrl: "memory://receipt.heic", mimeType: "image/heic", originalFileName: "receipt.heic" },
    { blobUrl: "memory://receipt.pdf", mimeType: "application/pdf", originalFileName: "receipt.pdf" },
  ];

  const combined = await appendReceiptPages(summaryBytes, receipts, async (url) => {
    const payload = payloads.get(url);
    assert.ok(payload, `Missing in-memory fixture for ${url}`);
    return payload;
  });
  const result = await PDFDocument.load(new Uint8Array(combined));

  assert.equal(result.getPageCount(), 5);
  for (const pageIndex of [1, 2, 3]) {
    const resources = result.getPage(pageIndex).node.Resources();
    const xObjects = resources?.lookup(PDFName.of("XObject"), PDFDict);
    assert.ok(xObjects && xObjects.keys().length > 0, `Page ${pageIndex + 1} has no embedded image`);
  }
});

test("fails with the filename instead of silently adding a blank page", async () => {
  const summary = await PDFDocument.create();
  summary.addPage([300, 400]);

  await assert.rejects(
    appendReceiptPages(
      Buffer.from(await summary.save()),
      [
        {
          blobUrl: "memory://broken.heic",
          mimeType: "image/heic",
          originalFileName: "broken.heic",
        },
      ],
      async () => Buffer.from("not an image")
    ),
    /Kunne ikke behandle bildet broken\.heic/
  );
});
