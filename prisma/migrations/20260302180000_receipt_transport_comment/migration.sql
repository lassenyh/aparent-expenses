-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN "needsTransportComment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Receipt" ADD COLUMN "transportCommentDismissed" BOOLEAN NOT NULL DEFAULT false;
