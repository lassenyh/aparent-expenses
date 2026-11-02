import { readBankDetails } from "./bankDetails";
import { getAdminSubmitterDefaults } from "@/lib/adminDefaults";
import { isAdminSubmitterFlow } from "@/lib/adminSubmitterCookie";

/**
 * Person- og prosjektinfo for the info dialog on the upload page. Uses the same
 * prefill as the review page: the admin flow fills name and account from env.
 */
export async function getInitialSubmissionInfo(submission: {
  name: string | null;
  projectNumber: string | null;
  project: string | null;
  workDate: Date | null;
  accountNumber: string | null;
  bankDetails?: unknown;
  productionCash: number | null;
}) {
  const adminDefaults = (await isAdminSubmitterFlow()) ? getAdminSubmitterDefaults() : null;
  return {
    name: submission.name ?? adminDefaults?.name ?? "",
    projectNumber: submission.projectNumber ?? "",
    project: submission.project ?? "",
    workDate: submission.workDate?.toISOString().slice(0, 10) ?? null,
    bankDetails: readBankDetails(submission.bankDetails),
    accountNumber: submission.accountNumber ?? adminDefaults?.accountNumber ?? "",
    productionCash: submission.productionCash != null ? String(submission.productionCash) : "",
  };
}
