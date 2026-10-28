"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
];

// Highlights the current section. Reading the URL happens at request time,
// so the layout wraps this in <Suspense> with <NavLinksFallback /> (no highlight).
export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}

export function NavLinksFallback() {
  return <NavList pathname={null} />;
}

function NavList({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-1">
      {LINKS.map((link) => {
        const active = pathname !== null && (pathname === link.href || pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium sm:px-3 ${
              active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
