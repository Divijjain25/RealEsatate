import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Notification = {
  id: string;
  type: "follow_up_due" | "daily_digest" | "lead_assigned" | "system_alert";
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export type SchedulerHealth = {
  last_run_at: string | null;
  runs_last_hour: number;
  queued: number;
  retrying: number;
  dead: number;
  recent_failures: Array<{ type: string; status: string; attempts: number; last_error: string | null; updated_at: string }>;
};

// RLS only returns the logged-in user's own notifications.
export async function listNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  return (data ?? []) as Notification[];
}

export async function countUnread(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw new Error(`Could not count notifications: ${error.message}`);
  return count ?? 0;
}

// Owners/managers only (the database function refuses everyone else).
export async function getSchedulerHealth(agencyId: string): Promise<SchedulerHealth | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("scheduler_health", { p_agency_id: agencyId });
  if (error) {
    console.error("scheduler_health failed", error.code, error.message);
    return null;
  }
  return data as SchedulerHealth;
}

// Only follow in-app paths stored on a notification.
export function safeAppPath(link: string | null): string {
  return link && link.startsWith("/") && !link.startsWith("//") && !link.includes("\\") ? link : "/notifications";
}
