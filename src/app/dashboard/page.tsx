import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { logout } from "@/app/(auth)/actions";
import { getMyMembership, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard · RealEstate LeadOS" };

const ROLE_LABEL = { owner: "Owner", manager: "Manager", agent: "Agent" } as const;

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <Suspense fallback={<p className="text-slate-500">Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function DashboardContent() {
  const user = await requireUser();
  const membership = await getMyMembership(user.id);
  if (!membership) {
    redirect("/onboarding");
  }

  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">RealEstate LeadOS</p>
          <h1 className="text-2xl font-semibold text-slate-900">{membership.agency.name}</h1>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </form>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <InfoCard label="Signed in as" value={user.email ?? "—"} />
        <InfoCard label="Your role" value={ROLE_LABEL[membership.role]} />
        <InfoCard label="City" value={membership.agency.city ?? "—"} />
      </section>

      <section className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-slate-600">
        <p className="mb-1 font-medium text-slate-800">Coming next (not connected yet)</p>
        <p className="text-sm">
          Leads, follow-ups, site visits and reports will appear here in the next build steps.
          Nothing below this line is live yet.
        </p>
      </section>
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate font-medium text-slate-900">{value}</p>
    </div>
  );
}
