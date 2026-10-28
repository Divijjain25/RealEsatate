-- Turn on the LeadOS scheduler: run public.run_scheduler() every 5 minutes.
-- Needs the pg_cron extension (Supabase → Integrations → Cron → Enable).
-- Safe to run again: it replaces the existing schedule with the same name.
select cron.schedule(
  'leados-scheduler',
  '*/5 * * * *',
  $$select public.run_scheduler()$$
);

-- Check it:   select jobname, schedule, active from cron.job;
-- History:    select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Turn off:   select cron.unschedule('leados-scheduler');
