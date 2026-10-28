-- Step 3 tests for notifications + run_scheduler() (local PostgreSQL,
-- run by scripts/test-db-local.sh after all migrations). Self-contained.
-- "Now" is fixed at 2026-11-02 05:00 UTC = 10:30 IST.
\set ON_ERROR_STOP 1
\set QUIET 1
\set now '''2026-11-02 05:00:00+00'''

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

-- Start from an empty queue so other test files don't interfere.
delete from public.jobs;
delete from public.notifications;

insert into auth.users (id, email, raw_user_meta_data) values
  ('50000000-0000-0000-0000-00000000000a', 'sch-owner@a.test', '{"full_name": "Sch Owner"}'),
  ('50000000-0000-0000-0000-0000000000a1', 'sch-agent@a.test', '{"full_name": "Sch Agent"}'),
  ('60000000-0000-0000-0000-00000000000b', 'sch-owner@b.test', '{"full_name": "Sch Owner B"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-00000000000a', false);
select public.create_agency('Scheduler Agency A', null, null) as agency_a \gset
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000b', false);
select public.create_agency('Scheduler Agency B', null, null) as agency_b \gset
reset role;
insert into public.memberships (agency_id, user_id, role)
values (:'agency_a', '50000000-0000-0000-0000-0000000000a1', 'agent');

-- Owner creates leads for the agent (as the owner, so assignment is "by someone else").
set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-00000000000a', false);
insert into public.leads (agency_id, name, phone_e164, assigned_to, next_follow_up_at, temperature) values
  (:'agency_a', 'Due Now',      '+919600000001', '50000000-0000-0000-0000-0000000000a1', timestamptz :now - interval '10 minutes', 'hot'),
  (:'agency_a', 'Old Overdue',  '+919600000002', '50000000-0000-0000-0000-0000000000a1', timestamptz :now - interval '3 days', 'warm'),
  (:'agency_a', 'Future',       '+919600000003', '50000000-0000-0000-0000-0000000000a1', timestamptz :now + interval '2 hours', 'warm');
insert into public.leads (agency_id, name, phone_e164, assigned_to, next_follow_up_at, status) values
  (:'agency_a', 'Closed Won',   '+919600000004', '50000000-0000-0000-0000-0000000000a1', timestamptz :now - interval '5 minutes', 'won');
insert into public.leads (agency_id, name, phone_e164, next_follow_up_at) values
  (:'agency_a', 'Unassigned',   '+919600000005', timestamptz :now - interval '5 minutes');
insert into public.leads (agency_id, name, phone_e164, assigned_to, next_follow_up_at) values
  (:'agency_a', 'Owner Own',    '+919600000006', '50000000-0000-0000-0000-00000000000a', timestamptz :now - interval '1 minute');
reset role;

select tests.check(
  (select assigned_by = '50000000-0000-0000-0000-00000000000a' and assignment_notified_at is null
   from public.leads where name = 'Due Now'),
  'assigning to someone else records who assigned it and waits to notify');
select tests.check(
  (select assignment_notified_at is not null from public.leads where name = 'Owner Own'),
  'taking a lead yourself needs no assignment notification');

-- Leads left behind by earlier test files must not add notifications here.
update public.leads set assignment_notified_at = now(), next_follow_up_at = null
where agency_id <> :'agency_a';

-- ---------------- First run ----------------
select public.run_scheduler(timestamptz :now) as run1 \gset
select tests.check((:'run1'::jsonb ->> 'dead')::int = 0 and (:'run1'::jsonb ->> 'failed')::int = 0, 'first run has no failures');

select tests.check(
  (select array_agg(l.name order by l.name) from public.notifications n
   join public.leads l on n.link = '/leads/' || l.id where n.type = 'follow_up_due')
  = array['Due Now', 'Owner Own'],
  'follow-up reminders only for open, assigned leads due in the last 24h');
select tests.check(
  (select user_id from public.notifications n where type = 'follow_up_due' and title = 'Follow-up due: Due Now')
  = '50000000-0000-0000-0000-0000000000a1',
  'the reminder goes to the assigned agent');
select tests.check(
  (select count(*) = 1 and min(title) = '4 new leads assigned to you' and min(link) = '/leads?assigned=me&sort=newest'
   from public.notifications where type = 'lead_assigned'),
  'assignments are grouped into one notification per person');
select tests.check(
  (select count(*) from public.leads where assigned_to is not null and assignment_notified_at is null) = 0,
  'assigned leads are marked as notified');
select tests.check(
  (select count(*) from public.notifications
   where type = 'daily_digest' and user_id = '50000000-0000-0000-0000-0000000000a1'
     and title = 'Today: 2 follow-ups, 1 overdue') = 1, -- Due Now + Future are both today (IST)
  'morning digest counts the agent''s due-today and overdue leads');
select tests.check(
  (select count(*) from public.notifications where type = 'daily_digest' and user_id = '60000000-0000-0000-0000-00000000000b') = 0,
  'no digest for someone with nothing due');

-- ---------------- Running again changes nothing ----------------
select count(*) as before_count from public.notifications \gset
select public.run_scheduler(timestamptz :now) as run2 \gset
select public.run_scheduler(timestamptz :now + interval '5 minutes') as run3 \gset
select tests.check((select count(*) from public.notifications) = :before_count,
  'running the scheduler again creates no duplicate notifications');

-- ---------------- Rescheduling gives a new reminder ----------------
update public.leads set next_follow_up_at = timestamptz :now + interval '1 hour' where name = 'Due Now';
select public.run_scheduler(timestamptz :now + interval '61 minutes') \gset
select tests.check(
  (select count(*) from public.notifications where title = 'Follow-up due: Due Now') = 2,
  'a rescheduled follow-up gets its own reminder when it falls due');

-- A queued reminder for a lead that was closed in the meantime does nothing.
insert into public.jobs (agency_id, type, payload, run_at, idempotency_key)
select agency_id, 'follow_up_due', jsonb_build_object('lead_id', id, 'due_at', next_follow_up_at),
       timestamptz :now, 'manual-test-closed'
from public.leads where name = 'Closed Won';
select public.run_scheduler(timestamptz :now + interval '62 minutes') \gset
select tests.check(
  (select status from public.jobs where idempotency_key = 'manual-test-closed') = 'succeeded'
  and not exists (select 1 from public.notifications where title = 'Follow-up due: Closed Won'),
  'stale reminder for a closed lead is skipped without notifying');

-- ---------------- Next day: new digest ----------------
select public.run_scheduler(timestamptz :now + interval '1 day') \gset
select tests.check(
  (select count(*) from public.notifications
   where type = 'daily_digest' and user_id = '50000000-0000-0000-0000-0000000000a1') = 2,
  'one digest per person per day');
select public.run_scheduler(timestamptz '2026-11-04 02:00:00+00') \gset
select tests.check(
  (select count(*) from public.notifications
   where type = 'daily_digest' and user_id = '50000000-0000-0000-0000-0000000000a1') = 2,
  'no digest before 08:30 IST');

-- ---------------- Failure → retry → dead → alert ----------------
insert into public.jobs (agency_id, type, idempotency_key, run_at)
values (:'agency_a', 'no_such_job', 'bad-job-1', timestamptz :now);
select public.run_scheduler(timestamptz :now + interval '2 days') \gset
select tests.check(
  (select status = 'failed' and attempts = 1 and last_error like 'unknown job type%'
          and run_at = timestamptz :now + interval '2 days 1 minute'
   from public.jobs where idempotency_key = 'bad-job-1'),
  'a failing job is retried later (1 minute backoff)');
select public.run_scheduler(timestamptz :now + interval '2 days 30 seconds') \gset
select tests.check((select attempts from public.jobs where idempotency_key = 'bad-job-1') = 1,
  'a job is not retried before its backoff time');

select public.run_scheduler(timestamptz :now + interval '2 days 2 minutes') \gset
select public.run_scheduler(timestamptz :now + interval '2 days 8 minutes') \gset
select public.run_scheduler(timestamptz :now + interval '2 days 40 minutes') \gset
select tests.check((select status = 'failed' and attempts = 4 from public.jobs where idempotency_key = 'bad-job-1'),
  'backoff grows: 1m, 5m, 30m, 2h');
select public.run_scheduler(timestamptz :now + interval '2 days 3 hours') \gset
select tests.check((select status = 'dead' and attempts = 5 from public.jobs where idempotency_key = 'bad-job-1'),
  'after 5 attempts the job is marked dead');
select tests.check(
  (select array_agg(user_id) from public.notifications where type = 'system_alert')
  = array['50000000-0000-0000-0000-00000000000a'::uuid],
  'owners/managers (not agents) are alerted about the dead job');
select public.run_scheduler(timestamptz :now + interval '3 days') \gset
select tests.check((select count(*) from public.notifications where type = 'system_alert') = 1,
  'a dead job alerts only once');

-- ---------------- Stuck job is requeued ----------------
insert into public.jobs (agency_id, type, status, locked_at, idempotency_key, payload)
values (:'agency_a', 'follow_up_due', 'running', timestamptz :now + interval '3 days' - interval '20 minutes', 'stuck-1',
        '{"lead_id": "00000000-0000-0000-0000-000000000000", "due_at": null}');
select public.run_scheduler(timestamptz :now + interval '3 days') \gset
select tests.check((select status from public.jobs where idempotency_key = 'stuck-1') = 'succeeded',
  'a job stuck in running for over 10 minutes is picked up again');

select tests.check((select count(*) >= 10 and bool_and(finished_at is not null) from public.scheduler_runs),
  'every run is recorded for the health panel');

-- ---------------- Permissions ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-0000000000a1', false);
select tests.check(
  (select count(*) > 0 and bool_and(user_id = '50000000-0000-0000-0000-0000000000a1') from public.notifications),
  'agent sees only their own notifications');
with u as (update public.notifications set read_at = now() where read_at is null returning id)
select tests.check((select count(*) from u) > 0, 'agent can mark their notifications as read');
do $$
begin
  begin
    update public.notifications set title = 'hacked';
    raise exception 'FAIL: agent changed a notification title';
  exception when insufficient_privilege then
    raise notice 'PASS: only read_at can be changed';
  end;
end;
$$;
do $$
begin
  begin
    perform public.run_scheduler();
    raise exception 'FAIL: app user could run the scheduler';
  exception when insufficient_privilege then
    raise notice 'PASS: app users cannot run the scheduler';
  end;
end;
$$;
do $$
begin
  begin
    perform 1 from public.jobs;
    raise exception 'FAIL: app user could read jobs';
  exception when insufficient_privilege then
    raise notice 'PASS: app users cannot read the job queue';
  end;
end;
$$;
do $$
begin
  begin
    perform public.scheduler_health((select agency_id from public.memberships limit 1));
    raise exception 'FAIL: agent saw system health';
  exception when insufficient_privilege then
    raise notice 'PASS: agents cannot see system health';
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-00000000000a', false);
select public.scheduler_health(:'agency_a') as health \gset
select tests.check((:'health'::jsonb ->> 'dead')::int = 1 and :'health'::jsonb ? 'last_run_at',
  'owner sees system health for their agency');
select tests.check(
  (select count(*) from public.notifications where user_id <> '50000000-0000-0000-0000-00000000000a') = 0,
  'owner does not see the agent''s notifications');

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-00000000000b', false);
select tests.check((select count(*) from public.notifications) = 0, 'other agency sees none of A''s notifications');
do $$
begin
  begin
    perform public.scheduler_health((select id from public.agencies where name = 'Scheduler Agency A'));
    raise exception 'FAIL: other agency saw A''s health';
  exception when insufficient_privilege then
    raise notice 'PASS: other agency cannot see A''s system health';
  end;
end;
$$;
reset role;

select tests.check(
  not exists (select 1 from pg_tables where schemaname = 'public' and rowsecurity = false),
  'RLS is enabled on every public table');

\echo 'ALL STEP 3 SCHEDULER TESTS PASSED'
