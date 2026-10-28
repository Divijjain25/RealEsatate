-- =====================================================================
-- Step 2b — CSV import
--
-- How to run: Supabase Dashboard → SQL Editor → New query → paste this
-- whole file → Run. Run it ONCE, after the Step 2 migration.
-- =====================================================================

-- Inserts up to 500 leads, one at a time, so a duplicate or bad row is
-- reported instead of failing the whole batch. SECURITY INVOKER: it runs
-- as the logged-in user, so the normal grants and RLS policies on leads
-- still decide what may be inserted (e.g. agents only for themselves).
-- Returns one row per input element: 1-based index, result, message.
create or replace function public.import_leads(p_agency_id uuid, p_leads jsonb)
returns table (idx integer, result text, message text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item  jsonb;
  v_index integer := 0;
begin
  if jsonb_typeof(p_leads) is distinct from 'array' then
    raise exception 'p_leads must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_leads) > 500 then
    raise exception 'too many rows (max 500 per call)' using errcode = '54000';
  end if;

  for v_item in select value from jsonb_array_elements(p_leads)
  loop
    v_index := v_index + 1;
    begin
      insert into public.leads (
        agency_id, name, phone_e164, alt_phone, email, purpose, budget_min, budget_max,
        locations, bhk, property_type, source, status, temperature, assigned_to,
        next_follow_up_at, notes
      )
      select
        p_agency_id, r.name, r.phone_e164, r.alt_phone, r.email, coalesce(r.purpose, 'buy'),
        r.budget_min, r.budget_max, coalesce(r.locations, '{}'), coalesce(r.bhk, '{}'),
        r.property_type, coalesce(r.source, 'other'), coalesce(r.status, 'new'),
        coalesce(r.temperature, 'warm'), r.assigned_to, r.next_follow_up_at, r.notes
      from jsonb_populate_record(null::public.leads, v_item) as r;

      idx := v_index; result := 'imported'; message := null;
    exception
      when unique_violation then
        idx := v_index; result := 'duplicate'; message := 'This number already exists in your leads';
      when insufficient_privilege then
        idx := v_index; result := 'error'; message := 'Not allowed';
      when others then
        idx := v_index; result := 'error';
        message := case
          when sqlerrm like '%assignee_not_member%' then 'Assignee is not in your agency'
          else left(sqlerrm, 200)
        end;
    end;
    return next;
  end loop;
end;
$$;

revoke execute on function public.import_leads(uuid, jsonb) from public, anon;
grant execute on function public.import_leads(uuid, jsonb) to authenticated;
