import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "./env";

// Supabase client for Server Components, Server Actions and Route Handlers.
// It acts as the logged-in user (from the session cookie), so every query
// goes through Row Level Security. Create a new one per request.
export async function createClient() {
  // Read cookies first: it marks the render as per-request, so Next.js never
  // tries to run this at build time.
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. That's fine: the proxy
          // (src/proxy.ts) refreshes the session on every request.
        }
      },
    },
  });
}
