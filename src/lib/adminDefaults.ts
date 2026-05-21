/** Cookie satt når bruker startet fra /admin/new */
export const ADMIN_SUBMITTER_COOKIE = "admin-submitter";

export type AdminSubmitterDefaults = {
  name: string;
  accountNumber: string;
};

/**
 * Forhåndsutfylt navn/kontonummer for admin-flyt (f.eks. egen innsending).
 * Sett i .env og Vercel:
 *   ADMIN_SUBMITTER_NAME="Ditt fulle navn"
 *   ADMIN_SUBMITTER_ACCOUNT="12345678901"  (11 sifre)
 */
export function getAdminSubmitterDefaults(): AdminSubmitterDefaults | null {
  const name = process.env.ADMIN_SUBMITTER_NAME?.trim();
  const digits = process.env.ADMIN_SUBMITTER_ACCOUNT?.replace(/\D/g, "") ?? "";
  if (!name || digits.length !== 11) return null;
  return { name, accountNumber: digits };
}

export function isAdminSubmitterConfigured(): boolean {
  return getAdminSubmitterDefaults() != null;
}
