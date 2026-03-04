/**
 * Converts an HTML document string to PDF using Puppeteer.
 * On Vercel uses @sparticuz/chromium; locally uses Chrome via PUPPETEER_EXECUTABLE_PATH
 * or default Puppeteer Chrome.
 */

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

export async function htmlToPdf(html: string): Promise<Buffer> {
  const isVercel = process.env.VERCEL === "1";

  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteer = await import("puppeteer-core");
    chromium.setGraphicsMode = false;
    const CHROMIUM_PACK_URL =
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    const args = chromium.args;

    const browser = await puppeteer.default.launch({
      args,
      executablePath,
      headless: true,
    });
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
