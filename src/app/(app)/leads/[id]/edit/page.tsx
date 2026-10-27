import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { toIstLocalInput } from "@/lib/dates";
import { getLead, listMembers } from "@/lib/leads/queries";
import { formatRupees } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

import { updateLead } from "../../actions";
import { LeadForm } from "../../lead-form";

export const metadata: Metadata = { title: "Edit lead · RealEstate LeadOS" };

export default function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Edit lead</h1>
      <Suspense fallback={<p className="text-slate-500">Loading lead…</p>}>
        <EditLeadForm params={params} />
      </Suspense>
    </div>
  );
}

// Budgets go back into the form in the same short style agents type.
function rupeesInput(value: number | null) {
  return value === null ? "" : formatRupees(value).replace("₹", "").replace(/,/g, "");
}

async function EditLeadForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await getAgencyContext();
  const lead = await getLead(id);
  if (!lead) notFound();

  const canAssign = isManagerRole(membership.role);
  const members = canAssign ? await listMembers(membership.agency.id) : [];

  return (
    <LeadForm
      action={updateLead.bind(null, lead.id)}
      initial={{
        name: lead.name,
        phone: formatPhone(lead.phone_e164),
        altPhone: lead.alt_phone ? formatPhone(lead.alt_phone) : "",
        email: lead.email ?? "",
        purpose: lead.purpose,
        budgetMin: rupeesInput(lead.budget_min),
        budgetMax: rupeesInput(lead.budget_max),
        locations: lead.locations.join(", "),
        bhk: lead.bhk.join(","),
        propertyType: lead.property_type ?? "",
        source: lead.source,
        status: lead.status,
        temperature: lead.temperature,
        assignedTo: lead.assigned_to ?? "",
        nextFollowUp: toIstLocalInput(lead.next_follow_up_at),
        notes: lead.notes ?? "",
        lostReason: lead.lost_reason ?? "",
      }}
      members={members}
      canAssign={canAssign}
      submitLabel="Save changes"
      cancelHref={`/leads/${lead.id}`}
    />
  );
}
