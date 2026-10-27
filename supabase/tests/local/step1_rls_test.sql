-- Step 1 RLS / agency-isolation tests (local PostgreSQL, run by scripts/test-db-local.sh).
-- Every check prints "PASS: ..." or aborts with "FAIL: ...".
\set ON_ERROR_STOP 1
\set QUIET 1

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create function tests.check(ok boolean, msg text) returns void
language plpgsql as $$
begin
  if not coalesce(ok, false) then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end;
$$;
grant execute on function tests.check(boolean, text) to anon, authenticated;

-- Three users: A and B get their own agencies, C never creates one.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local', '{"full_name": "User A"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local', '{"full_name": "User B"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.local', '{}');

select tests.check((select count(*) from public.profiles) = 3, 'signup trigger created a profile per user');
select tests.check((select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'User A', 'profile full_name copied from signup metadata');

-- ---------------- User A creates an agency ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.create_agency('Agency A Realty', 'Pune', '9876500001') as agency_a \gset
select tests.check((select role from public.memberships where agency_id = :'agency_a') = 'owner', 'creator becomes owner');

-- ---------------- User B creates an agency ----------------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select public.create_agency('Agency B Homes', 'Mumbai', null) as agency_b \gset
select set_config('tests.agency_b', :'agency_b', false) \gset

-- ---------------- Isolation checks as A ----------------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

select tests.check((select count(*) from public.agencies) = 1, 'A sees exactly one agency');
select tests.check((select id from public.agencies) = :'agency_a', 'A sees only Agency A');
select tests.check((select count(*) from public.agencies where id = :'agency_b') = 0, 'A cannot read Agency B by id');
select tests.check((select count(*) from public.memberships where agency_id = :'agency_b') = 0, 'A cannot read Agency B memberships');
select tests.check((select count(*) from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'A cannot read B profile');
select tests.check(public.is_member(:'agency_b') = false, 'is_member(B) is false for A');
select tests.check(public.my_role(:'agency_b') is null, 'my_role(B) is null for A');

with updated as (
  update public.agencies set name = 'Hacked by A' where id = :'agency_b' returning id
)
select tests.check((select count(*) from updated) = 0, 'A update of Agency B affects 0 rows');

with updated as (
  update public.agencies set name = 'Agency A Realty Pvt Ltd' where id = :'agency_a' returning id
)
select tests.check((select count(*) from updated) = 1, 'owner A can rename own agency');

do $$
begin
  begin
    insert into public.memberships (agency_id, user_id, role)
    values (current_setting('tests.agency_b')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001', 'owner');
    raise exception 'FAIL: A inserted itself into Agency B';
  exception when insufficient_privilege then
    raise notice 'PASS: A cannot insert a membership into Agency B';
  end;
end;
$$;

do $$
begin
  begin
    insert into public.agencies (name) values ('Sneaky Agency');
    raise exception 'FAIL: direct agency insert allowed';
  exception when insufficient_privilege then
    raise notice 'PASS: direct agency insert is blocked (must use create_agency)';
  end;
end;
$$;

do $$
begin
  begin
    update public.agencies set plan = 'enterprise';
    raise exception 'FAIL: owner could change plan';
  exception when insufficient_privilege then
    raise notice 'PASS: plan column is not user-editable';
  end;
end;
$$;

do $$
begin
  begin
    perform public.create_agency('Second Agency', null, null);
    raise exception 'FAIL: user created a second agency';
  exception when raise_exception then
    if sqlerrm <> 'already_member' then raise; end if;
    raise notice 'PASS: one agency per user enforced (already_member)';
  end;
end;
$$;

-- ---------------- Checks as B ----------------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select tests.check((select name from public.agencies) = 'Agency B Homes', 'B agency name unchanged by A');
select tests.check((select count(*) from public.agencies where id = :'agency_a') = 0, 'B cannot read Agency A');

-- ---------------- User C (no agency) ----------------
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select tests.check((select count(*) from public.agencies) = 0, 'user without agency sees no agencies');
select tests.check((select count(*) from public.memberships) = 0, 'user without agency sees no memberships');

-- ---------------- Anonymous (logged out) ----------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
begin
  begin
    perform 1 from public.agencies;
    raise exception 'FAIL: anon could query agencies';
  exception when insufficient_privilege then
    raise notice 'PASS: logged-out users cannot query agencies';
  end;
end;
$$;
do $$
begin
  begin
    perform public.create_agency('Anon Agency', null, null);
    raise exception 'FAIL: anon could call create_agency';
  exception when insufficient_privilege then
    raise notice 'PASS: logged-out users cannot call create_agency';
  end;
end;
$$;

-- ---------------- Every public table has RLS on ----------------
reset role;
select tests.check(
  not exists (
    select 1 from pg_tables
    where schemaname = 'public' and rowsecurity = false
  ),
  'RLS is enabled on every public table'
);

\echo 'ALL STEP 1 RLS TESTS PASSED'
