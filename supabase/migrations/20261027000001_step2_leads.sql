-- =====================================================================
-- Step 2 — Leads + activity timeline
--
-- How to run: Supabase Dashboard → SQL Editor → New query → paste this
-- whole file → Run. Run it ONCE, after the Step 1 migration.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profiles become the join point for "who" columns, so the app can show
-- names (assignee, author of a note). Backfill any user created before
-- the Step 1 trigger existed, then link memberships to profiles.
-- ---------------------------------------------------------------------
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

alter table public.memberships
  add constraint memberships_user_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.lead_status as enum (
  'new', 'contacted', 'qualified', 'site_visit_scheduled',
  'site_visit_done', 'negotiation', 'won', 'lost'
);
create type public.lead_temperature as enum ('hot', 'warm', 'cold');
create type public.lead_purpose as enum ('buy', 'rent');

-- ---------------------------------------------------------------------
-- Role helpers (same pattern as Step 1: security definer, current user only)
-- ---------------------------------------------------------------------
create or replace function public.is_manager(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.my_role(p_agency_id) in ('owner', 'manager'), false);
$$;

-- Agency setting: may agents see every lead, or only their own?
create or replace function public.agents_see_all_leads(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (a.settings ->> 'agents_can_view_all_leads')::boolean
     from public.agencies a where a.id = p_agency_id),
    false
  );
$$;

-- Is p_user_id an active member of p_agency_id? (for validating assignees)
create or replace function public.is_active_member(p_agency_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.agency_id = p_agency_id and m.user_id = p_user_id and m.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 120),
  phone_e164         text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  alt_phone          text check (alt_phone is null or alt_phone ~ '^\+[1-9][0-9]{7,14}$'),
  email              text check (email is null or char_length(email) <= 254),
  purpose            public.lead_purpose not null default 'buy',
  budget_min         bigint check (budget_min is null or budget_min >= 0),
  budget_max         bigint check (budget_max is null or budget_max >= 0),
  locations          text[] not null default '{}',
  bhk                text[] not null default '{}',
  property_type      text check (property_type is null or property_type in (
                       'apartment', 'villa', 'plot', 'independent_house', 'commercial', 'other')),
  source             text not null default 'other' check (source in (
                       '99acres', 'magicbricks', 'housing', 'facebook', 'instagram', 'google',
                       'website', 'walk_in', 'referral', 'whatsapp', 'other')),
  status             public.lead_status not null default 'new',
  temperature        public.lead_temperature not null default 'warm',
  assigned_to        uuid references public.profiles (id) on delete set null,
  next_follow_up_at  timestamptz,
  last_contacted_at  timestamptz,
  notes              text check (notes is null or char_length(notes) <= 5000),
  lost_reason        text check (lost_reason is null or char_length(lost_reason) <= 500),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  check (budget_min is null or budget_max is null or budget_min <= budget_max),
  -- lets child tables reference (id, agency_id) so a row can never point
  -- at a lead in another agency
  unique (id, agency_id)
);

-- One live lead per phone number per agency (deleted leads don't count).
create unique index leads_agency_phone_unique
  on public.leads (agency_id, phone_e164) where deleted_at is null;

create index leads_agency_status_idx    on public.leads (agency_id, status) where deleted_at is null;
create index leads_agency_assigned_idx  on public.leads (agency_id, assigned_to) where deleted_at is null;
create index leads_agency_follow_up_idx on public.leads (agency_id, next_follow_up_at) where deleted_at is null;
create index leads_agency_created_idx   on public.leads (agency_id, created_at desc) where deleted_at is null;

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger leads_prevent_agency_change
  before update on public.leads
  for each row execute function public.prevent_agency_change();

-- Record who created the lead, and make sure the assignee is a member of
-- the same agency (you can't assign a lead to someone from another agency).
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

  return new;
end;
$$;

create trigger leads_before_write
  before insert or update on public.leads
  for each row execute function public.leads_before_write();

-- ---------------------------------------------------------------------
-- lead_activities — append-only timeline
-- ---------------------------------------------------------------------
create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  lead_id     uuid not null,
  actor_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  type        text not null check (type in (
                'created', 'note', 'call', 'status_change', 'temperature_change',
                'assignment', 'follow_up_set', 'deleted')),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  foreign key (lead_id, agency_id) references public.leads (id, agency_id) on delete cascade
);

create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

-- Automatic timeline entries: nobody can "forget" to log a status change.
create or replace function public.leads_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (agency_id, lead_id, actor_id, type, data)
    values (new.agency_id, new.id, auth.uid(), 'created',
            jsonb_build_object('status', new.status, 'source', new.source));
    return new;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    return new; -- delete_leads() logs its own entry
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_activities (agency_id, lead_id, actor_id, type, data)
    values (new.agency_id, new.id, auth.uid(), 'status_change',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  if new.temperature is distinct from old.temperature then
    insert into public.lead_activities (agency_id, lead_id, actor_id, type, data)
    values (new.agency_id, new.id, auth.uid(), 'temperature_change',
            jsonb_build_object('from', old.temperature, 'to', new.temperature));
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.lead_activities (agency_id, lead_id, actor_id, type, data)
    values (new.agency_id, new.id, auth.uid(), 'assignment',
            jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to));
  end if;

  if new.next_follow_up_at is distinct from old.next_follow_up_at then
    insert into public.lead_activities (agency_id, lead_id, actor_id, type, data)
    values (new.agency_id, new.id, auth.uid(), 'follow_up_set',
            jsonb_build_object('at', new.next_follow_up_at));
  end if;

  return new;
end;
$$;

create trigger leads_log_activity
  after insert or update on public.leads
  for each row execute function public.leads_log_activity();

-- Logging a call updates the lead's "last contacted" time.
create or replace function public.lead_activities_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'call' then
    update public.leads
    set last_contacted_at = new.created_at
    where id = new.lead_id
      and (last_contacted_at is null or last_contacted_at < new.created_at);
  end if;
  return new;
end;
$$;

create trigger lead_activities_after_insert
  after insert on public.lead_activities
  for each row execute function public.lead_activities_after_insert();

-- ---------------------------------------------------------------------
-- delete_leads — soft delete (owner/manager only). Returns rows deleted.
-- A function, because RLS hides deleted rows and a plain UPDATE that
-- hides its own row is rejected by Postgres.
-- ---------------------------------------------------------------------
create or replace function public.delete_leads(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with deleted as (
    update public.leads l
    set deleted_at = now()
    where l.id = any (p_ids)
      and l.deleted_at is null
      and public.is_manager(l.agency_id)
    returning l.id, l.agency_id
  ), logged as (
    insert into public.lead_activities (agency_id, lead_id, actor_id, type)
    select d.agency_id, d.id, auth.uid(), 'deleted' from deleted d
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- find_lead_by_phone — duplicate check before saving. Tells a member
-- whether the number already exists in THEIR agency, who has it, and
-- whether they are allowed to open it.
-- ---------------------------------------------------------------------
create or replace function public.find_lead_by_phone(p_agency_id uuid, p_phone text)
returns table (lead_id uuid, assigned_to_name text, can_view boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    p.full_name,
    (public.is_manager(l.agency_id)
      or l.assigned_to = (select auth.uid())
      or public.agents_see_all_leads(l.agency_id))
  from public.leads l
  left join public.profiles p on p.id = l.assigned_to
  where l.agency_id = p_agency_id
    and l.phone_e164 = p_phone
    and l.deleted_at is null
    and public.is_member(p_agency_id);
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on table public.leads, public.lead_activities from anon, authenticated;

grant select on table public.leads to authenticated;
grant insert (agency_id, name, phone_e164, alt_phone, email, purpose, budget_min, budget_max,
              locations, bhk, property_type, source, status, temperature, assigned_to,
              next_follow_up_at, notes, lost_reason)
  on table public.leads to authenticated;
grant update (name, phone_e164, alt_phone, email, purpose, budget_min, budget_max,
              locations, bhk, property_type, source, status, temperature, assigned_to,
              next_follow_up_at, notes, lost_reason)
  on table public.leads to authenticated;

grant select on table public.lead_activities to authenticated;
grant insert (agency_id, lead_id, type, data) on table public.lead_activities to authenticated;

revoke execute on function public.is_manager(uuid)                 from public, anon;
revoke execute on function public.agents_see_all_leads(uuid)       from public, anon;
revoke execute on function public.is_active_member(uuid, uuid)     from public, anon;
revoke execute on function public.delete_leads(uuid[])             from public, anon;
revoke execute on function public.find_lead_by_phone(uuid, text)   from public, anon;
revoke execute on function public.leads_before_write()             from public, anon, authenticated;
revoke execute on function public.leads_log_activity()             from public, anon, authenticated;
revoke execute on function public.lead_activities_after_insert()   from public, anon, authenticated;

grant execute on function public.is_manager(uuid)               to authenticated;
grant execute on function public.agents_see_all_leads(uuid)     to authenticated;
grant execute on function public.is_active_member(uuid, uuid)   to authenticated;
grant execute on function public.delete_leads(uuid[])           to authenticated;
grant execute on function public.find_lead_by_phone(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.leads           enable row level security;
alter table public.lead_activities enable row level security;

-- Owner/Manager: every lead in the agency. Agent: only leads assigned to
-- them (or all, if the agency turned on agents_can_view_all_leads).
create policy "leads: read"
  on public.leads for select to authenticated
  using (
    deleted_at is null
    and public.is_member(agency_id)
    and (
      public.is_manager(agency_id)
      or assigned_to = (select auth.uid())
      or public.agents_see_all_leads(agency_id)
    )
  );

-- Agents can only create leads assigned to themselves.
create policy "leads: create"
  on public.leads for insert to authenticated
  with check (
    public.is_member(agency_id)
    and (public.is_manager(agency_id) or assigned_to = (select auth.uid()))
  );

-- Agents can edit only their own leads and can't hand them to someone else.
create policy "leads: update"
  on public.leads for update to authenticated
  using (
    deleted_at is null
    and public.is_member(agency_id)
    and (public.is_manager(agency_id) or assigned_to = (select auth.uid()))
  )
  with check (
    public.is_member(agency_id)
    and (public.is_manager(agency_id) or assigned_to = (select auth.uid()))
  );

-- Timeline: visible exactly when the lead itself is visible.
create policy "lead_activities: read"
  on public.lead_activities for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_activities.lead_id and l.agency_id = lead_activities.agency_id
    )
  );

-- Members may add notes and call logs to leads they can see.
create policy "lead_activities: add note or call"
  on public.lead_activities for insert to authenticated
  with check (
    type in ('note', 'call')
    and actor_id = (select auth.uid())
    and exists (
      select 1 from public.leads l
      where l.id = lead_activities.lead_id and l.agency_id = lead_activities.agency_id
    )
  );
