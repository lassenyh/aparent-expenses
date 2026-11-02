import Link from "next/link";
import { AuthPanel } from "@/components/AuthPanel";
import { getAdminEmail } from "@/lib/adminAuth";
import { NewPasswordForm } from "../PasswordForms";

export const metadata = { title: "Velg nytt passord – Aparent Utlegg" };

export default async function ResetPasswordPage() {
  const email = await getAdminEmail();
  return <AuthPanel title="Velg nytt passord" description={email ? `Du endrer passordet for ${email}.` : "Åpne lenken fra e-posten for å velge et nytt passord."}>
    {email ? <NewPasswordForm /> : <Link href="/auth/forgot-password" className="text-sm text-muted underline underline-offset-2 hover:text-ink">Be om en ny lenke</Link>}
  </AuthPanel>;
}
