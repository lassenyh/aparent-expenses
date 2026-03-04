/*
  Warnings:

  - Added the required column `blobPath` to the `Receipt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `blobUrl` to the `Receipt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mimeType` to the `Receipt` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "blobPath" TEXT NOT NULL,
ADD COLUMN     "blobUrl" TEXT NOT NULL,
ADD COLUMN     "mimeType" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "productionCash" INTEGER,
ADD COLUMN     "project" TEXT,
ADD COLUMN     "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "totalInclVat" INTEGER,
ADD COLUMN     "workDate" TIMESTAMP(3);
