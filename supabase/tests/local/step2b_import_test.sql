-- Step 2b tests for import_leads() (local PostgreSQL, run by
-- scripts/test-db-local.sh after all migrations). Self-contained.
\set ON_ERROR_STOP 1
\set QUIET 1

create schema if not exists tests;
create or replace function tests.check(ok boolean, msg text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end;
$$;
grant usage on schema tests to anon, authenticated;
grant execute on function tests.check(boolean, text) to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-00000000000a', 'imp-owner@a.test', '{"full_name": "Import Owner"}'),
  ('30000000-0000-0000-0000-0000000000a1', 'imp-agent@a.test', '{"full_name": "Import Agent"}'),
  ('40000000-0000-0000-0000-00000000000b', 'imp-owner@b.test', '{"full_name": "Import Owner B"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000a', false);
select public.create_agency('Import Agency A', null, null) as agency_a \gset
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-00000000000b', false);
select public.create_agency('Import Agency B', null, null) as agency_b \gset
reset role;
insert into public.memberships (agency_id, user_id, role)
values (:'agency_a', '30000000-0000-0000-0000-0000000000a1', 'agent');

-- ---------------- Owner imports a mixed batch ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000a', false);
insert into public.leads (agency_id, name, phone_e164) values (:'agency_a', 'Already here', '+919700000001');

create temporary table owner_result as
select * from public.import_leads(:'agency_a', jsonb_build_array(
  jsonb_build_object('name', 'New One', 'phone_e164', '+919700000002', 'budget_min', 6000000, 'budget_max', 8000000,
                     'locations', jsonb_build_array('Wakad', 'Baner'), 'bhk', jsonb_build_array('2BHK'),
                     'source', '99acres', 'temperature', 'hot',
                     'assigned_to', '30000000-0000-0000-0000-0000000000a1'),
  jsonb_build_object('name', 'Dup of existing', 'phone_e164', '+919700000001'),
  jsonb_build_object('name', 'Bad phone', 'phone_e164', '12345'),
  jsonb_build_object('name', 'Outsider assignee', 'phone_e164', '+919700000003',
                     'assigned_to', '40000000-0000-0000-0000-00000000000b'),
  jsonb_build_object('name', 'Minimal', 'phone_e164', '+919700000004')
));

select tests.check((select string_agg(result, ',' order by idx) from owner_result)
  = 'imported,duplicate,error,error,imported', 'each row gets its own result');
select tests.check((select message from owner_result where idx = 4) = 'Assignee is not in your agency',
  'assignee outside the agency is explained');
select tests.check((select count(*) from public.leads where agency_id = :'agency_a') = 3,
  'only the valid new rows were inserted');
select tests.check(
  (select locations = '{Wakad,Baner}' and bhk = '{2BHK}' and temperature = 'hot' and budget_max = 8000000
   from public.leads where phone_e164 = '+919700000002'),
  'arrays, enums and budgets are stored correctly');
select tests.check(
  (select status = 'new' and source = 'other' and temperature = 'warm' from public.leads where phone_e164 = '+919700000004'),
  'missing fields fall back to defaults');
select tests.check(
  (select count(*) from public.lead_activities a join public.leads l on l.id = a.lead_id
   where l.phone_e164 in ('+919700000002', '+919700000004') and a.type = 'created') = 2,
  'imported leads get a created timeline entry');

-- ---------------- Agent ----------------
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-0000000000a1', false);
create temporary table agent_result as
select * from public.import_leads(:'agency_a', jsonb_build_array(
  jsonb_build_object('name', 'Mine', 'phone_e164', '+919700000010', 'assigned_to', '30000000-0000-0000-0000-0000000000a1'),
  jsonb_build_object('name', 'For owner', 'phone_e164', '+919700000011', 'assigned_to', '30000000-0000-0000-0000-00000000000a')
));
select tests.check((select string_agg(result, ',' order by idx) from agent_result) = 'imported,error',
  'agents can only import leads for themselves');

-- ---------------- Other agency ----------------
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-00000000000b', false);
create temporary table b_result as
select * from public.import_leads(:'agency_a', jsonb_build_array(
  jsonb_build_object('name', 'Planted', 'phone_e164', '+919700000020')
));
select tests.check((select result from b_result) = 'error', 'other agency cannot import into A');
reset role;
select tests.check((select count(*) from public.leads where phone_e164 = '+919700000020') = 0,
  'nothing was planted in A');

-- ---------------- Limits and anon ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000a', false);
do $$
begin
  begin
    perform * from public.import_leads(gen_random_uuid(), (select jsonb_agg(jsonb_build_object('name', 'x')) from generate_series(1, 501)));
    raise exception 'FAIL: 501 rows accepted';
  exception when program_limit_exceeded then
    raise notice 'PASS: more than 500 rows per call is refused';
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
begin
  begin
    perform * from public.import_leads(gen_random_uuid(), '[]'::jsonb);
    raise exception 'FAIL: anon could call import_leads';
  exception when insufficient_privilege then
    raise notice 'PASS: logged-out users cannot import';
  end;
end;
$$;
reset role;

\echo 'ALL STEP 2b IMPORT TESTS PASSED'
