import "server-only";

import type { MemberRole } from "@/lib/auth";
import { istDayRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

import { CLOSED_STATUSES, type LeadStatus, type LeadTemperature } from "./constants";
import { PAGE_SIZE, searchKind, type LeadFilters } from "./filters";

// All reads go through the logged-in user's Supabase client, so Row Level
// Security decides what comes back (agents only get their own leads).

export type Lead = {
  id: string;
  agency_id: string;
  name: string;
  phone_e164: string;
  alt_phone: string | null;
  email: string | null;
  purpose: string;
  budget_min: number | null;
  budget_max: number | null;
  locations: string[];
  bhk: string[];
  property_type: string | null;
  source: string;
  status: LeadStatus;
  temperature: LeadTemperature;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  assignee: { full_name: string | null } | null;
};

export type LeadListItem = Pick<
  Lead,
  | "id" | "name" | "phone_e164" | "budget_min" | "budget_max" | "locations" | "bhk"
  | "source" | "status" | "temperature" | "assigned_to" | "next_follow_up_at" | "assignee"
>;

export type Activity = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string | null } | null;
};

export type Member = { userId: string; name: string; role: MemberRole };

const LIST_COLUMNS =
  "id, name, phone_e164, budget_min, budget_max, locations, bhk, source, status, temperature, " +
  "assigned_to, next_follow_up_at, assignee:profiles!leads_assigned_to_fkey(full_name)";

const CLOSED = `(${CLOSED_STATUSES.join(",")})`;

export async function listMembers(agencyId: string): Promise<Member[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, profile:profiles(full_name)")
    .eq("agency_id", agencyId)
    .eq("status", "active");
  if (error) throw new Error(`Could not load team: ${error.message}`);

  const rows = data as unknown as Array<{ user_id: string; role: MemberRole; profile: { full_name: string | null } | null }>;
  return rows
    .map((r) => ({ userId: r.user_id, role: r.role, name: r.profile?.full_name || "Unnamed member" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listLeads(
  agencyId: string,
  userId: string,
  filters: LeadFilters,
): Promise<{ rows: LeadListItem[]; total: number }> {
  const supabase = await createClient();
  let query = supabase.from("leads").select(LIST_COLUMNS, { count: "exact" }).eq("agency_id", agencyId);

  const search = searchKind(filters.q);
  if (search?.field === "phone") query = query.ilike("phone_e164", `%${search.digits}%`);
  if (search?.field === "name") query = query.ilike("name", `%${search.text}%`);

  if (filters.status === "active") query = query.not("status", "in", CLOSED);
  else if (filters.status) query = query.eq("status", filters.status);
  if (filters.temperature) query = query.eq("temperature", filters.temperature);
  if (filters.source) query = query.eq("source", filters.source);

  if (filters.assigned === "me") query = query.eq("assigned_to", userId);
  else if (filters.assigned === "unassigned") query = query.is("assigned_to", null);
  else if (filters.assigned) query = query.eq("assigned_to", filters.assigned);

  if (filters.followUp) {
    const now = new Date();
    const today = istDayRange(now);
    if (filters.followUp === "none") {
      query = query.is("next_follow_up_at", null).not("status", "in", CLOSED);
    } else if (filters.followUp === "overdue") {
      query = query.lt("next_follow_up_at", today.start.toISOString()).not("status", "in", CLOSED);
    } else if (filters.followUp === "today") {
      query = query
        .gte("next_follow_up_at", today.start.toISOString())
        .lt("next_follow_up_at", today.end.toISOString())
        .not("status", "in", CLOSED);
    } else if (filters.followUp === "week") {
      const weekEnd = new Date(today.start.getTime() + 7 * 24 * 60 * 60 * 1000);
      query = query
        .gte("next_follow_up_at", today.start.toISOString())
        .lt("next_follow_up_at", weekEnd.toISOString())
        .not("status", "in", CLOSED);
    }
  }

  if (filters.sort === "newest") query = query.order("created_at", { ascending: false });
  else if (filters.sort === "budget") query = query.order("budget_max", { ascending: false, nullsFirst: false });
  else if (filters.sort === "name") query = query.order("name", { ascending: true });
  else query = query.order("next_follow_up_at", { ascending: true, nullsFirst: false });
  query = query.order("created_at", { ascending: false });

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) {
    // Asking for a page past the end returns "Requested range not satisfiable".
    if (error.code === "PGRST103") return { rows: [], total: count ?? 0 };
    throw new Error(`Could not load leads: ${error.message}`);
  }
  return { rows: (data ?? []) as unknown as LeadListItem[], total: count ?? 0 };
}

export async function getLead(id: string): Promise<Lead | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*, assignee:profiles!leads_assigned_to_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load lead: ${error.message}`);
  return data as unknown as Lead | null;
}

export async function getActivities(leadId: string): Promise<Activity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select("id, type, data, created_at, actor:profiles(full_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load timeline: ${error.message}`);
  return (data ?? []) as unknown as Activity[];
}

export type DashboardCounts = {
  active: number;
  hot: number;
  warm: number;
  cold: number;
  dueToday: number;
  overdue: number;
  noFollowUp: number;
  newThisWeek: number;
};

export async function getDashboardCounts(agencyId: string): Promise<DashboardCounts> {
  const supabase = await createClient();
  const today = istDayRange(new Date());
  const weekAgo = new Date(today.start.getTime() - 6 * 24 * 60 * 60 * 1000);

  const active = () =>
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .not("status", "in", CLOSED);

  const results = await Promise.all([
    active(),
    active().eq("temperature", "hot"),
    active().eq("temperature", "warm"),
    active().eq("temperature", "cold"),
    active().gte("next_follow_up_at", today.start.toISOString()).lt("next_follow_up_at", today.end.toISOString()),
    active().lt("next_follow_up_at", today.start.toISOString()),
    active().is("next_follow_up_at", null),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .gte("created_at", weekAgo.toISOString()),
  ]);

  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Could not load dashboard: ${failed.error.message}`);
  const [a, hot, warm, cold, dueToday, overdue, noFollowUp, newThisWeek] = results.map((r) => r.count ?? 0);
  return { active: a, hot, warm, cold, dueToday, overdue, noFollowUp, newThisWeek };
}

// "Aaj ki priority list": open leads due today or earlier, hot first, then
// the longest-waiting. Rule-based for now; the AI assistant comes later.
export async function getPriorityLeads(agencyId: string): Promise<LeadListItem[]> {
  const supabase = await createClient();
  const today = istDayRange(new Date());
  const { data, error } = await supabase
    .from("leads")
    .select(LIST_COLUMNS)
    .eq("agency_id", agencyId)
    .not("status", "in", CLOSED)
    .lt("next_follow_up_at", today.end.toISOString())
    .order("temperature", { ascending: true })
    .order("next_follow_up_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`Could not load priority list: ${error.message}`);
  return (data ?? []) as unknown as LeadListItem[];
}
