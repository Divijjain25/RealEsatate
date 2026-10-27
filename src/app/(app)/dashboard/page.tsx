import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { StatusBadge, TemperatureBadge } from "@/components/lead-badges";
import { getAgencyContext } from "@/lib/auth";
import { formatIstDateTime, istDayRange } from "@/lib/dates";
import { leadsHref } from "@/lib/leads/filters";
import { getDashboardCounts, getPriorityLeads } from "@/lib/leads/queries";
import { formatBudget } from "@/lib/money";
import { phoneDigits } from "@/lib/phone";

export const metadata: Metadata = { title: "Dashboard · RealEstate LeadOS" };

const ROLE_LABEL = { owner: "Owner", manager: "Manager", agent: "Agent" } as const;

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading your dashboard…</p>}>
      <DashboardContent />
    </Suspense>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function DashboardContent() {
  const { user, membership } = await getAgencyContext();
  const [counts, priority] = await Promise.all([
    getDashboardCounts(membership.agency.id),
    getPriorityLeads(membership.agency.id),
  ]);
  const todayStart = istDayRange(new Date()).start.getTime();
  const scope = membership.role === "agent" ? "Your leads" : "All agency leads";

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-slate-500">
          {ROLE_LABEL[membership.role]} · {user.email} · {scope}
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">{membership.agency.name}</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Due today" value={counts.dueToday} href={leadsHref({ followUp: "today" })} tone="emerald" />
        <StatCard label="Overdue" value={counts.overdue} href={leadsHref({ followUp: "overdue" })} tone="red" />
        <StatCard label="No next action" value={counts.noFollowUp} href={leadsHref({ followUp: "none" })} tone="amber" />
        <StatCard label="New this week" value={counts.newThisWeek} href={leadsHref({ sort: "newest" })} />
        <StatCard label="Open leads" value={counts.active} href={leadsHref({ status: "active" })} />
        <StatCard label="Hot" value={counts.hot} href={leadsHref({ status: "active", temperature: "hot" })} tone="red" />
        <StatCard label="Warm" value={counts.warm} href={leadsHref({ status: "active", temperature: "warm" })} tone="amber" />
        <StatCard label="Cold" value={counts.cold} href={leadsHref({ status: "active", temperature: "cold" })} tone="sky" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Today&apos;s priority list</h2>
          <p className="text-xs text-slate-500">Due today or overdue · hot leads first</p>
        </div>
        {priority.length === 0 ? (
          <p className="text-sm text-slate-600">
            Nothing due right now. 🎉{" "}
            <Link href={leadsHref({ followUp: "none" })} className="text-emerald-700 hover:underline">
              Set follow-ups for leads without a next action
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {priority.map((lead) => {
              const overdue = lead.next_follow_up_at !== null && new Date(lead.next_follow_up_at).getTime() < todayStart;
              return (
                <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                      {lead.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <TemperatureBadge value={lead.temperature} />
                      <StatusBadge value={lead.status} />
                      <span>{formatBudget(lead.budget_min, lead.budget_max)}</span>
                      <span className={overdue ? "font-medium text-red-700" : ""}>
                        {overdue ? "Overdue since " : "Due "}
                        {formatIstDateTime(lead.next_follow_up_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`tel:+${phoneDigits(lead.phone_e164)}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${phoneDigits(lead.phone_e164)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      WhatsApp
                    </a>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border-2 border-dashed border-slate-300 p-5 text-slate-600">
        <p className="mb-1 font-medium text-slate-800">Coming next (not connected yet)</p>
        <p className="text-sm">
          Site visits, deals, conversion rate, properties and reports arrive in the next build steps.
        </p>
      </section>
    </div>
  );
}

const TONES = {
  slate: "text-slate-900",
  emerald: "text-emerald-700",
  red: "text-red-700",
  amber: "text-amber-700",
  sky: "text-sky-700",
} as const;

function StatCard({
  label,
  value,
  href,
  tone = "slate",
}: {
  label: string;
  value: number;
  href: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${TONES[tone]}`}>{value}</p>
    </Link>
  );
}
