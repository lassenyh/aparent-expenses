/** HTTP headers need an ASCII fallback; filename* carries the actual UTF-8 name. */
export function pdfDownloadHeader(filename: string): string {
  const name = filename.replace(/[\u0000-\u001f\u007f]/g, "").toWellFormed() || "utlegg.pdf";
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${utf8}`;
}
