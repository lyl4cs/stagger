"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Header, CampaignPill, ProgressBar, CounterTile, Toast, type ToastMsg } from "@/components/ui";
import { Posty } from "@/components/Posty";
import { Plus, Reply, ArrowRight } from "@/components/icons";
import { campaignLook, counters, nextSendAt, greeting, fmtWhen, type CampaignLook } from "@/lib/view";
import { personProblems } from "@/lib/template";
import type { Campaign, Recipient } from "@/lib/types";

type Row = Campaign & { recipients: Pick<Recipient, "status" | "sent_at" | "send_at" | "replied_at" | "company" | "first_name" | "email">[] };

export default function Home() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [email, setEmail] = useState<string>();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [toast, setToast] = useState<ToastMsg>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data, error } = await sb.from("campaigns")
      .select("*, recipients(status,sent_at,send_at,replied_at,company,first_name,email)")
      .order("created_at", { ascending: false });
    if (error) setToast({ kind: "error", text: "Couldn't load campaigns.", detail: error.message });
    else setRows((data ?? []) as Row[]);
    setNow(new Date());
  }, [sb]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/");
      setEmail(user.email);
      load();
    })();
    const t = setInterval(load, 20_000); // live counters while you watch
    return () => clearInterval(t);
  }, [sb, router, load]);

  async function create() {
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from("campaigns")
      .insert({ sender_name: user?.user_metadata?.full_name ?? "" }).select("id").single();
    if (error) return setToast({ kind: "error", text: "Couldn't create a campaign.", detail: error.message });
    router.push(`/campaigns/${data.id}`);
  }

  const all = rows?.flatMap((r) => r.recipients) ?? [];
  const c = counters(all, now);
  const pausedCount = rows?.filter((r) => r.status === "needs_reauth").length ?? 0;
  const sub = pausedCount
    ? `${pausedCount} campaign${pausedCount > 1 ? "s need" : " needs"} you.`
    : c.scheduled ? `${c.scheduled} email${c.scheduled > 1 ? "s are" : " is"} queued. Nothing needs you.` : "Nothing scheduled right now.";
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).toUpperCase();

  return (
    <>
      <Header email={email} />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-6 pb-24 pt-14 sm:px-10">
        {rows === null ? <HomeSkeleton /> : (
          <>
            {rows.length > 0 && (
              <section className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex flex-col gap-3.5">
                  <span className="mono text-[13px] tracking-[0.04em] text-dim">[ {dateLabel} ]</span>
                  <h1 className="m-0 text-[40px] font-medium leading-[1.08] tracking-[-0.025em] sm:text-5xl">
                    {greeting(now)}<br /><span className="text-dim">{sub}</span>
                  </h1>
                </div>
                <button onClick={create} className="btn-primary"><Plus size={18} />New campaign</button>
              </section>
            )}

            <section aria-label="Totals" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
              <CounterTile index={1} label="Sent all time" value={c.sentAll} muted={!rows.length} />
              <CounterTile index={2} label="Sent this week" value={c.sentWeek} muted={!rows.length} />
              <CounterTile index={3} label="Replies" value={c.replies} accent={c.replies > 0} muted={!rows.length} />
              <CounterTile index={4} label="Scheduled now" value={c.scheduled} muted={!rows.length} />
            </section>

            {rows.length === 0 ? <EmptyState onCreate={create} /> : (
              <section className="flex flex-col gap-5">
                <div className="flex items-baseline gap-3">
                  <h2 className="m-0 text-2xl font-medium tracking-[-0.01em]">Campaigns</h2>
                  <span className="mono text-[13px] text-dim">{String(rows.length).padStart(2, "0")}</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {rows.map((r) => <CampaignCard key={r.id} c={r} now={now} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}

function CampaignCard({ c, now }: { c: Row; now: Date }) {
  const look: CampaignLook = campaignLook(c, now.getTime());
  const rs = c.recipients;
  const active = rs.filter((r) => r.status !== "skipped");
  const sent = rs.filter((r) => r.status === "sent").length;
  const replies = rs.filter((r) => r.replied_at).length;
  const next = nextSendAt(rs);
  const lastSent = rs.map((r) => r.sent_at).filter(Boolean).sort().at(-1);
  const pendingPeople = rs.filter((r) => r.status === "pending");
  const draftProblem = look !== "draft" ? null
    : !rs.length ? "No contacts yet"
    : !c.subject.trim() ? "Email needs a subject"
    : /\[[^\]\n]{2,80}\]/.test(`${c.subject}\n${c.body}`) ? "Brackets to fill"
    : pendingPeople.some((r) => personProblems({ firstName: r.first_name, company: r.company, email: r.email }, c.subject, c.body).length) ? "Some contacts need a look"
    : "Ready to schedule";
  const href = look === "draft" ? `/campaigns/${c.id}` : `/campaigns/${c.id}/tracker`;

  return (
    <Link href={href} className="card-link flex flex-col gap-5 rounded-2xl border border-line bg-card p-6 no-underline">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-[19px] font-semibold">{c.name}</span>
          <span className="text-sm text-dim">{rs.length} contact{rs.length === 1 ? "" : "s"}</span>
        </div>
        <CampaignPill look={look} />
      </div>
      <div className="flex flex-col gap-2.5">
        <ProgressBar value={sent} total={active.length} look={look} />
        <div className="flex justify-between gap-3 text-sm">
          {look === "draft" ? (
            <><span className="whitespace-nowrap text-muted">Not scheduled</span><span className={`truncate ${draftProblem === "Ready to schedule" ? "text-mint" : "text-muted"}`}>{draftProblem}</span></>
          ) : (
            <>
              <span>{sent} of {active.length} sent</span>
              {look === "paused" ? <span className="text-coral-ink">Sign in again to resume</span>
                : look === "done" ? <span className="mono text-muted">{lastSent ? `Finished ${fmtWhen(lastSent, now)}` : "Finished"}</span>
                : next ? <span className="mono text-muted">Next: {fmtWhen(next, now)}</span> : null}
            </>
          )}
        </div>
      </div>
      <div className={`flex items-center justify-between border-t border-[#222] pt-4 text-sm ${replies ? "text-mint" : "text-muted"}`}>
        {look === "draft" ? <span>Keep editing</span> : (
          <span className="inline-flex items-center gap-2"><Reply />{replies ? `${replies} repl${replies === 1 ? "y" : "ies"}` : "No replies yet"}</span>
        )}
        <span className="text-muted"><ArrowRight /></span>
      </div>
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-center gap-7 rounded-2xl border border-dashed border-[#2e2e2e] px-8 pb-20 pt-[72px] text-center">
      <div className="relative flex h-[150px] w-[180px] items-end justify-center">
        <span aria-hidden className="mono absolute right-[18px] top-1 text-[22px] text-dim" style={{ animation: "zz 2.6s ease-out infinite" }}>z</span>
        <span aria-hidden className="mono absolute right-[38px] top-[26px] text-[15px] text-[#6b6b6b]" style={{ animation: "zz 2.6s ease-out 1.1s infinite" }}>z</span>
        <Posty mood="empty" width={150} style={{ animation: "breathe 3.4s ease-in-out infinite" }} />
      </div>
      <div className="flex max-w-[460px] flex-col gap-2.5">
        <h1 className="m-0 text-[30px] font-medium tracking-[-0.02em]">No campaigns yet.</h1>
        <p className="m-0 text-lg leading-normal text-muted">Paste some emails to start. Posty is napping until then.</p>
      </div>
      <button onClick={onCreate} className="btn-primary"><Plus size={18} />New campaign</button>
      <span className="mono text-xs tracking-[0.04em] text-dim">[ WORKS WITH CSV, PLAIN EMAILS, OR AN APOLLO EXPORT ]</span>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-14">
      <div className="flex flex-col gap-3"><span className="sk h-3 w-28" /><span className="sk h-10 w-80" /><span className="sk h-10 w-[28rem] max-w-full" /></div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="brk flex min-h-[150px] flex-col gap-5 p-6"><span className="sk h-3 w-32" /><span className="sk h-14 w-20" /></div>)}
      </div>
    </div>
  );
}
