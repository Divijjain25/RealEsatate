import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "./env";

// Pages that need a logged-in user.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/reset-password"];
// Pages that make no sense once you're logged in.
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Runs before every page request: refreshes the Supabase session cookie and
// does quick login redirects. Real authorization still happens in the
// database (RLS) and in each Server Action.
export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });
  // No-cache headers Supabase asks for whenever it writes auth cookies.
  const authHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        Object.assign(authHeaders, headers);
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(authHeaders).forEach(([header, value]) =>
          response.headers.set(header, value),
        );
      },
    },
  });

  // Do not put code between createServerClient and getClaims: getClaims is
  // what validates and, if needed, refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!isLoggedIn && matches(pathname, PROTECTED_PREFIXES)) {
    return redirectTo(request, "/login", response, authHeaders);
  }
  if (isLoggedIn && matches(pathname, AUTH_PAGES)) {
    return redirectTo(request, "/dashboard", response, authHeaders);
  }

  return response;
}

// A redirect that still carries any refreshed auth cookies (and their
// no-cache headers), so the user isn't logged out by the redirect itself.
function redirectTo(
  request: NextRequest,
  pathname: string,
  from: NextResponse,
  authHeaders: Record<string, string>,
) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  const redirect = NextResponse.redirect(target);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(authHeaders).forEach(([header, value]) =>
    redirect.headers.set(header, value),
  );
  return redirect;
}
