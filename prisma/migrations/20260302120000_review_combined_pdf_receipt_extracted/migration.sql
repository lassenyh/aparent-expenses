-- Add REVIEW to SubmissionStatus enum (PostgreSQL: add new value)
ALTER TYPE "SubmissionStatus" ADD VALUE 'REVIEW';

-- AlterTable Submission: add combinedPdfUrl
ALTER TABLE "Submission" ADD COLUMN "combinedPdfUrl" TEXT;

-- AlterTable Receipt: add extracted fields
ALTER TABLE "Receipt" ADD COLUMN "extractedSummary" TEXT,
ADD COLUMN "extractedTotalCents" INTEGER,
ADD COLUMN "extractedCurrency" TEXT DEFAULT 'NOK';
