import type { Metadata } from "next";
import { Suspense } from "react";

import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { listMembers } from "@/lib/leads/queries";

import { createLead } from "../actions";
import { LeadForm } from "../lead-form";

export const metadata: Metadata = { title: "Add lead · RealEstate LeadOS" };

export default function NewLeadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Add lead</h1>
      <Suspense fallback={<p className="text-slate-500">Loading form…</p>}>
        <NewLeadForm />
      </Suspense>
    </div>
  );
}

async function NewLeadForm() {
  const { user, membership } = await getAgencyContext();
  const canAssign = isManagerRole(membership.role);
  const members = canAssign ? await listMembers(membership.agency.id) : [];

  return (
    <LeadForm
      action={createLead}
      initial={{ purpose: "buy", source: "other", status: "new", temperature: "warm", assignedTo: user.id }}
      members={members}
      canAssign={canAssign}
      submitLabel="Save lead"
      cancelHref="/leads"
    />
  );
}
