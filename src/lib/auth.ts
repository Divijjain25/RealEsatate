import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type MemberRole = "owner" | "manager" | "agent";

export type CurrentUser = {
  id: string;
  email: string | null;
};

export type Membership = {
  role: MemberRole;
  agency: {
    id: string;
    name: string;
    city: string | null;
  };
};

// Data Access Layer: the only place pages ask "who is logged in?".
// Redirects to /login when there is no valid session.
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/login");
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

// The current user's active agency membership, or null if they have not
// created/joined an agency yet. RLS guarantees only their own agencies
// can come back; the user_id filter skips teammates' rows.
export async function getMyMembership(userId: string): Promise<Membership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, agency:agencies(id, name, city)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load membership: ${error.message}`);
  }
  if (!data || !data.agency) {
    return null;
  }

  return data as unknown as Membership;
}

// For pages and actions inside the app: the logged-in user plus their
// agency. Sends people without an agency to onboarding.
export async function getAgencyContext(): Promise<{ user: CurrentUser; membership: Membership }> {
  const user = await requireUser();
  const membership = await getMyMembership(user.id);
  if (!membership) {
    redirect("/onboarding");
  }
  return { user, membership };
}

export function isManagerRole(role: MemberRole) {
  return role === "owner" || role === "manager";
}
