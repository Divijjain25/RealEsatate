import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getMyMembership, requireUser } from "@/lib/auth";

import { CreateAgencyForm } from "./create-agency-form";

export const metadata: Metadata = { title: "Create your agency · RealEstate LeadOS" };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Create your agency</h1>
        <p className="mb-6 text-sm text-slate-600">
          You&apos;ll be the owner. You can invite your team later.
        </p>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <OnboardingGate />
        </Suspense>
      </div>
    </main>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function OnboardingGate() {
  const user = await requireUser();
  const membership = await getMyMembership(user.id);
  if (membership) {
    redirect("/dashboard");
  }
  return <CreateAgencyForm />;
}
