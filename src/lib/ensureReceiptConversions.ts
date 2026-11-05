import { Prisma, type Receipt } from "@prisma/client";
import { prisma } from "./db";
import { bankConversion } from "./currency";
import { forEachConcurrent } from "./forEachConcurrent";

/** Existing drafts from before the upgrade are converted without an extra user step.
 * Submitted claims and documented manual/automatic conversions are never repriced. */
export async function ensureReceiptConversions(receipts: Receipt[]) {
  await forEachConcurrent(receipts.filter(r => r.foreignExchange == null && r.extractedCurrency && r.extractedCurrency !== "NOK" && r.originalAmountCents != null && r.receiptDate), 2, async receipt => {
    try {
      const fx = await bankConversion(receipt.extractedCurrency!, receipt.originalAmountCents!, receipt.receiptDate!);
      const saved = await prisma.receipt.updateMany({
        where: { id: receipt.id, foreignExchange: { equals: Prisma.DbNull }, receiptDate: receipt.receiptDate,
          originalAmountCents: receipt.originalAmountCents, extractedCurrency: receipt.extractedCurrency,
          extractedTotalCents: receipt.extractedTotalCents, submission: { status: { in: ["DRAFT", "REVIEW"] } } },
        data: { extractedTotalCents: fx.nokAmountCents, foreignExchange: fx },
      });
      if (saved.count) { receipt.extractedTotalCents = fx.nokAmountCents; receipt.foreignExchange = fx as unknown as Prisma.JsonValue; }
    } catch { /* The review only asks for help when a receipt genuinely cannot be converted. */ }
  });
}
