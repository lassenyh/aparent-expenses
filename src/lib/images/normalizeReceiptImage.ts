import convertHeic from "heic-convert";
import sharp from "sharp";

export type ReceiptImageFormat = "jpeg" | "png" | "gif" | "webp" | "heic" | "unknown";

const MAX_IMAGE_DIMENSION = 2000;
const JPEG_QUALITY = 82;

function startsWith(bytes: Buffer, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * Detects the actual payload format before consulting MIME metadata. Browsers
 * can transcode an iPhone photo while retaining its original HEIC filename or
 * MIME type, so MIME alone is not reliable enough for PDF export.
 */
export function detectReceiptImageFormat(
  bytes: Buffer,
  mimeType = ""
): ReceiptImageFormat {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  const header = bytes.subarray(0, 32).toString("ascii");
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "webp";

  const hasHeifBrand =
    header.slice(4, 8) === "ftyp" &&
    /(?:heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(header.slice(8));
  if (hasHeifBrand) return "heic";

  const mime = mimeType.toLowerCase();
  if (mime.includes("heic") || mime.includes("heif")) return "heic";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  return "unknown";
}

/**
 * Produces a PDF-safe JPEG with bounded dimensions. HEIC is decoded with the
 * portable libheif-js based converter because prebuilt sharp/libvips binaries
 * do not include patent-encumbered HEVC decoding.
 */
export async function normalizeReceiptImage(bytes: Buffer, mimeType: string): Promise<Buffer> {
  const format = detectReceiptImageFormat(bytes, mimeType);
  let decodableBytes = bytes;

  if (format === "heic") {
    decodableBytes = Buffer.from(
      await convertHeic({
        buffer: bytes,
        format: "JPEG",
        quality: 0.9,
      })
    );
  }

  return sharp(decodableBytes)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
