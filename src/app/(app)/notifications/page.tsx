import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { formatIstDateTime } from "@/lib/dates";
import { listNotifications, type Notification } from "@/lib/notifications";

import { openNotification } from "./actions";
import { MarkAllReadButton } from "./mark-all-read-button";

export const metadata: Metadata = { title: "Notifications · RealEstate LeadOS" };

const ICON: Record<Notification["type"], string> = {
  follow_up_due: "⏰",
  daily_digest: "☀️",
  lead_assigned: "👤",
  system_alert: "⚠️",
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
      <Suspense fallback={<p className="text-slate-500">Loading notifications…</p>}>
        <NotificationList />
      </Suspense>
    </div>
  );
}

async function NotificationList() {
  await requireUser();
  const notifications = await listNotifications();
  const unread = notifications.filter((n) => !n.read_at).length;

  if (notifications.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-600">
        <p className="font-medium text-slate-800">No notifications yet.</p>
        <p className="mt-1 text-sm">
          Follow-up reminders, new assignments and your 8:30 AM summary will show up here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread ? <MarkAllReadButton /> : null}
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {notifications.map((n) => (
          <li key={n.id}>
            <form action={openNotification.bind(null, n.id)}>
              <button
                type="submit"
                className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read_at ? "" : "bg-emerald-50/60"}`}
              >
                <span aria-hidden="true" className="text-lg">{ICON[n.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.read_at ? "text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</span>
                  {n.body ? <span className="block text-sm text-slate-600">{n.body}</span> : null}
                  <span className="block text-xs text-slate-500">{formatIstDateTime(n.created_at)}</span>
                </span>
                {n.read_at ? null : <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-label="Unread" />}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
