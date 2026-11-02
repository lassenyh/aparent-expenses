-- Additive: extra images of a receipt that was photographed in several parts.
CREATE TABLE "ReceiptPart" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptPart_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceiptPart_receiptId_position_idx" ON "ReceiptPart"("receiptId", "position");

ALTER TABLE "ReceiptPart" ADD CONSTRAINT "ReceiptPart_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
