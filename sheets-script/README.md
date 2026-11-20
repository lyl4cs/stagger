# Google Sheets version

Send personalized emails from your own Gmail to a list in a Google Sheet, on a schedule. Fill in a template once, and each person gets their own copy with their name, company, and an optional custom line.

It runs on Google's servers, so your computer can be off when the emails go out.

## What it does

- **Template with placeholders**: `{{FirstName}}`, `{{Company}}`, `{{CustomLine}}`, or any column in your sheet
- **Scheduled send**: pick a start time, and it sends one email every few minutes so they don't all land at once
- **Never double-sends**: each row is marked `Sent` with a timestamp. Type `Skip` in a row's Status to leave someone out
- **Blocks half-finished templates**: any `[TEXT IN BRACKETS]` left in the template stops it from scheduling
- **Resume attachment**: paste a Google Drive link and it attaches the file (Google Docs are sent as PDF)
- **Import from a raw paste**: paste a messy contact export (Apollo and similar) and it pulls out names, titles, emails and locations
- **Summary email** when the run finishes, listing anything that failed

## Setup (about 2 minutes)

1. Make a Google Sheet. Put contacts on the first tab with these headers, or start blank and use the Paste tab import:
   `FirstName, LastName, Email, Title, Company, Location`
2. In the sheet: **Extensions > Apps Script**. Delete what's there, paste in [`Code.gs`](Code.gs), click **Save**.
3. Reload the sheet. A **Mail Merge** menu appears. Click **1. Set up sheet**.
4. Google asks you to authorize the script. Because it's your own script and not a published app, you'll see "Google hasn't verified this app." Click **Advanced > Go to (project name)** and allow it. It needs to send mail as you and read the resume file you point it at.
5. Check **File > Settings > Time zone** is yours. Scheduled times use it.

## Sending

1. Edit the **Template** tab.
2. **Mail Merge > 2. Preview first email** to see exactly what the first person gets.
3. **Mail Merge > 3. Send test to myself** and check it in your inbox.
4. **Mail Merge > 4. Schedule send...** and pick a time (defaults to tomorrow 10:00).

To stop a run: **Mail Merge > Cancel scheduled send**. To see progress: **Mail Merge > Show status**.

## Limits

- Free Gmail accounts can send about 100 emails a day through Apps Script (Workspace accounts: 1,500). If it hits the limit it waits a day and carries on.
- Scheduled triggers fire within a few minutes of the time you pick, not to the second.
- Emails are plain text, which reads more like a personal email than an HTML template does.

## License

MIT
