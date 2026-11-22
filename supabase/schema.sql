-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- Google refresh tokens, one per user. RLS is on with NO policies, so browsers
-- can never read these; only the server (service role key) can.
create table if not exists public.gmail_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.gmail_tokens enable row level security;
-- v0.3: the Google permissions each user granted (space-separated). Reply tracking needs
-- gmail.metadata and is opt-in. Rows from before v0.3 were granted both, so backfill that.
alter table public.gmail_tokens add column if not exists scopes text;
update public.gmail_tokens
  set scopes = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.metadata'
  where scopes is null;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Untitled campaign',
  subject text not null default '',
  body text not null default '',
  sender_name text not null default '',
  gap_minutes int not null default 3 check (gap_minutes between 1 and 120),
  attachment_path text,
  attachment_name text,
  -- draft: editing | scheduled: sending over time | done | needs_reauth: Google sign-in expired mid-run
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'done', 'needs_reauth')),
  start_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  position int not null default 0,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  title text not null default '',
  company text not null default '',
  location text not null default '',
  custom_line text not null default '',
  -- pending: not scheduled | queued: has a send_at | sending: claimed by a worker
  -- sent | skipped: user excluded | error: failed, see error column
  status text not null default 'pending' check (status in ('pending', 'queued', 'sending', 'sent', 'skipped', 'error')),
  send_at timestamptz,
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts int not null default 0,
  error text,
  gmail_message_id text,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists recipients_due_idx on public.recipients (status, send_at);
create index if not exists recipients_campaign_idx on public.recipients (campaign_id, position);

alter table public.campaigns enable row level security;
alter table public.recipients enable row level security;

-- Newer Supabase projects don't grant table access to API roles automatically.
-- Row Level Security still limits signed-in users to their own rows.
grant usage on schema public to service_role, authenticated;
grant all on table public.gmail_tokens, public.campaigns, public.recipients to service_role;
grant select, insert, update, delete on table public.campaigns, public.recipients to authenticated;

drop policy if exists "own campaigns" on public.campaigns;
create policy "own campaigns" on public.campaigns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own recipients" on public.recipients;
create policy "own recipients" on public.recipients
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())
  );

-- Atomically hands out due emails to the sender. "for update skip locked" means two
-- overlapping cron runs can never grab the same row, so nobody gets emailed twice.
create or replace function public.claim_due_recipients(max_rows int)
returns setof public.recipients
language sql
security definer
set search_path = public
as $$
  update public.recipients r
  set status = 'sending', claimed_at = now(), attempts = r.attempts + 1
  where r.id in (
    select r2.id
    from public.recipients r2
    join public.campaigns c on c.id = r2.campaign_id
    where r2.status = 'queued' and r2.send_at <= now() and c.status = 'scheduled'
    order by r2.send_at
    limit max_rows
    for update of r2 skip locked
  )
  returning r.*;
$$;
revoke execute on function public.claim_due_recipients(int) from public, anon, authenticated;
grant execute on function public.claim_due_recipients(int) to service_role;

-- Private bucket for resume attachments. Files live under <user id>/..., and each
-- user can only touch their own folder.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "own attachments read" on storage.objects;
create policy "own attachments read" on storage.objects for select
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own attachments write" on storage.objects;
create policy "own attachments write" on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own attachments update" on storage.objects;
create policy "own attachments update" on storage.objects for update
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own attachments delete" on storage.objects;
create policy "own attachments delete" on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- v0.2: tracking. Safe to re-run; also works on a database set up with v0.1.
-- ---------------------------------------------------------------------------
alter table public.campaigns add column if not exists attachment_size int;
alter table public.campaigns add column if not exists track_opens boolean not null default true;

alter table public.recipients add column if not exists thread_id text;
alter table public.recipients add column if not exists opened_at timestamptz;
alter table public.recipients add column if not exists open_count int not null default 0;
alter table public.recipients add column if not exists replied_at timestamptz;
alter table public.recipients add column if not exists reply_checked_at timestamptz;

create index if not exists recipients_reply_sweep_idx on public.recipients (status, reply_checked_at)
  where replied_at is null;

-- Called by the open-tracking pixel. Records the first open and counts the rest.
-- Ignores hits in the first 20 seconds after sending, which are mostly spam scanners.
create or replace function public.record_open(rid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recipients
  set opened_at = coalesce(opened_at, now()), open_count = open_count + 1
  where id = rid and status = 'sent' and sent_at < now() - interval '20 seconds';
$$;
revoke execute on function public.record_open(uuid) from public, anon, authenticated;
grant execute on function public.record_open(uuid) to service_role;
