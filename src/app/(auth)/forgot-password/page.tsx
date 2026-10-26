import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · RealEstate LeadOS" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Reset your password</h1>
      <p className="mb-6 text-sm text-slate-600">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <ForgotPasswordForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-emerald-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
