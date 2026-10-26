import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Link problem · RealEstate LeadOS" };

export default function AuthErrorPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">That link didn&apos;t work</h1>
      <p className="mb-6 max-w-sm text-slate-600">
        It may have expired or already been used, or it was opened in a different browser
        from the one you signed up in. Please try again.
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="font-medium text-emerald-700 hover:underline">
          Log in
        </Link>
        <Link href="/forgot-password" className="font-medium text-emerald-700 hover:underline">
          Reset password
        </Link>
      </div>
    </main>
  );
}
