"use client";

import { useTransition } from "react";

import { NOTIFICATIONS_CHANGED } from "@/components/notification-bell";

import { markAllRead } from "./actions";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllRead();
          window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
        })
      }
      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
    >
      {pending ? "Marking…" : "Mark all as read"}
    </button>
  );
}
