-- =====================================================================
-- Step 1 — Multi-tenancy foundation
--   agencies, profiles, memberships + Row Level Security
--
-- How to run (beginner path): Supabase Dashboard → SQL Editor → New query →
-- paste this whole file → Run. Run it ONCE per project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'agent');
create type public.member_status as enum ('active', 'deactivated');

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- agencies — one row per customer company (the "tenant")
-- ---------------------------------------------------------------------
create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  city        text check (city is null or char_length(city) <= 80),
  phone       text check (phone is null or char_length(phone) <= 20),
  timezone    text not null default 'Asia/Kolkata',
  settings    jsonb not null default '{}'::jsonb,
  plan        text not null default 'pilot',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- profiles — extra info for each login user (id = auth.users.id)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) <= 120),
  phone       text check (phone is null or char_length(phone) <= 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- memberships — which user belongs to which agency, with what role
-- ---------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'agent',
  status      public.member_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- A row must never move from one agency to another. Reused by later tables.
create or replace function public.prevent_agency_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agency_id is distinct from old.agency_id then
    raise exception 'agency_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger memberships_prevent_agency_change
  before update on public.memberships
  for each row execute function public.prevent_agency_change();

-- ---------------------------------------------------------------------
-- RLS helper functions
-- security definer: they read memberships without being blocked by RLS
-- themselves (avoids infinite recursion), but only ever answer questions
-- about the *current* user (auth.uid()).
-- ---------------------------------------------------------------------
create or replace function public.is_member(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.agency_id = p_agency_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.my_role(p_agency_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.agency_id = p_agency_id
    and m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

-- True when the current user and p_user_id are active members of a common agency.
create or replace function public.shares_agency_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.agency_id = mine.agency_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user_id
      and theirs.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- create_agency — signup onboarding: makes the agency AND the owner
-- membership in one transaction. Direct inserts are not allowed (no
-- insert policy), so this is the only way to create an agency.
-- MVP rule: one active agency per user.
-- ---------------------------------------------------------------------
create or replace function public.create_agency(
  p_name  text,
  p_city  text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_agency_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Serialize concurrent calls from the same user (double-click protection).
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  if exists (
    select 1 from public.memberships
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.agencies (name, city, phone, created_by)
  values (btrim(p_name), nullif(btrim(p_city), ''), nullif(btrim(p_phone), ''), v_user_id)
  returning id into v_agency_id;

  insert into public.memberships (agency_id, user_id, role)
  values (v_agency_id, v_user_id, 'owner');

  return v_agency_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges: start from nothing, grant only what the app needs.
-- (RLS policies below then decide WHICH rows.)
-- ---------------------------------------------------------------------
revoke all on table public.agencies, public.profiles, public.memberships from anon, authenticated;

grant select on table public.agencies    to authenticated;
grant select on table public.profiles    to authenticated;
grant select on table public.memberships to authenticated;

-- Column-level: users may edit only these columns (not plan, created_by, ids).
grant update (name, city, phone, timezone, settings) on table public.agencies to authenticated;
grant update (full_name, phone)                      on table public.profiles to authenticated;

revoke execute on function public.is_member(uuid)               from public, anon;
revoke execute on function public.my_role(uuid)                 from public, anon;
revoke execute on function public.shares_agency_with(uuid)      from public, anon;
revoke execute on function public.create_agency(text, text, text) from public, anon;
revoke execute on function public.handle_new_user()             from public, anon, authenticated;

grant execute on function public.is_member(uuid)                to authenticated;
grant execute on function public.my_role(uuid)                  to authenticated;
grant execute on function public.shares_agency_with(uuid)       to authenticated;
grant execute on function public.create_agency(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.agencies    enable row level security;
alter table public.profiles    enable row level security;
alter table public.memberships enable row level security;

-- agencies: members can see their agency; only the owner can edit it.
create policy "agencies: members can read"
  on public.agencies for select to authenticated
  using (public.is_member(id));

create policy "agencies: owner can update"
  on public.agencies for update to authenticated
  using (public.my_role(id) = 'owner')
  with check (public.my_role(id) = 'owner');

-- profiles: you can read yourself and your teammates; edit only yourself.
create policy "profiles: read self and teammates"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_agency_with(id));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships: members can see who is in their agency.
-- Inserts/updates happen only through security-definer functions
-- (create_agency now; invites and role changes in Step 6).
create policy "memberships: members can read"
  on public.memberships for select to authenticated
  using (public.is_member(agency_id));
