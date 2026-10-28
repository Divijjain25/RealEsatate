import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { listMembers } from "@/lib/leads/queries";

import { LeadImporter } from "./lead-importer";

export const metadata: Metadata = { title: "Import leads · RealEstate LeadOS" };

export default function ImportLeadsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/leads" className="text-sm text-emerald-700 hover:underline">
          ← All leads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Import leads from CSV</h1>
        <p className="text-sm text-slate-600">
          Bring in leads from Excel or Google Sheets. Your file is read in this browser; only the rows you import are sent.
        </p>
      </div>
      <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
        <ImportGate />
      </Suspense>
    </div>
  );
}

async function ImportGate() {
  const { user, membership } = await getAgencyContext();
  if (!isManagerRole(membership.role)) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">
        Only owners and managers can import leads. Ask your agency owner to import the file for you.
      </p>
    );
  }
  const members = await listMembers(membership.agency.id);
  return <LeadImporter members={members.map((m) => ({ userId: m.userId, name: m.name }))} currentUserId={user.id} />;
}
