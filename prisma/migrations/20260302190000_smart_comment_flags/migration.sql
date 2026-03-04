-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN "commentFlags" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "dismissedCommentFlags" TEXT;
ALTER TABLE "Receipt" DROP COLUMN "needsMealComment";
ALTER TABLE "Receipt" DROP COLUMN "needsTransportComment";
ALTER TABLE "Receipt" DROP COLUMN "transportCommentDismissed";
