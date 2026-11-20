-- Run AFTER the app is deployed. Replace the two placeholders first.
-- This pings the app once a minute; the app sends whatever emails are due.
-- Supabase's free tier includes pg_cron and pg_net, so this costs nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('outreach-send-due')
where exists (select 1 from cron.job where jobname = 'outreach-send-due');

select cron.schedule(
  'outreach-send-due',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/cron/send',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To check it's firing:
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
