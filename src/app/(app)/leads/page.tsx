import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { StatusBadge, TemperatureBadge } from "@/components/lead-badges";
import { getAgencyContext, isManagerRole } from "@/lib/auth";
import { formatIstDateTime, istDayRange } from "@/lib/dates";
import { CLOSED_STATUSES, LEAD_SOURCES, LEAD_STATUSES, LEAD_TEMPERATURES } from "@/lib/leads/constants";
import {
  FOLLOW_UP_OPTIONS,
  PAGE_SIZE,
  SORT_OPTIONS,
  leadsHref,
  parseLeadFilters,
  type LeadFilters,
} from "@/lib/leads/filters";
import { listLeads, listMembers, type LeadListItem } from "@/lib/leads/queries";
import { formatBudget } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

import { BULK_FORM_ID, BulkBar, SelectAllCheckbox } from "./bulk-bar";

export const metadata: Metadata = { title: "Leads · RealEstate LeadOS" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
      <Suspense fallback={<p className="text-slate-500">Loading leads…</p>}>
        <LeadsView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

async function LeadsView({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseLeadFilters(await searchParams);
  const { user, membership } = await getAgencyContext();
  const canManage = isManagerRole(membership.role);
  const [members, { rows, total }] = await Promise.all([
    listMembers(membership.agency.id),
    listLeads(membership.agency.id, user.id, filters),
  ]);
  const todayStart = istDayRange(new Date()).start.getTime();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = leadsHref({ ...filters, sort: "follow_up", page: 1 }) !== "/leads";

  return (
    <>
      <Form action="/leads" className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Search name or phone"
          className={`${selectClass} min-w-48 flex-1`}
        />
        <select name="status" defaultValue={filters.status ?? ""} className={selectClass} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Open (not won/lost)</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="temperature" defaultValue={filters.temperature ?? ""} className={selectClass} aria-label="Temperature">
          <option value="">Hot / warm / cold</option>
          {LEAD_TEMPERATURES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="followUp" defaultValue={filters.followUp ?? ""} className={selectClass} aria-label="Follow-up">
          <option value="">Any follow-up</option>
          {FOLLOW_UP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source ?? ""} className={selectClass} aria-label="Source">
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="assigned" defaultValue={filters.assigned ?? ""} className={selectClass} aria-label="Assigned to">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          {canManage ? <option value="unassigned">Unassigned</option> : null}
          {canManage
            ? members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))
            : null}
        </select>
        <select name="sort" defaultValue={filters.sort} className={selectClass} aria-label="Sort by">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
          Apply
        </button>
        {hasFilters ? (
          <Link href="/leads" className="px-2 py-2 text-sm text-slate-600 hover:underline">
            Clear
          </Link>
        ) : null}
      </Form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {total} lead{total === 1 ? "" : "s"}
          {hasFilters ? " match these filters" : ""}
        </p>
        {canManage && rows.length > 0 ? <BulkBar members={members} /> : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {canManage ? (
                  <th className="w-10 px-3 py-3">
                    <SelectAllCheckbox />
                  </th>
                ) : null}
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Budget</th>
                <th className="px-3 py-3">Looking for</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Next follow-up</th>
                <th className="px-3 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((lead) => (
                <LeadRow key={lead.id} lead={lead} canManage={canManage} todayStart={todayStart} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? <Pagination filters={filters} pages={pages} /> : null}
    </>
  );
}

function LeadRow({ lead, canManage, todayStart }: { lead: LeadListItem; canManage: boolean; todayStart: number }) {
  const open = !CLOSED_STATUSES.includes(lead.status);
  const followUp = lead.next_follow_up_at ? new Date(lead.next_follow_up_at).getTime() : null;
  const overdue = open && followUp !== null && followUp < todayStart;

  return (
    <tr className="hover:bg-slate-50">
      {canManage ? (
        <td className="px-3 py-3">
          <input type="checkbox" name="ids" value={lead.id} form={BULK_FORM_ID} aria-label={`Select ${lead.name}`} />
        </td>
      ) : null}
      <td className="px-3 py-3">
        <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-emerald-700 hover:underline">
          {lead.name}
        </Link>
        <p className="text-xs text-slate-500">{formatPhone(lead.phone_e164)}</p>
      </td>
      <td className="px-3 py-3 text-slate-700">{formatBudget(lead.budget_min, lead.budget_max)}</td>
      <td className="px-3 py-3 text-slate-700">
        {[lead.bhk.join("/"), lead.locations.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || "—"}
      </td>
      <td className="space-x-1 px-3 py-3">
        <StatusBadge value={lead.status} />
        <TemperatureBadge value={lead.temperature} />
      </td>
      <td className={`px-3 py-3 ${overdue ? "font-medium text-red-700" : "text-slate-700"}`}>
        {lead.next_follow_up_at ? formatIstDateTime(lead.next_follow_up_at) : open ? "Not set" : "—"}
        {overdue ? " · overdue" : ""}
      </td>
      <td className="px-3 py-3 text-slate-700">{lead.assignee?.full_name ?? "Unassigned"}</td>
    </tr>
  );
}

function Pagination({ filters, pages }: { filters: LeadFilters; pages: number }) {
  const linkClass = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50";
  return (
    <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Pages">
      {filters.page > 1 ? (
        <Link href={leadsHref({ ...filters, page: filters.page - 1 })} className={linkClass}>
          ← Previous
        </Link>
      ) : null}
      <span className="text-slate-600">
        Page {Math.min(filters.page, pages)} of {pages}
      </span>
      {filters.page < pages ? (
        <Link href={leadsHref({ ...filters, page: filters.page + 1 })} className={linkClass}>
          Next →
        </Link>
      ) : null}
    </nav>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center">
      {hasFilters ? (
        <>
          <p className="font-medium text-slate-800">No leads match these filters.</p>
          <Link href="/leads" className="mt-2 inline-block text-sm text-emerald-700 hover:underline">
            Clear filters
          </Link>
        </>
      ) : (
        <>
          <p className="font-medium text-slate-800">No leads yet.</p>
          <p className="mt-1 text-sm text-slate-600">Add your first lead to start tracking follow-ups.</p>
          <Link
            href="/leads/new"
            className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            + Add lead
          </Link>
        </>
      )}
    </div>
  );
}
