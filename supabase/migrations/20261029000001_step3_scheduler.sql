-- =====================================================================
-- Step 3 — Notifications, job queue and the scheduler
--
-- How to run: Supabase Dashboard → SQL Editor → New query → paste this
-- whole file → Run. Run it ONCE, after the Step 2b migration.
-- Then turn on the schedule with supabase/cron/schedule.sql (see guide).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Leads: remember who assigned a lead and whether they were told about it
-- ---------------------------------------------------------------------
alter table public.leads
  add column assigned_at timestamptz,
  add column assigned_by uuid references public.profiles (id) on delete set null,
  add column assignment_notified_at timestamptz;

-- Leads that already had an owner before this step: nothing to announce.
update public.leads set assigned_at = created_at, assignment_notified_at = now()
where assigned_to is not null;

create index leads_follow_up_due_idx on public.leads (next_follow_up_at)
  where deleted_at is null and assigned_to is not null;
create index leads_assignment_pending_idx on public.leads (agency_id, assigned_to)
  where assignment_notified_at is null and assigned_to is not null and deleted_at is null;

-- Same as Step 2, plus assignment bookkeeping.
create or replace function public.leads_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not public.is_active_member(new.agency_id, new.assigned_to) then
    raise exception 'assignee_not_member' using errcode = '23514';
  end if;

  if (tg_op = 'INSERT' and new.assigned_to is not null)
     or (tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to) then
    new.assigned_at := now();
    new.assigned_by := auth.uid();
    -- Taking a lead yourself (or unassigning) needs no notification.
    new.assignment_notified_at := case
      when new.assigned_to is null or new.assigned_to = auth.uid() then now()
      else null
    end;
  elsif tg_op = 'INSERT' then
    new.assigned_at := null;
    new.assigned_by := null;
    new.assignment_notified_at := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- notifications — what the 🔔 bell shows
-- ---------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in ('follow_up_due', 'daily_digest', 'lead_assigned', 'system_alert')),
  title       text not null check (char_length(title) <= 200),
  body        text check (body is null or char_length(body) <= 1000),
  -- in-app path only, e.g. /leads/<id>; never an external URL
  link        text check (link is null or link ~ '^/[^/\\]'),
  dedupe_key  text unique,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------
-- jobs — background work queue
--   status: queued → running → succeeded
--                     ↘ failed (retry later) → … → dead (gave up)
-- ---------------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid references public.agencies (id) on delete cascade,
  type             text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'queued'
                     check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  run_at           timestamptz not null default now(),
  attempts         integer not null default 0,
  max_attempts     integer not null default 5,
  last_error       text,
  idempotency_key  text not null unique, -- the same work can never be queued twice
  locked_at        timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index jobs_due_idx on public.jobs (run_at) where status in ('queued', 'failed');
create index jobs_agency_status_idx on public.jobs (agency_id, status);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- One row per scheduler run, for the "System health" panel.
create table public.scheduler_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  enqueued     integer not null default 0,
  succeeded    integer not null default 0,
  failed       integer not null default 0,
  dead         integer not null default 0,
  error        text
);

-- ---------------------------------------------------------------------
-- Notification helper (used by job handlers)
-- ---------------------------------------------------------------------
create or replace function public.notify(
  p_agency_id uuid, p_user_id uuid, p_type text, p_title text, p_body text, p_link text, p_dedupe_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (agency_id, user_id, type, title, body, link, dedupe_key)
  values (p_agency_id, p_user_id, p_type, left(p_title, 200), left(p_body, 1000), p_link, p_dedupe_key)
  on conflict (dedupe_key) do nothing;
$$;

-- ---------------------------------------------------------------------
-- Job handlers. Each one re-checks the current data, so a job queued
-- earlier does nothing if the lead was meanwhile closed or rescheduled.
-- ---------------------------------------------------------------------
create or replace function public.run_job(p_job public.jobs, p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead      public.leads;
  v_user_id   uuid;
  v_agency_id uuid;
  v_count     integer;
  v_first     public.leads;
  v_today     date;
  v_day_start timestamptz;
  v_day_end   timestamptz;
  v_due       integer;
  v_overdue   integer;
  v_hot       integer;
begin
  case p_job.type

  when 'follow_up_due' then
    select * into v_lead from public.leads where id = (p_job.payload ->> 'lead_id')::uuid;
    if v_lead.id is null
       or v_lead.deleted_at is not null
       or v_lead.status in ('won', 'lost')
       or v_lead.assigned_to is null
       or v_lead.next_follow_up_at is distinct from (p_job.payload ->> 'due_at')::timestamptz then
      return; -- nothing to remind about any more
    end if;
    perform public.notify(
      v_lead.agency_id, v_lead.assigned_to, 'follow_up_due',
      'Follow-up due: ' || v_lead.name,
      'It''s time to follow up with ' || v_lead.name || '.',
      '/leads/' || v_lead.id,
      p_job.idempotency_key
    );

  when 'assignment_digest' then
    v_user_id := (p_job.payload ->> 'user_id')::uuid;
    v_agency_id := p_job.agency_id;
    select count(*) into v_count from public.leads
    where agency_id = v_agency_id and assigned_to = v_user_id
      and assignment_notified_at is null and deleted_at is null;
    if v_count = 0 then
      return;
    end if;
    select * into v_first from public.leads
    where agency_id = v_agency_id and assigned_to = v_user_id
      and assignment_notified_at is null and deleted_at is null
    order by assigned_at desc limit 1;

    if public.is_active_member(v_agency_id, v_user_id) then
      perform public.notify(
        v_agency_id, v_user_id, 'lead_assigned',
        case when v_count = 1 then 'New lead assigned: ' || v_first.name
             else v_count || ' new leads assigned to you' end,
        null,
        case when v_count = 1 then '/leads/' || v_first.id
             else '/leads?assigned=me&sort=newest' end,
        p_job.idempotency_key
      );
    end if;
    update public.leads set assignment_notified_at = p_now
    where agency_id = v_agency_id and assigned_to = v_user_id
      and assignment_notified_at is null and deleted_at is null;

  when 'daily_digest' then
    v_user_id := (p_job.payload ->> 'user_id')::uuid;
    v_agency_id := p_job.agency_id;
    v_today := (p_job.payload ->> 'date')::date;
    v_day_start := v_today::timestamp at time zone 'Asia/Kolkata';
    v_day_end := v_day_start + interval '1 day';

    select
      count(*) filter (where next_follow_up_at >= v_day_start and next_follow_up_at < v_day_end),
      count(*) filter (where next_follow_up_at < v_day_start),
      count(*) filter (where temperature = 'hot')
    into v_due, v_overdue, v_hot
    from public.leads
    where agency_id = v_agency_id and assigned_to = v_user_id
      and deleted_at is null and status not in ('won', 'lost');

    if v_due + v_overdue > 0 and public.is_active_member(v_agency_id, v_user_id) then
      perform public.notify(
        v_agency_id, v_user_id, 'daily_digest',
        'Today: ' || v_due || ' follow-up' || case when v_due = 1 then '' else 's' end
          || ', ' || v_overdue || ' overdue',
        'You have ' || v_hot || ' hot lead' || case when v_hot = 1 then '' else 's' end || ' open.',
        case when v_overdue > 0 then '/leads?followUp=overdue&assigned=me'
             else '/leads?followUp=today&assigned=me' end,
        p_job.idempotency_key
      );
    end if;

  else
    raise exception 'unknown job type: %', p_job.type;
  end case;
end;
$$;

-- ---------------------------------------------------------------------
-- run_scheduler — called by Supabase Cron every 5 minutes.
--   1. requeue jobs stuck in "running" (crashed worker)
--   2. enqueue new work (unique idempotency keys make re-runs harmless)
--   3. run due jobs; failures retry with backoff, then go "dead" and the
--      agency's owners/managers get a system alert
--   4. tidy up old rows
-- p_now exists so tests can pretend it is a different time.
-- ---------------------------------------------------------------------
create or replace function public.run_scheduler(p_now timestamptz default now(), p_batch integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id    bigint;
  v_enqueued  integer := 0;
  v_rows      integer;
  v_succeeded integer := 0;
  v_failed    integer := 0;
  v_dead      integer := 0;
  v_job       public.jobs;
  v_error     text;
  v_backoff   interval[] := array['1 minute', '5 minutes', '30 minutes', '2 hours']::interval[];
  v_ist_now   timestamp := p_now at time zone 'Asia/Kolkata';
begin
  insert into public.scheduler_runs (started_at) values (p_now) returning id into v_run_id;

  -- 1. Requeue jobs left "running" for more than 10 minutes.
  update public.jobs set status = 'failed', locked_at = null, last_error = 'timed out while running'
  where status = 'running' and locked_at < p_now - interval '10 minutes';

  -- 2a. Follow-ups that became due in the last 24 hours (older ones are
  --     covered by the morning digest, so an import of old leads can't
  --     flood anyone with reminders).
  insert into public.jobs (agency_id, type, payload, run_at, idempotency_key)
  select l.agency_id, 'follow_up_due',
         jsonb_build_object('lead_id', l.id, 'due_at', l.next_follow_up_at),
         p_now,
         'follow_up_due:' || l.id || ':' || floor(extract(epoch from l.next_follow_up_at))::bigint
  from public.leads l
  where l.deleted_at is null
    and l.assigned_to is not null
    and l.status not in ('won', 'lost')
    and l.next_follow_up_at <= p_now
    and l.next_follow_up_at > p_now - interval '24 hours'
  on conflict (idempotency_key) do nothing;
  get diagnostics v_rows = row_count;
  v_enqueued := v_enqueued + v_rows;

  -- 2b. New assignments, grouped per person ("5 new leads assigned to you").
  insert into public.jobs (agency_id, type, payload, run_at, idempotency_key)
  select l.agency_id, 'assignment_digest',
         jsonb_build_object('user_id', l.assigned_to),
         p_now,
         'assignment_digest:' || l.agency_id || ':' || l.assigned_to || ':'
           || floor(extract(epoch from max(l.assigned_at)) * 1000)::bigint
  from public.leads l
  where l.assignment_notified_at is null and l.assigned_to is not null and l.deleted_at is null
  group by l.agency_id, l.assigned_to
  on conflict (idempotency_key) do nothing;
  get diagnostics v_rows = row_count;
  v_enqueued := v_enqueued + v_rows;

  -- 2c. Morning summary, once per person per day, from 08:30 IST.
  if v_ist_now::time >= time '08:30' then
    insert into public.jobs (agency_id, type, payload, run_at, idempotency_key)
    select m.agency_id, 'daily_digest',
           jsonb_build_object('user_id', m.user_id, 'date', v_ist_now::date),
           p_now,
           'daily_digest:' || m.agency_id || ':' || m.user_id || ':' || v_ist_now::date
    from public.memberships m
    where m.status = 'active'
    on conflict (idempotency_key) do nothing;
    get diagnostics v_rows = row_count;
    v_enqueued := v_enqueued + v_rows;
  end if;

  -- 3. Run due jobs. SKIP LOCKED: two overlapping runs never take the same job.
  for v_job in
    select * from public.jobs
    where status in ('queued', 'failed') and run_at <= p_now
    order by run_at
    limit p_batch
    for update skip locked
  loop
    update public.jobs
    set status = 'running', locked_at = p_now, attempts = attempts + 1
    where id = v_job.id
    returning * into v_job;

    begin
      perform public.run_job(v_job, p_now);
      update public.jobs
      set status = 'succeeded', finished_at = p_now, locked_at = null, last_error = null
      where id = v_job.id;
      v_succeeded := v_succeeded + 1;
    exception when others then
      v_error := left(sqlerrm, 500);
      if v_job.attempts >= v_job.max_attempts then
        update public.jobs
        set status = 'dead', finished_at = p_now, locked_at = null, last_error = v_error
        where id = v_job.id;
        v_dead := v_dead + 1;
        -- Tell the agency's owners and managers that something gave up.
        if v_job.agency_id is not null then
          perform public.notify(
            v_job.agency_id, m.user_id, 'system_alert',
            'A background task failed: ' || v_job.type,
            'It was tried ' || v_job.attempts || ' times. Last error: ' || v_error,
            '/dashboard',
            'job_dead:' || v_job.id || ':' || m.user_id
          )
          from public.memberships m
          where m.agency_id = v_job.agency_id and m.status = 'active' and m.role in ('owner', 'manager');
        end if;
      else
        update public.jobs
        set status = 'failed', locked_at = null, last_error = v_error,
            run_at = p_now + v_backoff[least(v_job.attempts, array_length(v_backoff, 1))]
        where id = v_job.id;
        v_failed := v_failed + 1;
      end if;
    end;
  end loop;

  -- 4. Housekeeping.
  delete from public.jobs where status = 'succeeded' and finished_at < p_now - interval '14 days';
  delete from public.scheduler_runs where started_at < p_now - interval '7 days';
  delete from public.notifications where read_at is not null and read_at < p_now - interval '90 days';

  update public.scheduler_runs
  set finished_at = clock_timestamp(), enqueued = v_enqueued,
      succeeded = v_succeeded, failed = v_failed, dead = v_dead
  where id = v_run_id;

  return jsonb_build_object(
    'enqueued', v_enqueued, 'succeeded', v_succeeded, 'failed', v_failed, 'dead', v_dead
  );
end;
$$;

-- ---------------------------------------------------------------------
-- scheduler_health — the dashboard panel (owners/managers only)
-- ---------------------------------------------------------------------
create or replace function public.scheduler_health(p_agency_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_manager(p_agency_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'last_run_at', (select max(started_at) from public.scheduler_runs),
    'runs_last_hour', (select count(*) from public.scheduler_runs where started_at > now() - interval '1 hour'),
    'queued', (select count(*) from public.jobs where agency_id = p_agency_id and status in ('queued', 'running')),
    'retrying', (select count(*) from public.jobs where agency_id = p_agency_id and status = 'failed'),
    'dead', (select count(*) from public.jobs where agency_id = p_agency_id and status = 'dead'),
    'recent_failures', coalesce((
      select jsonb_agg(f order by f.updated_at desc)
      from (
        select type, status, attempts, last_error, updated_at
        from public.jobs
        where agency_id = p_agency_id and status in ('failed', 'dead')
        order by updated_at desc
        limit 5
      ) f
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------
revoke all on table public.notifications, public.jobs, public.scheduler_runs from anon, authenticated;

grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

revoke execute on function public.notify(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.run_job(public.jobs, timestamptz)               from public, anon, authenticated;
revoke execute on function public.run_scheduler(timestamptz, integer)             from public, anon, authenticated;
revoke execute on function public.scheduler_health(uuid)                          from public, anon;
grant execute on function public.scheduler_health(uuid) to authenticated;

alter table public.notifications  enable row level security;
alter table public.jobs           enable row level security;
alter table public.scheduler_runs enable row level security;
-- jobs and scheduler_runs: no policies on purpose — only the scheduler
-- (running as the database owner) touches them.

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.is_member(agency_id));

create policy "notifications: mark own as read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and public.is_member(agency_id))
  with check (user_id = (select auth.uid()) and public.is_member(agency_id));
