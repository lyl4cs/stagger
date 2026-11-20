// Pure helpers that turn database rows into what the screens show.
// Kept separate from components so they're easy to test.

import type { Campaign, Recipient } from "./types";

export type CampaignLook = "draft" | "scheduled" | "sending" | "done" | "paused";
export type PersonLook = "replied" | "opened" | "sent" | "sending" | "waiting" | "error" | "skipped";

export function campaignLook(c: Pick<Campaign, "status" | "start_at">, now = Date.now()): CampaignLook {
  if (c.status === "needs_reauth") return "paused";
  if (c.status === "scheduled") return c.start_at && new Date(c.start_at).getTime() <= now ? "sending" : "scheduled";
  return c.status;
}

export function personLook(r: Pick<Recipient, "status" | "opened_at" | "replied_at">): PersonLook {
  if (r.replied_at) return "replied";
  if (r.status === "sent") return r.opened_at ? "opened" : "sent";
  if (r.status === "queued" || r.status === "pending") return "waiting";
  return r.status;
}

export const isSent = (r: Pick<Recipient, "status" | "replied_at">) => r.status === "sent" || !!r.replied_at;

export function nextSendAt(rs: Pick<Recipient, "status" | "send_at">[]): Date | null {
  const t = rs.filter((r) => r.status === "queued" && r.send_at).map((r) => new Date(r.send_at!).getTime());
  return t.length ? new Date(Math.min(...t)) : null;
}

export function lastSendAt(rs: Pick<Recipient, "status" | "send_at">[]): Date | null {
  const t = rs.filter((r) => r.status === "queued" && r.send_at).map((r) => new Date(r.send_at!).getTime());
  return t.length ? new Date(Math.max(...t)) : null;
}

/** Monday 00:00 local time of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export type Counters = { sentAll: number; sentWeek: number; replies: number; scheduled: number };

export function counters(rs: Pick<Recipient, "status" | "sent_at" | "replied_at">[], now = new Date()): Counters {
  const week = startOfWeek(now).getTime();
  return {
    sentAll: rs.filter((r) => r.status === "sent").length,
    sentWeek: rs.filter((r) => r.status === "sent" && r.sent_at && new Date(r.sent_at).getTime() >= week).length,
    replies: rs.filter((r) => r.replied_at).length,
    scheduled: rs.filter((r) => r.status === "queued").length,
  };
}

export type ActivityItem = { key: string; kind: "started" | "sending" | "sent" | "opened" | "replied" | "error"; text: string; at: Date };

export function activity(c: Pick<Campaign, "start_at">, rs: Recipient[], limit = 12): ActivityItem[] {
  const name = (r: Recipient) => `${r.first_name} ${r.last_name}`.trim() || r.email;
  const items: ActivityItem[] = [];
  if (c.start_at) items.push({ key: "start", kind: "started", text: "Campaign started", at: new Date(c.start_at) });
  for (const r of rs) {
    if (r.status === "sending" && r.claimed_at) items.push({ key: `${r.id}-sending`, kind: "sending", text: `Sending to ${name(r)}`, at: new Date(r.claimed_at) });
    if (r.sent_at) items.push({ key: `${r.id}-sent`, kind: "sent", text: `Sent to ${name(r)}`, at: new Date(r.sent_at) });
    if (r.opened_at) items.push({ key: `${r.id}-open`, kind: "opened", text: `${name(r)} opened`, at: new Date(r.opened_at) });
    if (r.replied_at) items.push({ key: `${r.id}-reply`, kind: "replied", text: `${name(r)} replied`, at: new Date(r.replied_at) });
    if (r.status === "error") {
      const at = r.reply_checked_at ?? r.claimed_at ?? r.send_at;
      if (at) items.push({ key: `${r.id}-err`, kind: "error", text: /bounce/i.test(r.error ?? "") ? `${name(r)} bounced` : `Couldn't send to ${name(r)}`, at: new Date(at) });
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? "Late night." : h < 12 ? "Morning." : h < 17 ? "Afternoon." : "Evening.";
}

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "10:06 AM" today, "Fri 10:00 AM" otherwise. */
export function fmtWhen(d: Date | string, now = new Date()): string {
  const x = new Date(d);
  const sameDay = x.toDateString() === now.toDateString();
  return sameDay ? fmtTime(x) : `${x.toLocaleDateString(undefined, { weekday: "short" })} ${fmtTime(x)}`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
