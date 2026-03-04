/**
 * Converts an HTML document string to PDF using Puppeteer.
 * Uses the same HTML produced by renderExpensePdfHtml (Tailwind CDN in the doc).
 *
 * Requires Chrome for Puppeteer. If you see "Could not find Chrome", run:
 *   npx puppeteer browsers install chrome
 * Or set PUPPETEER_EXECUTABLE_PATH to your system Chrome (e.g. on macOS:
 *   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome).
 */

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export async function htmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer");

  const launchOptions: Parameters<typeof puppeteer.default.launch>[0] = {
    headless: true,
    args: CHROME_ARGS,
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.default.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
