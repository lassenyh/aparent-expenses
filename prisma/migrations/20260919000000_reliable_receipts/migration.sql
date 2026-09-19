-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "adminFlow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryError" TEXT,
ADD COLUMN     "deliveryId" TEXT,
ADD COLUMN     "deliveryStartedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "productionCashCents" INTEGER,
ADD COLUMN     "recipientEmail" TEXT,
ADD COLUMN     "submissionStartedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "analysisError" TEXT,
ADD COLUMN     "analysisStartedAt" TIMESTAMP(3),
ADD COLUMN     "analysisStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "lineItems" JSONB,
ADD COLUMN     "merchant" TEXT,
ADD COLUMN     "receiptDate" TEXT,
ADD COLUMN     "reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourcePages" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "vatBreakdown" JSONB;

-- CreateTable
CREATE TABLE "ReceiptAnalysis" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,

    CONSTRAINT "ReceiptAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CleanupJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstAttemptAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "lastError" TEXT,
    "providerId" TEXT,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptSource" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleanupJob_provider_target_key" ON "CleanupJob"("provider", "target");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_submissionId_key" ON "EmailOutbox"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSource_submissionId_blobUrl_key" ON "ReceiptSource"("submissionId", "blobUrl");

-- AddForeignKey
ALTER TABLE "ReceiptAnalysis" ADD CONSTRAINT "ReceiptAnalysis_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve existing extraction data; historical submissions remain immutable.
UPDATE "Receipt" SET "analysisStatus" = CASE WHEN "extractedSummary" IS NULL THEN 'FAILED' ELSE 'NEEDS_REVIEW' END;
UPDATE "Receipt" SET "analysisError" = 'Eldre bilag uten analyse. Velg Analyser på nytt eller fyll inn manuelt.' WHERE "extractedSummary" IS NULL;
UPDATE "Receipt" SET "reviewed" = true WHERE "submissionId" IN (SELECT "id" FROM "Submission" WHERE "status" = 'SUBMITTED');
UPDATE "Submission" SET "productionCashCents" = "productionCash" * 100 WHERE "productionCash" IS NOT NULL;
UPDATE "Submission" SET "deliveryStatus" = 'LEGACY_UNKNOWN' WHERE "status" = 'SUBMITTED';

CREATE INDEX "Receipt_submissionId_createdAt_idx" ON "Receipt"("submissionId", "createdAt");
CREATE INDEX "Receipt_analysisStatus_analysisStartedAt_idx" ON "Receipt"("analysisStatus", "analysisStartedAt");
CREATE INDEX "ReceiptAnalysis_receiptId_createdAt_idx" ON "ReceiptAnalysis"("receiptId", "createdAt");
CREATE INDEX "CleanupJob_completedAt_createdAt_idx" ON "CleanupJob"("completedAt", "createdAt");
CREATE INDEX "EmailOutbox_status_leaseUntil_idx" ON "EmailOutbox"("status", "leaseUntil");
