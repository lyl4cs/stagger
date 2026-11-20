import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRawMessage, type Attachment } from "./mime";
import { render } from "./template";
import { getAccessToken, sendGmail, ReauthError, RetryableError } from "./gmail";
import { toContact, type Campaign, type Recipient } from "./types";

const STALE_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 5;

type Token = { user_id: string; email: string; refresh_token: string };

/** Called once a minute by the cron job. Sends every email that is due, up to `limit`. */
export async function processDue(db: SupabaseClient, limit = 10) {
  // A row stuck in "sending" means a previous run died mid-send. Gmail may or may not
  // have accepted it, so never resend automatically: mark it and let the user check.
  await db
    .from("recipients")
    .update({ status: "error", error: "Interrupted while sending. Check your Sent folder before resending." })
    .eq("status", "sending")
    .lt("claimed_at", new Date(Date.now() - STALE_MINUTES * 60_000).toISOString());

  const { data: claimed, error } = await db.rpc("claim_due_recipients", { max_rows: limit });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const due = (claimed ?? []) as Recipient[];
  if (!due.length) return { sent: 0, failed: 0 };

  const campaignIds = [...new Set(due.map((r) => r.campaign_id))];
  const { data: campaignRows } = await db.from("campaigns").select("*").in("id", campaignIds);
  const campaigns = new Map(((campaignRows ?? []) as Campaign[]).map((c) => [c.id, c]));

  const userIds = [...new Set([...campaigns.values()].map((c) => c.user_id))];
  const { data: tokenRows } = await db.from("gmail_tokens").select("*").in("user_id", userIds);
  const tokens = new Map(((tokenRows ?? []) as Token[]).map((t) => [t.user_id, t]));

  const accessTokens = new Map<string, string>();
  const reauthUsers = new Set<string>();
  const attachments = new Map<string, Attachment | undefined>();
  let sent = 0, failed = 0;

  for (const r of due) {
    const c = campaigns.get(r.campaign_id);
    if (!c) continue;
    try {
      if (reauthUsers.has(c.user_id)) throw new ReauthError("Google sign-in expired");
      const token = tokens.get(c.user_id);
      if (!token) throw new ReauthError("No Google sign-in on file");

      let access = accessTokens.get(c.user_id);
      if (!access) {
        access = await getAccessToken(token.refresh_token);
        accessTokens.set(c.user_id, access);
      }
      if (!attachments.has(c.id)) attachments.set(c.id, await loadAttachment(db, c));

      const contact = toContact(r);
      const raw = buildRawMessage({
        fromName: c.sender_name || undefined,
        fromEmail: token.email,
        to: r.email,
        subject: render(c.subject, contact),
        body: render(c.body, contact),
        attachment: attachments.get(c.id),
      });
      const messageId = await sendGmail(access, raw);
      await db.from("recipients")
        .update({ status: "sent", sent_at: new Date().toISOString(), gmail_message_id: messageId, error: null })
        .eq("id", r.id);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ReauthError) {
        // Pause the whole campaign and put this row back untouched. The user signs in
        // again and hits Schedule, which picks up everything not yet sent.
        reauthUsers.add(c.user_id);
        await db.from("recipients").update({ status: "queued", attempts: r.attempts - 1, error: msg }).eq("id", r.id);
        await db.from("campaigns").update({ status: "needs_reauth" }).eq("id", c.id);
      } else if (e instanceof RetryableError && r.attempts < MAX_ATTEMPTS) {
        const retryAt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000).toISOString();
        await db.from("recipients").update({ status: "queued", send_at: retryAt, error: msg }).eq("id", r.id);
      } else {
        await db.from("recipients").update({ status: "error", error: msg }).eq("id", r.id);
        failed++;
      }
    }
  }

  for (const c of campaigns.values()) await finishIfDone(db, c, tokens.get(c.user_id), accessTokens.get(c.user_id));
  return { sent, failed };
}

async function loadAttachment(db: SupabaseClient, c: Campaign): Promise<Attachment | undefined> {
  if (!c.attachment_path) return undefined;
  const { data, error } = await db.storage.from("attachments").download(c.attachment_path);
  if (error || !data) throw new Error(`Could not load attachment: ${error?.message ?? "missing"}`);
  const filename = c.attachment_name || c.attachment_path.split("/").pop() || "attachment";
  const contentType = data.type || (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
  return { filename, contentType, data: Buffer.from(await data.arrayBuffer()) };
}

async function finishIfDone(db: SupabaseClient, c: Campaign, token?: Token, access?: string) {
  const { data: fresh } = await db.from("campaigns").select("status").eq("id", c.id).single();
  if (fresh?.status !== "scheduled") return;
  const { count } = await db.from("recipients").select("id", { count: "exact", head: true })
    .eq("campaign_id", c.id).in("status", ["queued", "sending"]);
  if (count) return;

  await db.from("campaigns").update({ status: "done" }).eq("id", c.id);

  // Best-effort summary email to the sender.
  if (!token || !access) return;
  const { data: rows } = await db.from("recipients").select("email,status,error").eq("campaign_id", c.id);
  const list = (rows ?? []) as Pick<Recipient, "email" | "status" | "error">[];
  const ok = list.filter((r) => r.status === "sent").length;
  const errors = list.filter((r) => r.status === "error");
  const body = [
    `"${c.name}" finished.`, "", `Sent: ${ok}`, `Errors: ${errors.length}`,
    ...(errors.length ? ["", ...errors.map((r) => `${r.email}: ${r.error}`)] : []),
  ].join("\n");
  try {
    await sendGmail(access, buildRawMessage({ fromEmail: token.email, to: token.email, subject: `Campaign finished: ${ok} sent`, body }));
  } catch { /* summary is optional */ }
}
