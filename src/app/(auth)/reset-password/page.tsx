import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set new password · RealEstate LeadOS" };

// Reached from the email reset link (via /auth/callback, which logs the user in).
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Set a new password</h1>
      <p className="mb-6 text-sm text-slate-600">Choose a password you don&apos;t use elsewhere.</p>
      <ResetPasswordForm />
    </>
  );
}
