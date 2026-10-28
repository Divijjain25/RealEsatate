import Link from "next/link";
import { Suspense } from "react";

import { logout } from "@/app/(auth)/actions";
import { NavLinks, NavLinksFallback } from "@/components/nav-links";
import { BellLink, NotificationBell } from "@/components/notification-bell";

// Shared frame for logged-in pages. It reads no session data itself, so it
// renders instantly; each page loads its own data behind <Suspense>.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-3 py-2 sm:gap-3 sm:px-4">
          <Link href="/dashboard" className="mr-2 hidden font-semibold text-emerald-800 sm:block">
            LeadOS
          </Link>
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks />
          </Suspense>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/leads/new"
              className="whitespace-nowrap rounded-lg bg-emerald-700 px-2.5 py-2 text-sm font-medium text-white hover:bg-emerald-800 sm:px-3"
            >
              + <span className="hidden sm:inline">Add </span>lead
            </Link>
            <Suspense fallback={<BellLink count={null} />}>
              <NotificationBell />
            </Suspense>
            <form action={logout}>
              <button
                type="submit"
                className="whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:px-3"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
