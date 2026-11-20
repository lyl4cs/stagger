# Outreach

Paste a contact list, write one email, and schedule a personal copy to each person from your own Gmail. Sends are spaced a few minutes apart, every row is tracked, and nobody gets emailed twice.

- Paste a raw contact export (Apollo and similar) or a CSV, and it pulls out names, titles, companies and locations
- `{{FirstName}}`, `{{Company}}`, `{{CustomLine}}` and other placeholders, with a live preview per person
- An optional custom line per person that vanishes cleanly when blank
- Leftover `[TEXT IN BRACKETS]` blocks scheduling, so a half-finished template can't go out
- Resume attachment
- Test send to yourself, scheduled start, cancel anytime, and a summary email when it finishes
- Tracker: who's waiting, sent, opened, replied or bounced, with a live activity feed and counters
- Runs on the server, so your laptop can be closed

There's also a no-server version that runs inside Google Sheets in [`sheets-script/`](sheets-script/).

## How it works

```
Browser (Next.js) ──writes──> Supabase Postgres (campaigns, recipients)
                                   │
            pg_cron, every minute  │  POST /api/cron/send
                                   ▼
                     Next.js route: claim due rows ──> Gmail API (as you)
```

1. **Sign in.** Google sign-in through Supabase Auth asks for the `gmail.send` scope, which allows sending but not reading. The callback saves Google's refresh token to `gmail_tokens`, a table browsers can't read (RLS on, no policies).
2. **Schedule.** `/api/campaigns/[id]/schedule` gives every unsent recipient a `send_at`: the first at your start time, then one every N minutes plus up to 60 seconds of jitter.
3. **Send.** Once a minute, Supabase's `pg_cron` pings `/api/cron/send`. That route calls `claim_due_recipients()`, which flips due rows to `sending` using `FOR UPDATE SKIP LOCKED`, so two overlapping runs can never grab the same person. Each email is built as raw MIME and sent through the Gmail API.
4. **Tracking.** If "Track opens" is on, each email also gets an HTML version with a 1x1 image pointing at `/api/o/<recipient id>`, and loading it records an open. Replies and bounces come from the same cron: it reads each sent thread's `From` and `Auto-Submitted` headers through the `gmail.metadata` scope (headers only, never bodies), ignores out-of-office auto-replies, and marks mailer-daemon messages as bounces.
5. **Failures.** Gmail rate limits and 5xx errors retry in 5 minutes (up to 3 tries). An expired Google sign-in pauses the campaign as `needs_reauth` instead of failing rows. A row stuck in `sending` for 10+ minutes is marked as an error and never resent automatically, because there's no way to know whether Gmail accepted it.

The core logic (`src/lib/parse.ts`, `template.ts`, `mime.ts`, `schedule.ts`) is pure and covered by `npm test`.

## Setup

You need free accounts on Supabase, Google Cloud and Vercel. It takes about 20 minutes.

### 1. Supabase
1. Create a project.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it. It's safe to re-run, which is also how you upgrade an existing database.
3. From **Project Settings > API**, copy the project URL, the `anon`/publishable key and the `service_role` key.

### 2. Google Cloud
1. Create a project at console.cloud.google.com.
2. Go to **APIs & Services > Library**, find **Gmail API**, and enable it.
3. Go to **OAuth consent screen**. Choose External and fill in the app name and your email.
   - Under scopes, add `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.metadata`.
   - Under test users, add every Gmail address that will sign in (including yours).
4. Go to **Credentials > Create credentials > OAuth client ID** and choose Web application.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Copy the client ID and client secret.

### 3. Connect Google to Supabase
1. In Supabase, go to **Authentication > Providers > Google**. Enable it and paste the client ID and secret.
2. Go to **Authentication > URL Configuration**:
   - Site URL: your production URL, e.g. `https://outreach-xyz.vercel.app`
   - Redirect URLs: add `https://outreach-xyz.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`

### 4. Deploy
1. Import this repo into Vercel.
2. Add the variables from [`.env.example`](.env.example). Generate `CRON_SECRET` with `openssl rand -hex 32`.
3. Deploy.

### 5. Turn on the sender
Open [`supabase/cron.sql`](supabase/cron.sql), replace the app URL and `CRON_SECRET`, and run it in the SQL Editor.

### Local dev
```bash
cp .env.example .env.local   # fill it in
npm install
npm run dev
# cron doesn't reach localhost, so trigger a send pass by hand:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/send
```

## Limits worth knowing

- **Opens are approximate.** Apple Mail loads every image up front (fake opens), some inboxes block images (missed opens), and opening the email in your own Sent folder counts as an open. Trust replies, not opens.
- **Unverified Google app.** While the OAuth app is in Testing mode, only listed test users (max 100) can sign in, and Google expires their refresh token after 7 days. A campaign that runs into that pauses, and you sign in again and reschedule. Opening the app to anyone means publishing it and passing Google's verification. `gmail.send` is a sensitive scope (homepage, privacy policy, verified domain, demo video; days to weeks). `gmail.metadata` is a restricted scope, which adds a third-party security assessment that costs money and takes weeks. If you go public, consider launching without reply tracking first.
- **Gmail sending caps.** Personal Gmail accounts can send roughly 500 emails a day, and Workspace accounts more.
- **Timing.** pg_cron runs every minute, so sends land within about a minute of their slot.

## License

MIT
