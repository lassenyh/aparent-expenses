import { cookies } from "next/headers";
import { ADMIN_SUBMITTER_COOKIE } from "./adminDefaults";

export async function isAdminSubmitterFlow(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_SUBMITTER_COOKIE)?.value === "1";
}
