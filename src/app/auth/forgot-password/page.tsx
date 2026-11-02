import { AuthPanel } from "@/components/AuthPanel";
import { PasswordResetRequestForm } from "../PasswordForms";

export const metadata = { title: "Glemt passord – Aparent Utlegg" };

export default function ForgotPasswordPage() {
  return <AuthPanel title="Glemt passord?" description="Vi sender deg en lenke for å velge et nytt passord.">
    <PasswordResetRequestForm />
  </AuthPanel>;
}
