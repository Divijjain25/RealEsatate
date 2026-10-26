// Reads the two public Supabase settings. Both are safe to expose to the
// browser; the database is protected by Row Level Security, not by hiding them.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase settings missing. Copy .env.example to .env.local, fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, " +
        "then restart `npm run dev`. See docs/steps/step-01-auth-agency.md.",
    );
  }

  return { url, key };
}
