import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Email links (signup confirmation, password reset) land here with a one-time
// ?code=... . We swap it for a session cookie, then continue to ?next=.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("Auth callback failed", error.code, error.message);
  }

  return NextResponse.redirect(new URL("/auth/error", origin));
}

// Only allow same-site relative paths, so the link can't bounce users elsewhere.
function safeNextPath(next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    return next;
  }
  return "/dashboard";
}
