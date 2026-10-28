"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { countUnread, safeAppPath } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

// Polled by the 🔔 bell. Returns 0 instead of redirecting when logged out.
export async function fetchUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return 0;
  return countUnread();
}

// Clicking a notification: mark it read, then go where it points.
export async function openNotification(id: string): Promise<void> {
  await requireUser();
  if (!z.guid().safeParse(id).success) redirect("/notifications");

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select("link")
    .maybeSingle();
  redirect(safeAppPath(data?.link ?? null));
}

export async function markAllRead(): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) console.error("markAllRead failed", error.code, error.message);
  refresh();
}
