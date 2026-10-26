import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · RealEstate LeadOS" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Log in</h1>
      <p className="mb-6 text-sm text-slate-600">Welcome back. Your leads are waiting.</p>
      <LoginForm />
      <div className="mt-6 space-y-2 text-center text-sm">
        <p>
          <Link href="/forgot-password" className="text-emerald-700 hover:underline">
            Forgot password?
          </Link>
        </p>
        <p className="text-slate-600">
          New here?{" "}
          <Link href="/signup" className="font-medium text-emerald-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </>
  );
}
