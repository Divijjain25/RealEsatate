"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchUnreadCount } from "@/app/(app)/notifications/actions";

const POLL_MS = 60_000;
// Fired by components that change read state on the same page.
export const NOTIFICATIONS_CHANGED = "leados:notifications-changed";

// Unread count, refreshed every minute, whenever the page changes, and
// when NOTIFICATIONS_CHANGED is dispatched.
export function NotificationBell() {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchUnreadCount()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [pathname]);

  return <BellLink count={count} />;
}

export function BellLink({ count }: { count: number | null }) {
  const label = count ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className="relative rounded-lg px-2.5 py-2 text-slate-600 hover:bg-slate-100"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" />
      </svg>
      {count ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
