-- Step 2 RLS tests for leads + lead_activities (local PostgreSQL, run by
-- scripts/test-db-local.sh after all migrations). Self-contained: creates
-- its own users and agencies.
\set ON_ERROR_STOP 1
\set QUIET 1

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;
create or replace function tests.check(ok boolean, msg text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end;
$$;
grant execute on function tests.check(boolean, text) to anon, authenticated;

-- Agency A: owner O, agents G1 and G2.  Agency B: owner X.
insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-00000000000a', 'owner@a.test', '{"full_name": "Owner A"}'),
  ('10000000-0000-0000-0000-0000000000a1', 'agent1@a.test', '{"full_name": "Agent One"}'),
  ('10000000-0000-0000-0000-0000000000a2', 'agent2@a.test', '{"full_name": "Agent Two"}'),
  ('20000000-0000-0000-0000-00000000000b', 'owner@b.test', '{"full_name": "Owner B"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000000a', false);
select public.create_agency('Leads Agency A', 'Pune', null) as agency_a \gset
select set_config('tests.agency_a', :'agency_a', false) \gset
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-00000000000b', false);
select public.create_agency('Leads Agency B', 'Delhi', null) as agency_b \gset
select set_config('tests.agency_b', :'agency_b', false) \gset
reset role;

-- Agents join agency A (invites come in Step 6; inserted directly here).
insert into public.memberships (agency_id, user_id, role) values
  (:'agency_a', '10000000-0000-0000-0000-0000000000a1', 'agent'),
  (:'agency_a', '10000000-0000-0000-0000-0000000000a2', 'agent');

-- ---------------- Owner A creates leads ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000000a', false);

insert into public.leads (agency_id, name, phone_e164, assigned_to, temperature)
values (:'agency_a', 'Lead for Agent One', '+919800000001', '10000000-0000-0000-0000-0000000000a1', 'hot')
returning id as lead_g1 \gset
select set_config('tests.lead_g1', :'lead_g1', false) \gset

insert into public.leads (agency_id, name, phone_e164, assigned_to)
values (:'agency_a', 'Lead for Agent Two', '+919800000002', '10000000-0000-0000-0000-0000000000a2')
returning id as lead_g2 \gset

insert into public.leads (agency_id, name, phone_e164)
values (:'agency_a', 'Unassigned lead', '+919800000003')
returning id as lead_open \gset

select tests.check((select count(*) from public.leads) = 3, 'owner sees all 3 agency leads');
select tests.check(
  (select created_by from public.leads where id = :'lead_g1') = '10000000-0000-0000-0000-00000000000a',
  'created_by is set automatically');
select tests.check(
  (select count(*) from public.lead_activities where lead_id = :'lead_g1' and type = 'created') = 1,
  'creating a lead writes a "created" timeline entry');

do $$
begin
  begin
    insert into public.leads (agency_id, name, phone_e164)
    values (current_setting('tests.agency_a')::uuid, 'Duplicate', '+919800000001');
    raise exception 'FAIL: duplicate phone accepted';
  exception when unique_violation then
    raise notice 'PASS: duplicate phone in the same agency is rejected';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.leads (agency_id, name, phone_e164, assigned_to)
    values (current_setting('tests.agency_a')::uuid, 'Bad assignee', '+919800000009',
            '20000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: lead assigned to a user from another agency';
  exception when check_violation then
    raise notice 'PASS: cannot assign a lead to someone outside the agency';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.leads (agency_id, name, phone_e164, budget_min, budget_max)
    values (current_setting('tests.agency_a')::uuid, 'Bad budget', '+919800000010', 9000000, 5000000);
    raise exception 'FAIL: budget_min > budget_max accepted';
  exception when check_violation then
    raise notice 'PASS: budget min greater than max is rejected';
  end;
end;
$$;

-- ---------------- Agent One ----------------
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', false);
select tests.check((select count(*) from public.leads) = 1, 'agent sees only the lead assigned to them');
select tests.check((select id from public.leads) = :'lead_g1', 'agent sees exactly their own lead');
select tests.check((select count(*) from public.lead_activities where lead_id = :'lead_g2') = 0,
  'agent cannot read the timeline of another agent''s lead');

with u as (update public.leads set notes = 'hijack' where id = :'lead_g2' returning id)
select tests.check((select count(*) from u) = 0, 'agent cannot edit another agent''s lead');

with u as (update public.leads set status = 'contacted', temperature = 'warm' where id = :'lead_g1' returning id)
select tests.check((select count(*) from u) = 1, 'agent can update their own lead');
select tests.check(
  (select count(*) from public.lead_activities where lead_id = :'lead_g1' and type in ('status_change', 'temperature_change')) = 2,
  'status and temperature changes are logged automatically');

do $$
begin
  begin
    update public.leads set assigned_to = '10000000-0000-0000-0000-0000000000a2'
    where id = current_setting('tests.lead_g1')::uuid;
    raise exception 'FAIL: agent reassigned their lead to someone else';
  exception when insufficient_privilege then
    raise notice 'PASS: agent cannot hand their lead to another agent';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.leads (agency_id, name, phone_e164, assigned_to)
    values (current_setting('tests.agency_a')::uuid, 'Sneaky', '+919800000011',
            '10000000-0000-0000-0000-0000000000a2');
    raise exception 'FAIL: agent created a lead for another agent';
  exception when insufficient_privilege then
    raise notice 'PASS: agent can only create leads assigned to themselves';
  end;
end;
$$;

insert into public.leads (agency_id, name, phone_e164, assigned_to)
values (:'agency_a', 'Agent own lead', '+919800000012', '10000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) from public.leads) = 2, 'agent can create a lead for themselves');

insert into public.lead_activities (agency_id, lead_id, type, data)
values (:'agency_a', :'lead_g1', 'call', '{"outcome": "connected"}');
select tests.check((select last_contacted_at is not null from public.leads where id = :'lead_g1'),
  'logging a call sets last_contacted_at');

do $$
begin
  begin
    insert into public.lead_activities (agency_id, lead_id, type, data)
    values (current_setting('tests.agency_a')::uuid,
            (select id from public.leads where name = 'Agent own lead'), 'status_change', '{}');
    raise exception 'FAIL: user forged a status_change timeline entry';
  exception when insufficient_privilege then
    raise notice 'PASS: users can only add notes and calls, not system entries';
  end;
end;
$$;

select tests.check(public.delete_leads(array[:'lead_g1']::uuid[]) = 0, 'agent cannot delete leads');

select tests.check(
  (select can_view from public.find_lead_by_phone(:'agency_a', '+919800000002')) = false,
  'duplicate check tells agent the number exists but is not theirs');

-- ---------------- Agency setting: agents see all ----------------
reset role;
update public.agencies set settings = '{"agents_can_view_all_leads": true}' where id = :'agency_a';
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000a1', false);
select tests.check((select count(*) from public.leads) = 4, 'with the setting on, agent sees all agency leads');
with u as (update public.leads set notes = 'still no' where id = :'lead_g2' returning id)
select tests.check((select count(*) from u) = 0, 'seeing all leads still does not allow editing others''');
reset role;
update public.agencies set settings = '{}' where id = :'agency_a';
set role authenticated;

-- ---------------- Agency B owner (isolation) ----------------
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-00000000000b', false);
select tests.check((select count(*) from public.leads) = 0, 'other agency sees none of A''s leads');
select tests.check((select count(*) from public.lead_activities) = 0, 'other agency sees none of A''s timeline');
with u as (update public.leads set name = 'x' where id = :'lead_g1' returning id)
select tests.check((select count(*) from u) = 0, 'other agency cannot edit A''s lead');
select tests.check(public.delete_leads(array[:'lead_g1']::uuid[]) = 0, 'other agency cannot delete A''s lead');
select tests.check((select count(*) from public.find_lead_by_phone(:'agency_a', '+919800000001')) = 0,
  'other agency cannot probe A''s phone numbers');

do $$
begin
  begin
    insert into public.leads (agency_id, name, phone_e164)
    values (current_setting('tests.agency_a')::uuid, 'Planted', '+919800000099');
    raise exception 'FAIL: B planted a lead in agency A';
  exception when insufficient_privilege then
    raise notice 'PASS: other agency cannot create leads in A';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.lead_activities (agency_id, lead_id, type, data)
    values (current_setting('tests.agency_a')::uuid, current_setting('tests.lead_g1')::uuid, 'note', '{"text": "hi"}');
    raise exception 'FAIL: B added a note to A''s lead';
  exception when insufficient_privilege then
    raise notice 'PASS: other agency cannot add notes to A''s leads';
  end;
end;
$$;

-- Same phone number is fine in a different agency.
insert into public.leads (agency_id, name, phone_e164) values (:'agency_b', 'B copy', '+919800000001');
select tests.check((select count(*) from public.leads) = 1, 'same phone can exist in a different agency');

do $$
begin
  begin
    update public.leads set agency_id = current_setting('tests.agency_a')::uuid where name = 'B copy';
    raise exception 'FAIL: lead moved to another agency';
  exception when insufficient_privilege then
    raise notice 'PASS: a lead cannot be moved to another agency';
  end;
end;
$$;

-- ---------------- Owner A deletes ----------------
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-00000000000a', false);
select tests.check(public.delete_leads(array[:'lead_open']::uuid[]) = 1, 'owner can soft-delete a lead');
select tests.check((select count(*) from public.leads where id = :'lead_open') = 0, 'deleted lead disappears from lists');
insert into public.leads (agency_id, name, phone_e164) values (:'agency_a', 'Re-added', '+919800000003');
select tests.check(true, 'a deleted lead''s phone number can be added again');

-- ---------------- Logged out ----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
begin
  begin
    perform 1 from public.leads;
    raise exception 'FAIL: anon could query leads';
  exception when insufficient_privilege then
    raise notice 'PASS: logged-out users cannot query leads';
  end;
end;
$$;

reset role;
select tests.check(
  not exists (select 1 from pg_tables where schemaname = 'public' and rowsecurity = false),
  'RLS is enabled on every public table');

\echo 'ALL STEP 2 RLS TESTS PASSED'
