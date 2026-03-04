-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN "comment" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "needsMealComment" BOOLEAN NOT NULL DEFAULT false;
