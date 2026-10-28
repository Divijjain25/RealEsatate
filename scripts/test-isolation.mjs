// End-to-end agency isolation test against YOUR Supabase dev project.
//
//   npm run test:isolation -- your-email@gmail.com
//
// It signs up two throwaway users (your-email+leadosA…@ / +leadosB…@ — Gmail
// delivers "+anything" addresses to your normal inbox), each creates an
// agency, and then each tries to read or change the other's data through the
// public API, exactly like a real (malicious) user could.
//
// Needs "Confirm email" turned OFF in the dev project (see the Step 1 guide).
// Uses only the public publishable key from .env.local — no secret keys.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const baseEmail = process.argv[2];

if (!url || !key) {
  console.error("❌ .env.local mein NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY nahi mile.");
  process.exit(1);
}
if (!baseEmail || !/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(baseEmail)) {
  console.error("❌ Apna email do, jaise:  npm run test:isolation -- yourname@gmail.com");
  process.exit(1);
}

const [localPart, domain] = baseEmail.split("@");
const runId = Date.now().toString(36);
const password = `Test-${crypto.randomUUID()}`;

let failures = 0;
function check(ok, message) {
  if (ok) {
    console.log(`  ✅ ${message}`);
  } else {
    failures += 1;
    console.log(`  ❌ ${message}`);
  }
}

function newClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function makeUser(label) {
  const client = newClient();
  const email = `${localPart}+leados${label}${runId}@${domain}`;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: `Isolation Test ${label}` } },
  });
  if (error) {
    throw new Error(`Signup failed for user ${label}: ${error.code ?? ""} ${error.message}`);
  }
  if (!data.session) {
    throw new Error(
      'Signup worked but no session came back — "Confirm email" is still ON in Supabase. ' +
        "Turn it off for the dev project (Step 1 guide, Part C) and run again.",
    );
  }
  const { data: agencyId, error: rpcError } = await client.rpc("create_agency", {
    p_name: `Isolation Test Agency ${label} ${runId}`,
    p_city: "Test City",
    p_phone: null,
  });
  if (rpcError) {
    throw new Error(`create_agency failed for user ${label}: ${rpcError.message}`);
  }
  return { client, email, userId: data.user.id, agencyId };
}

async function main() {
  console.log("== Step 1 isolation test (live Supabase) ==");
  console.log(`Run id: ${runId}\n`);

  const a = await makeUser("A");
  const b = await makeUser("B");
  console.log(`Created test users:\n  A = ${a.email}\n  B = ${b.email}\n`);

  console.log("[User A]");
  {
    const { data, error } = await a.client.from("agencies").select("id, name");
    check(!error && data.length === 1 && data[0].id === a.agencyId, "A sees exactly its own agency");
  }
  {
    const { data } = await a.client.from("agencies").select("id").eq("id", b.agencyId);
    check(data?.length === 0, "A cannot read Agency B by id");
  }
  {
    const { data } = await a.client.from("memberships").select("agency_id, user_id");
    check(
      data?.length === 1 && data[0].agency_id === a.agencyId && data[0].user_id === a.userId,
      "A sees only its own membership",
    );
  }
  {
    const { data } = await a.client.from("profiles").select("id").eq("id", b.userId);
    check(data?.length === 0, "A cannot read B's profile");
  }
  {
    const { data, error } = await a.client
      .from("agencies")
      .update({ name: "Hacked by A" })
      .eq("id", b.agencyId)
      .select("id");
    check(!error && data.length === 0, "A cannot rename Agency B (0 rows changed)");
  }
  {
    const { error } = await a.client
      .from("memberships")
      .insert({ agency_id: b.agencyId, user_id: a.userId, role: "owner" });
    check(Boolean(error), "A cannot add itself to Agency B");
  }
  {
    const { error } = await a.client.from("agencies").insert({ name: "Sneaky Agency" });
    check(Boolean(error), "A cannot insert an agency directly");
  }
  {
    const { error } = await a.client.from("agencies").update({ plan: "enterprise" }).eq("id", a.agencyId);
    check(Boolean(error), "A cannot change its own billing plan");
  }
  {
    const { error } = await a.client.rpc("create_agency", { p_name: "Second agency" });
    check(error?.message === "already_member", "A cannot create a second agency");
  }

  console.log("\n[User B]");
  {
    const { data } = await b.client.from("agencies").select("id, name");
    check(
      data?.length === 1 && data[0].id === b.agencyId && !data[0].name.startsWith("Hacked"),
      "B sees only Agency B, name unchanged",
    );
  }

  console.log("\n[Leads — Step 2]");
  const leadPhone = `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const { data: leadA, error: leadError } = await a.client
    .from("leads")
    .insert({ agency_id: a.agencyId, name: `Isolation Lead ${runId}`, phone_e164: leadPhone, assigned_to: a.userId })
    .select("id")
    .single();
  if (leadError) {
    check(false, `A can create a lead (${leadError.message} — did you run the Step 2 migration?)`);
  } else {
    check(true, "A can create a lead");
    {
      const { data } = await a.client.from("lead_activities").select("type").eq("lead_id", leadA.id);
      check(data?.some((row) => row.type === "created"), "A's new lead has a 'created' timeline entry");
    }
    {
      const { data } = await b.client.from("leads").select("id").eq("id", leadA.id);
      check(data?.length === 0, "B cannot read A's lead");
    }
    {
      const { data } = await b.client.from("lead_activities").select("id").eq("lead_id", leadA.id);
      check(data?.length === 0, "B cannot read A's lead timeline");
    }
    {
      const { data, error } = await b.client.from("leads").update({ name: "Hacked by B" }).eq("id", leadA.id).select("id");
      check(!error && data.length === 0, "B cannot edit A's lead (0 rows changed)");
    }
    {
      const { data } = await b.client.rpc("delete_leads", { p_ids: [leadA.id] });
      check(data === 0, "B cannot delete A's lead");
    }
    {
      const { error } = await b.client
        .from("lead_activities")
        .insert({ agency_id: a.agencyId, lead_id: leadA.id, type: "note", data: { text: "spam" } });
      check(Boolean(error), "B cannot add a note to A's lead");
    }
    {
      const { error } = await b.client
        .from("leads")
        .insert({ agency_id: a.agencyId, name: "Planted by B", phone_e164: "+919000000001" });
      check(Boolean(error), "B cannot create a lead inside Agency A");
    }
    {
      const { data } = await b.client.rpc("find_lead_by_phone", { p_agency_id: a.agencyId, p_phone: leadPhone });
      check(!data || data.length === 0, "B cannot look up phone numbers in Agency A");
    }
    {
      const { error } = await a.client
        .from("leads")
        .insert({ agency_id: a.agencyId, name: "Duplicate", phone_e164: leadPhone, assigned_to: a.userId });
      check(error?.code === "23505", "the same phone can't be added twice in one agency");
    }
    {
      const { data } = await a.client.from("leads").select("name").eq("id", leadA.id).single();
      check(data?.name === `Isolation Lead ${runId}`, "A's lead is unchanged after B's attempts");
    }
  }

  console.log("\n[CSV import — Step 2b]");
  {
    const phone = `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const { data, error } = await a.client.rpc("import_leads", {
      p_agency_id: a.agencyId,
      p_leads: [
        { name: `Imported ${runId}`, phone_e164: phone, assigned_to: a.userId },
        { name: "Repeat", phone_e164: phone, assigned_to: a.userId },
      ],
    });
    if (error) {
      check(false, `A can import leads (${error.message} — did you run the Step 2b migration?)`);
    } else {
      check(data?.[0]?.result === "imported", "A can import a lead");
      check(data?.[1]?.result === "duplicate", "import skips a number that already exists");
    }
    const { data: planted } = await b.client.rpc("import_leads", {
      p_agency_id: a.agencyId,
      p_leads: [{ name: "Planted by B", phone_e164: "+919000000002" }],
    });
    check(planted?.[0]?.result === "error", "B cannot import leads into Agency A");
    const { error: anonError } = await newClient().rpc("import_leads", { p_agency_id: a.agencyId, p_leads: [] });
    check(Boolean(anonError), "logged-out visitor cannot import");
  }

  console.log("\n[Logged out]");
  {
    const anon = newClient();
    const { data, error } = await anon.from("agencies").select("id");
    check(Boolean(error) || data.length === 0, "logged-out visitor sees no agencies");
    const { error: rpcError } = await anon.rpc("create_agency", { p_name: "Anon agency" });
    check(Boolean(rpcError), "logged-out visitor cannot create an agency");
    const { data: leads, error: leadsError } = await anon.from("leads").select("id");
    check(Boolean(leadsError) || leads.length === 0, "logged-out visitor sees no leads");
  }

  console.log(
    failures === 0
      ? "\n🎉 ALL ISOLATION CHECKS PASSED"
      : `\n❌ ${failures} check(s) FAILED — copy this whole output and send it to Claude.`,
  );
  console.log(
    "\nTest data cleanup (optional): Supabase → Authentication → Users → delete the two\n" +
      `"+leados…${runId}" users, then SQL Editor:  delete from agencies where name like 'Isolation Test Agency %';\n` +
      "(deleting an agency also deletes its leads and timeline)",
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n❌ Test could not run: ${error.message}`);
  process.exit(1);
});
