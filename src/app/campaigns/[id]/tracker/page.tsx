"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth-client";
import type { Campaign, Recipient } from "@/lib/types";
import { campaignLook, personLook, nextSendAt, lastSendAt, activity, fmtWhen, type PersonLook } from "@/lib/view";
import { Header, BackLink, CampaignPill, PersonPill, Ring, Toast, PausedBanner, dotStyle, type ToastMsg } from "@/components/ui";
import { Pencil } from "@/components/icons";
import { DeleteCampaign } from "@/components/DeleteCampaign";

type Filter = "all" | "waiting" | "sent" | "opened" | "replied" | "errors";
const GROUPS: Record<Filter, (l: PersonLook) => boolean> = {
  all: () => true,
  waiting: (l) => l === "waiting" || l === "sending",
  sent: (l) => l === "sent" || l === "opened" || l === "replied",
  opened: (l) => l === "opened" || l === "replied",
  replied: (l) => l === "replied",
  errors: (l) => l === "error",
};
const LABELS: [Filter, string][] = [["all", "All"], ["waiting", "Waiting"], ["sent", "Sent"], ["opened", "Opened"], ["replied", "Replied"], ["errors", "Errors"]];

// Order: in-flight first, then sent (newest first), then the queue in send order, skipped last.
function sortKey(r: Recipient): [number, number] {
  const l = personLook(r);
  if (l === "sending") return [0, 0];
  if (l === "waiting") return [2, r.send_at ? new Date(r.send_at).getTime() : Infinity];
  if (l === "skipped") return [3, 0];
  const t = r.sent_at ?? r.reply_checked_at ?? r.claimed_at;
  return [1, -(t ? new Date(t).getTime() : 0)];
}

export default function Tracker() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState<string>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<ToastMsg>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const [{ data: c }, { data: r }] = await Promise.all([
      sb.from("campaigns").select("*").eq("id", id).single(),
      sb.from("recipients").select("*").eq("campaign_id", id).order("position"),
    ]);
    if (!c) return router.replace("/campaigns");
    setCampaign(c as Campaign);
    setRows((r ?? []) as Recipient[]);
    setNow(new Date());
  }, [sb, id, router]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/");
      setEmail(user.email);
      load();
    })();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [sb, router, load]);

  async function retry(r: Recipient) {
    const scheduled = campaign?.status === "scheduled";
    const patch = scheduled ? { status: "queued" as const, send_at: new Date().toISOString(), error: null } : { status: "pending" as const, error: null };
    const { error } = await sb.from("recipients").update(patch).eq("id", r.id);
    if (error) return setToast({ kind: "error", text: "Couldn't retry.", detail: error.message });
    setToast({ kind: "ok", text: scheduled ? `${r.first_name || r.email} is back in the queue.` : "Moved back to the draft. Schedule again to send it." });
    load();
  }

  async function cancel() {
    const res = await fetch(`/api/campaigns/${id}/cancel`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setToast({ kind: "error", text: json.error ?? "Couldn't cancel." });
    setToast({ kind: "ok", text: `Stopped. ${json.cancelled} emails won't go out.` });
    load();
  }

  const body = !campaign || !rows ? <TrackerSkeleton /> : (() => {
    const look = campaignLook(campaign, now.getTime());
    const active = rows.filter((r) => r.status !== "skipped");
    const sent = rows.filter((r) => r.status === "sent").length;
    const opened = rows.filter((r) => r.opened_at).length;
    const replied = rows.filter((r) => r.replied_at).length;
    const waiting = rows.filter((r) => r.status === "queued" || r.status === "pending").length;
    const next = nextSendAt(rows), last = lastSendAt(rows);
    const lastSent = rows.map((r) => r.sent_at).filter(Boolean).sort().at(-1);
    const list = rows.filter((r) => GROUPS[filter](personLook(r)))
      .sort((a, b) => { const [x, y] = [sortKey(a), sortKey(b)]; return x[0] - y[0] || x[1] - y[1]; });
    const feed = activity(campaign, rows);

    const line = look === "paused" ? "Paused until you sign in again."
      : look === "done" ? (lastSent ? `Finished ${fmtWhen(lastSent, now)}.` : "Finished.")
      : look === "draft" ? "Not scheduled."
      : look === "scheduled" && next ? null
      : next ? null : "Sending the last one.";

    return (
      <>
        {look === "paused" && <PausedBanner waiting={waiting} onSignIn={() => signInWithGoogle({ forceConsent: true })} />}

        <section className="flex flex-wrap items-center gap-8">
          <Ring value={sent} total={active.length} done={look === "done"} />
          <div className="flex flex-[1_1_360px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <h1 className="m-0 text-4xl font-medium tracking-[-0.025em] sm:text-[44px]">{campaign.name}</h1>
              <CampaignPill look={look} large />
            </div>
            <span className="text-lg text-muted">
              {line ?? (
                <>
                  {look === "scheduled" ? "Starts " : "Next email at "}
                  <span className="mono text-ink">{fmtWhen(next!, now)}</span>.
                  {last && last.getTime() !== next!.getTime() && <> Last one around {fmtWhen(last, now)}.</>}
                </>
              )}
            </span>
          </div>
          <div className="flex gap-3">
            <div className="brk flex min-w-24 flex-col gap-1.5 px-5 py-3.5" style={{ ["--s" as string]: "10px" }} title="Approximate. Apple Mail and image blocking skew opens.">
              <span className="mono text-[11px] tracking-[0.06em] text-dim">OPENED</span>
              <span className="text-[30px] font-medium">{opened}</span>
            </div>
            <div className="brk flex min-w-24 flex-col gap-1.5 px-5 py-3.5" style={{ ["--s" as string]: "10px" }}>
              <span className="mono text-[11px] tracking-[0.06em] text-dim">REPLIED</span>
              <span className={`text-[30px] font-medium ${replied ? "text-mint" : ""}`}>{replied}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="toolbar" aria-label="Filter recipients" className="flex flex-wrap gap-2">
            {LABELS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} className={`fp ${filter === key ? "on" : ""}`} onClick={() => setFilter(key)}>
                {label} <span className="ct">{rows.filter((r) => GROUPS[key](personLook(r))).length}</span>
              </button>
            ))}
          </div>
          {campaign.status === "scheduled" && <button type="button" className="btn-secondary !h-[46px] !text-base" onClick={cancel}>Cancel remaining</button>}
        </div>

        <div className="flex flex-wrap items-start gap-8">
          <section aria-label="Recipients" className="min-w-0 flex-[999_1_560px] rounded-2xl border border-line bg-surface py-2">
            {list.length === 0 ? (
              <div className="px-6 py-12 text-center text-base text-muted">Nobody here yet.</div>
            ) : (
              <ol className="m-0 list-none p-0">
                {list.map((r) => {
                  const l = personLook(r);
                  const time = l === "sending" ? "Now" : l === "waiting" ? (r.send_at ? fmtWhen(r.send_at, now) : "Not scheduled")
                    : l === "skipped" ? "" : r.sent_at ? fmtWhen(r.sent_at, now) : "";
                  return (
                    <li key={r.id} className="tl flex gap-[18px] px-6">
                      <div aria-hidden className="flex w-3.5 flex-col items-center">
                        <span className="h-[22px] w-px bg-[#2a2a2a]" />
                        <span className={`block h-2.5 w-2.5 flex-none rounded-full ${dotStyle[l]}`} />
                        <span className="w-px flex-1 bg-[#2a2a2a]" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2.5 border-b border-[#1e1e1e] py-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                            <span className="text-[17px] font-medium">{`${r.first_name} ${r.last_name}`.trim() || r.email}</span>
                            <span className="mono truncate text-[13px] text-dim">{r.email}</span>
                          </div>
                          <PersonPill look={l} />
                          <span className="mono w-28 text-right text-sm text-muted">{time}</span>
                        </div>
                        {l === "error" && (
                          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-coral/25 bg-coral/7 px-3.5 py-3">
                            <span className="flex-[1_1_220px] text-sm text-coral-ink">{r.error}</span>
                            {!/bounce/i.test(r.error ?? "") && (
                              <button type="button" onClick={() => retry(r)} className="h-9 rounded-[10px] border border-coral/45 px-3.5 text-sm text-coral-ink hover:bg-coral/10">Retry</button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <aside aria-label="Activity" className="flex flex-[1_1_300px] flex-col gap-4">
            <span className="label">Activity</span>
            {feed.length === 0 ? <span className="text-[15px] text-muted">Nothing yet.</span> : (
              <ul className="m-0 flex list-none flex-col p-0">
                {feed.map((f, i) => (
                  <li key={f.key} className={`flex gap-3.5 py-3 text-[15px] ${i < feed.length - 1 ? "border-b border-[#1e1e1e]" : ""}`}>
                    <span className={`mt-[7px] h-2 w-2 flex-none rounded-full ${
                      f.kind === "sending" ? "bg-mint anim-ring" : f.kind === "replied" ? "bg-mint" : f.kind === "error" ? "bg-coral"
                      : f.kind === "started" ? "border-[1.5px] border-dim" : f.kind === "opened" ? "bg-[#8a8a8a]" : "bg-ink"}`} />
                    <span className={`flex-1 ${f.kind === "replied" ? "text-mint" : f.kind === "started" ? "text-muted" : ""}`}>{f.text}</span>
                    <span className="mono text-[13px] text-dim">{fmtWhen(f.at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </>
    );
  })();

  return (
    <>
      <Header email={email} />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-9 px-6 pb-24 pt-10 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <BackLink href="/campaigns" />
          <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-2 text-[15px] text-muted no-underline hover:text-ink"><Pencil />Campaign details</Link>
        </div>
        {body}
        {campaign && rows && <div className="flex justify-end">
          <DeleteCampaign id={campaign.id} name={campaign.name} variant="text"
            queued={rows.filter((r) => r.status === "queued" || r.status === "sending").length}
            onDeleted={() => router.replace("/campaigns")} />
        </div>}
      </main>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}

function TrackerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading recipients" className="rounded-2xl border border-line bg-surface px-6 py-2">
      {[40, 32, 46].map((w, i) => (
        <div key={w} className={`flex items-center gap-[18px] py-4 ${i < 2 ? "border-b border-[#1e1e1e]" : ""}`}>
          <span className="sk h-2.5 w-2.5 !rounded-full" />
          <div className="flex flex-1 flex-col gap-2"><span className="sk h-3.5" style={{ width: `${w}%` }} /><span className="sk h-2.5" style={{ width: `${w + 15}%` }} /></div>
          <span className="sk h-6 w-[70px] !rounded-full" />
        </div>
      ))}
    </div>
  );
}
