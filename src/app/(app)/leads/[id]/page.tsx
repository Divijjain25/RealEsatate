import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { StatusBadge, TemperatureBadge } from "@/components/lead-badges";
import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { formatIstDateTime, toIstLocalInput } from "@/lib/dates";
import {
  CALL_OUTCOMES,
  LEAD_PURPOSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  PROPERTY_TYPES,
  labelOf,
} from "@/lib/leads/constants";
import { getActivities, getLead, listMembers, type Activity, type Member } from "@/lib/leads/queries";
import { formatBudget } from "@/lib/money";
import { formatPhone, phoneDigits } from "@/lib/phone";

import { addActivity, deleteLead, quickUpdateLead } from "../actions";
import { ActivityForm, DeleteLeadButton, QuickUpdateForm } from "./lead-panels";

export const metadata: Metadata = { title: "Lead · RealEstate LeadOS" };

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading lead…</p>}>
      <LeadDetail params={params} />
    </Suspense>
  );
}

async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await getAgencyContext();
  const lead = await getLead(id);
  if (!lead) notFound();

  const [activities, members] = await Promise.all([getActivities(lead.id), listMembers(membership.agency.id)]);
  const canManage = isManagerRole(membership.role);
  const firstName = lead.name.split(/\s+/)[0];
  const whatsappText = `Namaste ${firstName}, this is from ${membership.agency.name} regarding your property enquiry.`;
  const digits = phoneDigits(lead.phone_e164);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leads" className="text-sm text-emerald-700 hover:underline">
          ← All leads
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">{lead.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{formatPhone(lead.phone_e164)}</span>
            <StatusBadge value={lead.status} />
            <TemperatureBadge value={lead.temperature} />
            <span>· {lead.assignee?.full_name ? `Assigned to ${lead.assignee.full_name}` : "Unassigned"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:+${digits}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Call
          </a>
          <a
            href={`https://wa.me/${digits}?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:brightness-95"
            title="Opens WhatsApp on this device with a ready message. You press Send."
          >
            WhatsApp
          </a>
          <Link href={`/leads/${lead.id}/edit`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Edit
          </Link>
          {canManage ? <DeleteLeadButton action={deleteLead.bind(null, lead.id)} /> : null}
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Update</h2>
        <QuickUpdateForm
          action={quickUpdateLead.bind(null, lead.id)}
          status={lead.status}
          temperature={lead.temperature}
          nextFollowUp={toIstLocalInput(lead.next_follow_up_at)}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail label="Looking to" value={labelOf(LEAD_PURPOSES, lead.purpose)} />
            <Detail label="Budget" value={formatBudget(lead.budget_min, lead.budget_max)} />
            <Detail label="Locations" value={lead.locations.join(", ") || "—"} />
            <Detail label="BHK" value={lead.bhk.join(", ") || "—"} />
            <Detail label="Property type" value={labelOf(PROPERTY_TYPES, lead.property_type)} />
            <Detail label="Source" value={labelOf(LEAD_SOURCES, lead.source)} />
            <Detail label="Next follow-up" value={formatIstDateTime(lead.next_follow_up_at)} />
            <Detail label="Last contacted" value={formatIstDateTime(lead.last_contacted_at)} />
            <Detail label="Alternate number" value={lead.alt_phone ? formatPhone(lead.alt_phone) : "—"} />
            <Detail label="Email" value={lead.email ?? "—"} />
            <Detail label="Added on" value={formatIstDateTime(lead.created_at)} />
            {lead.status === "lost" ? <Detail label="Lost reason" value={lead.lost_reason ?? "—"} /> : null}
          </dl>
          {lead.notes ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{lead.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-3">
          <h2 className="font-semibold text-slate-900">Timeline</h2>
          <ActivityForm action={addActivity.bind(null, lead.id)} />
          <ol className="space-y-3 border-t border-slate-100 pt-4">
            {activities.map((activity) => (
              <li key={activity.id} className="text-sm">
                <p className="text-slate-800">{describeActivity(activity, members)}</p>
                <p className="text-xs text-slate-500">
                  {activity.actor?.full_name ?? "System"} · {formatIstDateTime(activity.created_at)}
                </p>
              </li>
            ))}
            {activities.length === 0 ? <li className="text-sm text-slate-500">No activity yet.</li> : null}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}

function describeActivity(activity: Activity, members: Member[]): string {
  const d = activity.data as Record<string, string | null | undefined>;
  const memberName = (id: string | null | undefined) =>
    id ? (members.find((m) => m.userId === id)?.name ?? "a former member") : "nobody";

  switch (activity.type) {
    case "created":
      return `Lead added (source: ${labelOf(LEAD_SOURCES, d.source)})`;
    case "note":
      return d.text ?? "";
    case "call": {
      const outcome = labelOf(CALL_OUTCOMES, d.outcome);
      return d.text ? `📞 Call — ${outcome}: ${d.text}` : `📞 Call — ${outcome}`;
    }
    case "status_change":
      return `Status: ${labelOf(LEAD_STATUSES, d.from)} → ${labelOf(LEAD_STATUSES, d.to)}`;
    case "temperature_change":
      return `Temperature: ${labelOf(LEAD_TEMPERATURES, d.from)} → ${labelOf(LEAD_TEMPERATURES, d.to)}`;
    case "assignment":
      return `Assigned to ${memberName(d.to)}`;
    case "follow_up_set":
      return d.at ? `Next follow-up set for ${formatIstDateTime(d.at)}` : "Next follow-up cleared";
    case "deleted":
      return "Lead deleted";
    default:
      return activity.type;
  }
}
