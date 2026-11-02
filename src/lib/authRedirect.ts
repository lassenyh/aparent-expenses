/** Only this additional destination is accepted from authentication links. */
export function authDestination(next: string | null): string {
  return next === "/auth/reset-password" ? next : "/admin";
}
