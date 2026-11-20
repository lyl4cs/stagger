"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth-client";
import { parseContacts } from "@/lib/parse";
import { globalProblems, personProblems } from "@/lib/template";
import { fromContact, toContact, type Campaign, type Recipient } from "@/lib/types";
import { campaignLook, personLook, nextSendAt, fmtWhen, fmtBytes } from "@/lib/view";
import {
  Header, BackLink, CampaignPill, PersonPill, Ring, Toast, OkBanner, PausedBanner, StepHeader, Card, type ToastMsg,
} from "@/components/ui";
import { TemplateEditor } from "@/components/TemplateEditor";
import { EmailPreview } from "@/components/EmailPreview";
import { Posty } from "@/components/Posty";
import { ChevL, ChevR, Clip, X, Minus, Plus, Alert, Check, ArrowRight, Pencil } from "@/components/icons";

const COLLAPSED_ROWS = 8;

const pad = (n: number) => String(n).padStart(2, "0");
function tomorrow10() {
  const d = new Date(Date.now() + 86_400_000);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: "10:00" };
}

export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

  const [user, setUser] = useState<User | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [paste, setPaste] = useState("");
  const [added, setAdded] = useState<{ added: number; dupes: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [when, setWhen] = useState(tomorrow10);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMsg>(null);

  const loadRecipients = useCallback(async () => {
    const { data } = await sb.from("recipients").select("*").eq("campaign_id", id).order("position");
    setRecipients((data ?? []) as Recipient[]);
  }, [sb, id]);
  const loadCampaign = useCallback(async () => {
    const { data } = await sb.from("campaigns").select("*").eq("id", id).single();
    if (data) setCampaign(data as Campaign);
    else router.replace("/campaigns");
  }, [sb, id, router]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/");
      setUser(user);
      await Promise.all([loadCampaign(), loadRecipients()]);
    })();
  }, [sb, router, loadCampaign, loadRecipients]);

  // Live updates while a run is going.
  useEffect(() => {
    if (campaign?.status !== "scheduled") return;
    const t = setInterval(() => { loadCampaign(); loadRecipients(); }, 15_000);
    return () => clearInterval(t);
  }, [campaign?.status, loadCampaign, loadRecipients]);

  if (!campaign || !recipients) {
    return (<><Header email={user?.email} /><main className="mx-auto flex w-full max-w-[1080px] flex-col gap-7 px-6 pb-28 pt-10 sm:px-8"><TableSkeleton /></main></>);
  }

  const look = campaignLook(campaign);
  const locked = campaign.status === "scheduled";
  const toSend = recipients.filter((r) => r.status === "pending" || r.status === "queued");
  const active = recipients.filter((r) => r.status !== "skipped");
  const global = globalProblems(campaign.subject, campaign.body);
  const blockedPeople = toSend.filter((r) => personProblems(toContact(r), campaign.subject, campaign.body).length > 0);
  const previewList = active.length ? active : recipients;
  const pIdx = previewList.length ? ((previewIdx % previewList.length) + previewList.length) % previewList.length : 0;
  const current = previewList[pIdx];
  const currentProblems = current ? [...personProblems(toContact(current), campaign.subject, campaign.body), ...global] : global;

  const blockers: string[] = [];
  if (global.some((p) => p.includes("still in the email"))) blockers.push("fill the brackets");
  if (!campaign.subject.trim()) blockers.push("add a subject");
  if (!campaign.body.trim()) blockers.push("write the email");
  if (global.some((p) => p.includes("isn't a placeholder"))) blockers.push("fix the unknown placeholder");
  if (blockedPeople.length) blockers.push(`fix or skip ${blockedPeople.length} contact${blockedPeople.length > 1 ? "s" : ""}`);
  if (!toSend.length) blockers.push("add contacts");
  const blocked = blockers.length > 0;

  const start = new Date(`${when.date}T${when.time}`);
  const last = new Date(start.getTime() + Math.max(toSend.length - 1, 0) * campaign.gap_minutes * 60_000);
  const sentCount = recipients.filter((r) => r.status === "sent").length;

  /* ---------- data actions ---------- */

  async function saveCampaign(patch: Partial<Campaign>) {
    setCampaign((c) => (c ? { ...c, ...patch } : c));
    const { error } = await sb.from("campaigns").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setToast({ kind: "error", text: "Couldn't save.", detail: error.message });
  }

  async function addContacts() {
    const parsed = parseContacts(paste);
    if (!parsed.length) return setToast({ kind: "error", text: "No email addresses found in that paste." });
    const base = recipients?.length ?? 0;
    const rows = parsed.map((c, i) => ({ ...fromContact(c), campaign_id: id, position: base + i }));
    const { data, error } = await sb.from("recipients").upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true }).select("id");
    if (error) return setToast({ kind: "error", text: "Couldn't add contacts.", detail: error.message });
    const n = data?.length ?? 0;
    setAdded({ added: n, dupes: parsed.length - n });
    setPaste("");
    loadRecipients();
  }

  async function patchRecipient(r: Recipient, patch: Partial<Recipient>) {
    setRecipients((list) => list?.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) ?? null);
    const { error } = await sb.from("recipients").update(patch).eq("id", r.id);
    if (error) setToast({ kind: "error", text: "Couldn't save that change.", detail: error.message });
  }
  const editLocal = (r: Recipient, patch: Partial<Recipient>) =>
    setRecipients((list) => list?.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) ?? null);

  async function removeRecipient(r: Recipient) {
    setRecipients((list) => list?.filter((x) => x.id !== r.id) ?? null);
    await sb.from("recipients").delete().eq("id", r.id);
  }

  async function upload(file: File) {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) return setToast({ kind: "error", text: "Keep attachments under 10 MB." });
    setBusy("upload");
    const path = `${user.id}/${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await sb.storage.from("attachments").upload(path, file, { contentType: file.type });
    setBusy(null);
    if (error) return setToast({ kind: "error", text: "Upload failed.", detail: error.message });
    if (campaign?.attachment_path) await sb.storage.from("attachments").remove([campaign.attachment_path]);
    saveCampaign({ attachment_path: path, attachment_name: file.name, attachment_size: file.size });
  }

  async function removeAttachment() {
    if (campaign?.attachment_path) await sb.storage.from("attachments").remove([campaign.attachment_path]);
    saveCampaign({ attachment_path: null, attachment_name: null, attachment_size: null });
  }

  async function post(path: string, body: unknown) {
    setBusy(path);
    const res = await fetch(`/api/campaigns/${id}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setToast({ kind: "error", text: json.problems?.length ? json.problems[0] : (json.error ?? "Something went wrong.") });
      return null;
    }
    return json;
  }

  async function sendTest() {
    const r = await post("test", { recipientId: current?.id });
    if (r) setToast({ kind: "ok", text: "Test sent to you. Check your inbox." });
  }

  async function schedule() {
    setConfirming(false);
    const r = await post("schedule", { startAt: start.toISOString() });
    if (r) {
      setToast({ kind: "ok", text: `Scheduled ${r.scheduled} emails.` });
      loadCampaign(); loadRecipients();
    }
  }

  async function cancel() {
    const r = await post("cancel", {});
    if (r) { setToast({ kind: "ok", text: `Stopped. ${r.cancelled} emails won't go out.` }); loadCampaign(); loadRecipients(); }
  }

  /* ---------- view ---------- */

  const shown = expanded ? recipients : recipients.slice(0, COLLAPSED_ROWS);
  const hidden = recipients.slice(COLLAPSED_ROWS);
  const hiddenIssues = hidden.filter((r) => r.status !== "skipped" && personProblems(toContact(r), campaign.subject, campaign.body).length).length;
  const brackets = [...new Set(`${campaign.subject}\n${campaign.body}`.match(/\[[^\]\n]{2,80}\]/g) ?? [])];

  return (
    <>
      <Header email={user?.email} />
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-7 px-6 pb-28 pt-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <BackLink href="/campaigns" />
          {look !== "draft" && (
            <Link href={`/campaigns/${id}/tracker`} className="inline-flex items-center gap-2 text-[15px] text-muted no-underline hover:text-ink">Open tracker <ArrowRight /></Link>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
          <label className="flex flex-[1_1_420px] flex-col gap-2">
            <span className="label">Campaign name</span>
            <div className="group flex items-center gap-3">
              <input
                aria-label="Campaign name"
                placeholder="Name this campaign"
                className="name-input w-full bg-transparent text-4xl font-medium tracking-[-0.025em] text-ink outline-none sm:text-[44px]"
                value={campaign.name}
                // The name never goes into an email, so it stays editable even mid-run.
                // A fresh campaign's default name gets selected, so typing replaces it.
                onFocus={(e) => { if (campaign.name === "Untitled campaign") e.target.select(); }}
                onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                onBlur={(e) => saveCampaign({ name: e.target.value.trim() || "Untitled campaign" })}
              />
              <span aria-hidden className="text-dim transition-colors group-hover:text-ink"><Pencil size={20} /></span>
            </div>
          </label>
          <CampaignPill look={look} large />
        </div>

        {campaign.status === "needs_reauth" && <PausedBanner waiting={toSend.length} onSignIn={() => signInWithGoogle({ forceConsent: true })} />}

        {/* STEP 1: Contacts */}
        <Card>
          <StepHeader n={1} title="Contacts" sub="Who gets the email." />
          {!locked && (
            <div className="flex flex-col gap-3">
              <textarea
                aria-label="Paste contacts"
                placeholder="Paste emails, a CSV, or a raw export from Apollo."
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                className="mono min-h-[140px] w-full resize-y rounded-[14px] border border-dashed border-[#3a3a3a] bg-bg px-5 py-[18px] text-[15px] leading-[1.6] text-ink outline-none focus:border-mint"
              />
              <div className="flex justify-end">
                <button type="button" className="btn-secondary !h-[46px]" disabled={!paste.trim()} onClick={addContacts}>Add contacts</button>
              </div>
            </div>
          )}
          {added && (
            <OkBanner>Added {added.added} contacts ({added.dupes} duplicate{added.dupes === 1 ? "" : "s"}). <span className="text-muted">Check names before sending.</span></OkBanner>
          )}
          {recipients.length > 0 && (
            <div className="overflow-x-auto rounded-[14px] border border-[#222]">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-[15px]">
                <colgroup><col className="w-[20%]" /><col className="w-[23%]" /><col className="w-[14%]" /><col className="w-[21%]" /><col className="w-[10%]" /><col className="w-[12%]" /></colgroup>
                <thead>
                  <tr className="mono text-left text-xs tracking-[0.06em] text-dim">
                    <th scope="col" className="p-3 font-normal">NAME</th>
                    <th scope="col" className="p-3 font-normal">EMAIL</th>
                    <th scope="col" className="p-3 font-normal">COMPANY</th>
                    <th scope="col" className="p-3 font-normal">CUSTOM LINE</th>
                    <th scope="col" className="p-3 font-normal">STATUS</th>
                    <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const skipped = r.status === "skipped";
                    const sent = r.status === "sent";
                    const problems = !skipped && (r.status === "pending" || r.status === "queued") ? personProblems(toContact(r), campaign.subject, campaign.body) : [];
                    const editable = !locked && !sent;
                    return (
                      <tr key={r.id} className={`row ${skipped ? "skipped" : ""}`}>
                        <td>
                          <div className="flex min-w-0 flex-col gap-[3px]">
                            {r.first_name || !editable ? (
                              <span className="nm truncate font-medium">{`${r.first_name} ${r.last_name}`.trim() || "No name"}</span>
                            ) : (
                              <input aria-label="First name" className="cell-quiet" placeholder="Add first name" value={r.first_name}
                                onChange={(e) => editLocal(r, { first_name: e.target.value })} onBlur={(e) => patchRecipient(r, { first_name: e.target.value.trim() })} />
                            )}
                            {r.title && <span className="truncate text-[13px] text-dim" title={r.title}>{r.title}</span>}
                          </div>
                        </td>
                        <td className="mono truncate text-[13px] text-muted" title={r.email}>{r.email}</td>
                        <td>
                          <input aria-label="Company" className="cell-quiet" placeholder="None" value={r.company} disabled={!editable}
                            onChange={(e) => editLocal(r, { company: e.target.value })} onBlur={(e) => patchRecipient(r, { company: e.target.value.trim() })} />
                        </td>
                        <td>
                          <input aria-label="Custom line" className="cell" placeholder="Optional" value={r.custom_line} disabled={!editable}
                            onChange={(e) => editLocal(r, { custom_line: e.target.value })} onBlur={(e) => patchRecipient(r, { custom_line: e.target.value })} />
                        </td>
                        <td title={r.error ?? problems[0] ?? ""}>
                          {skipped ? <PersonPill look="skipped" />
                            : look === "draft" || (look === "paused" && r.status === "pending") ? <PersonPill look={problems.length ? "check" : "ready"} />
                            : <PersonPill look={personLook(r)} />}
                        </td>
                        <td className="keep">
                          {editable && (
                            <div className="acts flex justify-end gap-1.5">
                              {r.status === "error" && <button type="button" className="btn-mini" onClick={() => patchRecipient(r, { status: "pending", error: null })}>Retry</button>}
                              <button type="button" className="btn-mini" onClick={() => patchRecipient(r, { status: skipped ? "pending" : "skipped" })}>{skipped ? "Unskip" : "Skip"}</button>
                              <button type="button" className="btn-mini" onClick={() => removeRecipient(r)}>Remove</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hidden.length > 0 && (
                <button type="button" onClick={() => setExpanded(!expanded)} className="mono w-full border-t border-[#222] px-4 py-3.5 text-left text-[13px] text-dim hover:text-ink">
                  {expanded ? "Show fewer" : `+ ${hidden.length} more${hiddenIssues ? `, ${hiddenIssues} need a look` : ", all ready"}`}
                </button>
              )}
            </div>
          )}
        </Card>

        {/* STEP 2: Email */}
        <Card>
          <StepHeader n={2} title="Email" sub="Write it once. Placeholders fill in per person." />
          <label className="flex flex-col gap-2">
            <span className="text-[15px] text-muted">Subject</span>
            <input className="inp" value={campaign.subject} disabled={locked} placeholder="Summer internship at {{Company}}"
              onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })} onBlur={(e) => saveCampaign({ subject: e.target.value })} />
          </label>
          <TemplateEditor
            value={campaign.body}
            disabled={locked}
            onChange={(body) => setCampaign({ ...campaign, body })}
            onCommit={(body) => saveCampaign({ body })}
          />
          {brackets.length > 0 && (
            <div className="-mt-2 flex items-center gap-2 text-sm text-coral-ink">
              <Alert />
              <span><span className="mono">{brackets.join(", ")}</span> {brackets.length > 1 ? "are" : "is"} still in brackets. Fill {brackets.length > 1 ? "these" : "this"} in before scheduling.</span>
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-end gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[15px] text-muted">Sender name</span>
              <input className="inp" value={campaign.sender_name} disabled={locked}
                onChange={(e) => setCampaign({ ...campaign, sender_name: e.target.value })} onBlur={(e) => saveCampaign({ sender_name: e.target.value })} />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] text-muted">Attachment</span>
              {campaign.attachment_name ? (
                <div className="flex h-12 items-center gap-2.5 rounded-xl border border-dashed border-[#3a3a3a] pl-3.5 pr-2">
                  <span className="text-mint"><Clip size={18} /></span>
                  <span className="flex-1 truncate text-[15px]">{campaign.attachment_name} <span className="mono text-[13px] text-dim">{fmtBytes(campaign.attachment_size)}</span></span>
                  {!locked && <button type="button" aria-label="Remove attachment" onClick={removeAttachment} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-ink"><X size={14} /></button>}
                </div>
              ) : (
                <label className={`flex h-12 items-center gap-2.5 rounded-xl border border-dashed border-[#3a3a3a] px-3.5 text-[15px] text-muted ${locked ? "opacity-50" : "cursor-pointer hover:border-mint hover:text-ink"}`}>
                  <Clip size={18} />{busy === "upload" ? "Uploading..." : "Attach resume"}
                  <input type="file" accept=".pdf,.doc,.docx" className="sr-only" disabled={locked || busy === "upload"}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                </label>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span id="gapl" className="text-[15px] text-muted">Minutes between emails</span>
              <div role="group" aria-labelledby="gapl" className="flex items-center gap-2">
                <button type="button" className="btn-round" aria-label="Fewer minutes" disabled={locked || campaign.gap_minutes <= 1}
                  onClick={() => saveCampaign({ gap_minutes: Math.max(1, campaign.gap_minutes - 1) })}><Minus size={14} /></button>
                <span className="mono min-w-14 text-center text-[22px]">{campaign.gap_minutes}</span>
                <button type="button" className="btn-round" aria-label="More minutes" disabled={locked || campaign.gap_minutes >= 60}
                  onClick={() => saveCampaign({ gap_minutes: Math.min(60, campaign.gap_minutes + 1) })}><Plus size={14} /></button>
              </div>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-[15px]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#b9f2a1]" checked={campaign.track_opens} disabled={locked}
              onChange={(e) => saveCampaign({ track_opens: e.target.checked })} />
            <span>Track opens <span className="text-muted">with an invisible image. Opens are approximate: Apple Mail fakes them, and some inboxes block images.</span></span>
          </label>
        </Card>

        {/* STEP 3: Preview */}
        <Card>
          <StepHeader n={3} title="Preview" sub="Exactly what each person gets."
            right={previewList.length > 1 ? (
              <div className="flex items-center gap-2">
                <button type="button" className="btn-round" aria-label="Previous person" onClick={() => setPreviewIdx(pIdx - 1)}><ChevL /></button>
                <select className="sel max-w-[220px]" aria-label="Preview for" value={pIdx} onChange={(e) => setPreviewIdx(Number(e.target.value))}>
                  {previewList.map((r, i) => <option key={r.id} value={i}>{`${r.first_name} ${r.last_name}`.trim() || r.email}</option>)}
                </select>
                <button type="button" className="btn-round" aria-label="Next person" onClick={() => setPreviewIdx(pIdx + 1)}><ChevR /></button>
              </div>
            ) : undefined}
          />
          {current ? (
            <div className="flex flex-wrap items-start gap-5">
              <EmailPreview contact={toContact(current)} subject={campaign.subject} body={campaign.body} attachmentName={campaign.attachment_name} />
              <aside aria-label="Checks" className="flex flex-[1_1_240px] flex-col gap-3">
                <span className="label">Checks for {current.first_name || "this person"}</span>
                {currentProblems.length === 0 ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-mint/30 bg-mint/10 px-4 py-3.5 text-[15px] text-mint"><Check size={18} />Looks good</div>
                ) : currentProblems.map((p) => (
                  <div key={p} className="flex gap-2.5 rounded-xl border border-coral/30 bg-coral/8 px-4 py-3.5 text-[15px] leading-[1.45] text-coral-ink">
                    <span aria-hidden className="font-bold">!</span><span>{p}</span>
                  </div>
                ))}
              </aside>
            </div>
          ) : <p className="m-0 text-[15px] text-muted">Add contacts to see a preview.</p>}
        </Card>

        {/* STEP 4: Schedule */}
        <Card>
          <StepHeader n={4} title="Schedule" sub="Pick a start. Stagger paces the rest." />
          {locked || (look === "done" && toSend.length === 0) ? (
            <div className="flex flex-wrap items-center gap-6">
              <Ring value={sentCount} total={active.length} size={88} done={look === "done"} />
              <div className="flex flex-[1_1_260px] flex-col gap-1.5">
                <div className="self-start"><CampaignPill look={look} /></div>
                <span className="text-xl">
                  {look === "done" ? "Everything went out." : (() => { const n = nextSendAt(recipients); return n ? `${look === "scheduled" ? "First" : "Next"} email ${fmtWhen(n)}` : "Wrapping up"; })()}
                </span>
                <span className="text-[15px] text-muted">{look === "done" ? "Replies show up in the tracker." : "Keeps sending with this tab closed."}</span>
              </div>
              {locked && <button type="button" className="btn-secondary" disabled={busy !== null} onClick={cancel}>Cancel remaining</button>}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-[15px] text-muted">Date</span>
                  <input type="date" className="inp" value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[15px] text-muted">Time</span>
                  <input type="time" className="inp" value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} />
                </label>
              </div>
              <div className="brk flex flex-col gap-2 px-[22px] py-5">
                <span className="label">Summary</span>
                <span className="text-xl leading-[1.45]">
                  {Number.isNaN(start.getTime()) ? "Pick a date and time." : toSend.length
                    ? `${toSend.length} email${toSend.length > 1 ? "s" : ""}, first at ${fmtWhen(start)}${toSend.length > 1 ? `, last around ${fmtWhen(last)}, one every ~${campaign.gap_minutes} min` : ""}.`
                    : "No one to send to yet."}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {blocked && <span className="mr-auto text-sm text-coral-ink">To schedule: {blockers.join(" and ")}.</span>}
                <button type="button" className="btn-secondary" disabled={busy !== null || !current} onClick={sendTest}>{busy === "test" ? "Sending..." : "Send test to me"}</button>
                <button type="button" className="btn-primary" disabled={blocked || busy !== null || Number.isNaN(start.getTime())} onClick={() => setConfirming(true)}>
                  {busy === "schedule" ? "Scheduling..." : `Schedule ${toSend.length} email${toSend.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          )}
        </Card>
      </main>

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cft" onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[420px] flex-col gap-5 rounded-2xl border border-[#2e2e2e] bg-card p-7" style={{ animation: "pop .18s ease-out" }}>
            <Posty mood="stand" width={56} ink="#161616" />
            <h3 id="cft" className="m-0 text-[22px] font-medium leading-[1.35]">Send {toSend.length} email{toSend.length === 1 ? "" : "s"} starting {fmtWhen(start)}?</h3>
            <p className="m-0 text-[15px] leading-normal text-muted">One every {campaign.gap_minutes} min from your Gmail. You can cancel the rest any time.</p>
            <div className="flex justify-end gap-2.5">
              <button type="button" className="btn-secondary !h-[46px]" onClick={() => setConfirming(false)}>Not yet</button>
              <button type="button" className="btn-primary !h-[46px]" autoFocus onClick={schedule}>Schedule</button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}

function TableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading contacts" className="overflow-hidden rounded-[14px] border border-[#222]">
      <div className="grid grid-cols-[2fr_2fr_1.2fr_1fr] gap-4 px-4 py-3.5"><span className="sk h-2.5 w-1/2" /><span className="sk h-2.5 w-2/5" /><span className="sk h-2.5 w-3/5" /><span className="sk h-2.5 w-1/2" /></div>
      {[70, 55, 65].map((w) => (
        <div key={w} className="grid grid-cols-[2fr_2fr_1.2fr_1fr] gap-4 border-t border-[#222] p-4">
          <span className="sk h-3.5" style={{ width: `${w}%` }} /><span className="sk h-3.5 w-4/5" /><span className="sk h-3.5 w-3/5" /><span className="sk h-[22px] w-[70%] rounded-full" />
        </div>
      ))}
    </div>
  );
}
