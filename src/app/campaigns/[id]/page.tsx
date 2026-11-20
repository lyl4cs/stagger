"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { SignInButton } from "@/components/SignInButton";
import { parseContacts } from "@/lib/parse";
import { render, templateProblems, PLACEHOLDERS } from "@/lib/template";
import { fromContact, toContact, type Campaign, type Recipient } from "@/lib/types";

const UNSENT = ["pending", "queued", "error"] as const;

function tomorrowAt10(): string {
  const d = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

const fmt = (iso: string | Date | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = useMemo(() => supabaseBrowser(), []);

  const [user, setUser] = useState<User | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [paste, setPaste] = useState("");
  const [previewId, setPreviewId] = useState<string>("");
  const [startAt, setStartAt] = useState(tomorrowAt10());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string; list?: string[] } | null>(null);

  const loadRecipients = useCallback(async () => {
    const { data } = await sb.from("recipients").select("*").eq("campaign_id", id).order("position");
    setRecipients((data ?? []) as Recipient[]);
  }, [sb, id]);

  const loadCampaign = useCallback(async () => {
    const { data } = await sb.from("campaigns").select("*").eq("id", id).single();
    if (data) setCampaign(data as Campaign);
  }, [sb, id]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/");
      setUser(user);
      await Promise.all([loadCampaign(), loadRecipients()]);
    })();
  }, [sb, router, loadCampaign, loadRecipients]);

  // While a run is going, refresh every 15s so statuses update live.
  useEffect(() => {
    if (campaign?.status !== "scheduled") return;
    const t = setInterval(() => { loadCampaign(); loadRecipients(); }, 15_000);
    return () => clearInterval(t);
  }, [campaign?.status, loadCampaign, loadRecipients]);

  const locked = campaign?.status === "scheduled";
  const active = recipients.filter((r) => (UNSENT as readonly string[]).includes(r.status));
  const toSend = recipients.filter((r) => r.status === "pending" || r.status === "queued");
  const problems = campaign ? templateProblems(campaign.subject, campaign.body, toSend.map(toContact)) : [];
  const preview = recipients.find((r) => r.id === previewId) ?? active[0] ?? recipients[0];

  async function saveCampaign(patch: Partial<Campaign>) {
    if (!campaign) return;
    setCampaign({ ...campaign, ...patch });
    const { error } = await sb.from("campaigns").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setNotice({ kind: "error", text: error.message });
  }

  async function addContacts() {
    const parsed = parseContacts(paste);
    if (!parsed.length) return setNotice({ kind: "error", text: "No email addresses found in that paste." });
    const start = recipients.length;
    const rows = parsed.map((c, i) => ({ ...fromContact(c), campaign_id: id, position: start + i }));
    const { data, error } = await sb.from("recipients")
      .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true }).select("id");
    if (error) return setNotice({ kind: "error", text: error.message });
    setPaste("");
    setNotice({ kind: "ok", text: `Added ${data?.length ?? 0} contacts (${parsed.length - (data?.length ?? 0)} already on the list). Check names before sending.` });
    loadRecipients();
  }

  async function updateRecipient(r: Recipient, patch: Partial<Recipient>) {
    setRecipients((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    await sb.from("recipients").update(patch).eq("id", r.id);
  }

  async function removeRecipient(r: Recipient) {
    setRecipients((list) => list.filter((x) => x.id !== r.id));
    await sb.from("recipients").delete().eq("id", r.id);
  }

  async function uploadAttachment(file: File) {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) return setNotice({ kind: "error", text: "Keep attachments under 10 MB." });
    setBusy("upload");
    const path = `${user.id}/${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await sb.storage.from("attachments").upload(path, file, { contentType: file.type });
    setBusy(null);
    if (error) return setNotice({ kind: "error", text: error.message });
    if (campaign?.attachment_path) await sb.storage.from("attachments").remove([campaign.attachment_path]);
    saveCampaign({ attachment_path: path, attachment_name: file.name });
  }

  async function removeAttachment() {
    if (campaign?.attachment_path) await sb.storage.from("attachments").remove([campaign.attachment_path]);
    saveCampaign({ attachment_path: null, attachment_name: null });
  }

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setNotice(null);
    const res = await fetch(`/api/campaigns/${id}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setNotice({ kind: "error", text: json.error ?? "Something went wrong", list: json.problems });
    return res.ok ? json : null;
  }

  async function sendTest() {
    const r = await post("test", { recipientId: preview?.id }, "test");
    if (r) setNotice({ kind: "ok", text: `Test sent to ${r.sentTo}, built from ${r.builtFrom}'s row. Check your inbox.` });
  }

  async function schedule() {
    const start = new Date(startAt);
    const last = new Date(start.getTime() + Math.max(toSend.length - 1, 0) * (campaign?.gap_minutes ?? 3) * 60_000);
    if (!confirm(`Send ${toSend.length} emails, first at ${fmt(start)}, last around ${fmt(last)}?`)) return;
    const r = await post("schedule", { startAt: start.toISOString() }, "schedule");
    if (r) {
      setNotice({ kind: "ok", text: `Scheduled ${r.scheduled} emails. First at ${fmt(r.firstAt)}. You can close this tab.` });
      loadCampaign(); loadRecipients();
    }
  }

  async function cancel() {
    if (!confirm("Stop sending? Emails already sent stay sent.")) return;
    const r = await post("cancel", {}, "cancel");
    if (r) { setNotice({ kind: "ok", text: `Cancelled ${r.cancelled} queued emails.` }); loadCampaign(); loadRecipients(); }
  }

  if (!campaign) return (<><Header email={user?.email} /><p className="p-10 text-neutral-500">Loading...</p></>);

  const sentCount = recipients.filter((r) => r.status === "sent").length;

  return (
    <>
      <Header email={user?.email} />
      <main className="mx-auto w-full max-w-5xl space-y-10 px-6 py-10">
        <div className="flex items-center gap-3">
          <input
            className="input flex-1 text-2xl font-semibold"
            value={campaign.name}
            disabled={locked}
            onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
            onBlur={(e) => saveCampaign({ name: e.target.value })}
          />
          <StatusBadge status={campaign.status} />
        </div>

        {campaign.status === "needs_reauth" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="mb-3">Paused: Google stopped letting the app send as you (sign-ins expire after 7 days while the app is unverified). Sign in again, then hit Schedule to send the rest.</p>
            <SignInButton label="Sign in again" />
          </div>
        )}

        {notice && (
          <div className={`rounded-lg p-4 text-sm ${notice.kind === "ok" ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
            {notice.text}
            {notice.list && <ul className="mt-2 list-disc pl-5">{notice.list.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}

        {/* 1. Contacts */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Contacts <span className="text-neutral-400">({recipients.length})</span></h2>
          {!locked && (
            <div className="space-y-2">
              <textarea
                className="input h-32 font-mono text-xs"
                placeholder="Paste a raw export (Apollo etc.) or a CSV with an Email column"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button className="btn" onClick={addContacts} disabled={!paste.trim()}>Add contacts</button>
            </div>
          )}
          {recipients.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Custom line</th><th className="px-3 py-2">Status</th><th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {recipients.map((r) => (
                    <tr key={r.id} className={r.status === "skipped" ? "opacity-50" : ""}>
                      <td className="px-3 py-2">
                        <input className="input-cell w-20" value={r.first_name} disabled={locked}
                          onChange={(e) => setRecipients((l) => l.map((x) => x.id === r.id ? { ...x, first_name: e.target.value } : x))}
                          onBlur={(e) => updateRecipient(r, { first_name: e.target.value })} />
                        <span className="text-neutral-500"> {r.last_name}</span>
                        {r.title && <div className="text-xs text-neutral-400">{r.title}</div>}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{r.email}</td>
                      <td className="px-3 py-2">
                        <input className="input-cell w-28" value={r.company} disabled={locked}
                          onChange={(e) => setRecipients((l) => l.map((x) => x.id === r.id ? { ...x, company: e.target.value } : x))}
                          onBlur={(e) => updateRecipient(r, { company: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input-cell w-full min-w-48" value={r.custom_line} placeholder="optional" disabled={locked}
                          onChange={(e) => setRecipients((l) => l.map((x) => x.id === r.id ? { ...x, custom_line: e.target.value } : x))}
                          onBlur={(e) => updateRecipient(r, { custom_line: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span title={r.error ?? ""}>{r.status}{r.status === "queued" && r.send_at ? ` ${fmt(r.send_at)}` : ""}{r.status === "sent" && r.sent_at ? ` ${fmt(r.sent_at)}` : ""}</span>
                        {r.status === "error" && <div className="text-red-600">{r.error}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        {!locked && r.status !== "sent" && (
                          <>
                            <button className="underline" onClick={() => updateRecipient(r, { status: r.status === "skipped" ? "pending" : "skipped" })}>
                              {r.status === "skipped" ? "Include" : "Skip"}
                            </button>
                            {r.status === "error" && <button className="ml-2 underline" onClick={() => updateRecipient(r, { status: "pending", error: null })}>Retry</button>}
                            <button className="ml-2 text-red-600 underline" onClick={() => removeRecipient(r)}>Remove</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 2. Template */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. Email</h2>
          <p className="text-sm text-neutral-500">
            Placeholders: {Object.keys(PLACEHOLDERS).map((k) => <code key={k} className="mr-2">{`{{${k}}}`}</code>)}
            <br />An empty CustomLine disappears cleanly. Anything left in [SQUARE BRACKETS] blocks scheduling.
          </p>
          <label className="block text-sm font-medium">Subject
            <input className="input mt-1" value={campaign.subject} disabled={locked}
              onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
              onBlur={(e) => saveCampaign({ subject: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">Body
            <textarea className="input mt-1 h-72" value={campaign.body} disabled={locked}
              onChange={(e) => setCampaign({ ...campaign, body: e.target.value })}
              onBlur={(e) => saveCampaign({ body: e.target.value })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">Sender name
              <input className="input mt-1" value={campaign.sender_name} disabled={locked}
                onChange={(e) => setCampaign({ ...campaign, sender_name: e.target.value })}
                onBlur={(e) => saveCampaign({ sender_name: e.target.value })} />
            </label>
            <label className="block text-sm font-medium">Minutes between emails
              <input type="number" min={1} max={120} className="input mt-1" value={campaign.gap_minutes} disabled={locked}
                onChange={(e) => setCampaign({ ...campaign, gap_minutes: Number(e.target.value) })}
                onBlur={(e) => saveCampaign({ gap_minutes: Math.min(120, Math.max(1, Number(e.target.value) || 3)) })} />
            </label>
            <div className="text-sm font-medium">Attachment
              <div className="mt-1 text-sm font-normal">
                {campaign.attachment_name ? (
                  <span>{campaign.attachment_name} {!locked && <button className="ml-2 text-red-600 underline" onClick={removeAttachment}>Remove</button>}</span>
                ) : (
                  <input type="file" accept=".pdf,.doc,.docx" disabled={locked || busy === "upload"}
                    onChange={(e) => e.target.files?.[0] && uploadAttachment(e.target.files[0])} />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Preview */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. Preview</h2>
          {preview ? (
            <>
              <select className="input w-auto" value={preview.id} onChange={(e) => setPreviewId(e.target.value)}>
                {recipients.map((r) => <option key={r.id} value={r.id}>{r.first_name} {r.last_name} ({r.email})</option>)}
              </select>
              <div className="rounded-lg border border-neutral-200 p-4 text-sm">
                <p><span className="text-neutral-500">To:</span> {preview.email}</p>
                <p><span className="text-neutral-500">Subject:</span> {render(campaign.subject, toContact(preview))}</p>
                {campaign.attachment_name && <p><span className="text-neutral-500">Attachment:</span> {campaign.attachment_name}</p>}
                <hr className="my-3 border-neutral-200" />
                <pre className="whitespace-pre-wrap font-sans">{render(campaign.body, toContact(preview))}</pre>
              </div>
            </>
          ) : <p className="text-sm text-neutral-500">Add contacts to see a preview.</p>}
          {problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
        </section>

        {/* 4. Send */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Send</h2>
          {locked ? (
            <div className="space-y-3 text-sm">
              <p>Sending: {sentCount} of {sentCount + toSend.length} done. Started {fmt(campaign.start_at)}. This keeps running with the tab closed.</p>
              <button className="btn" onClick={cancel} disabled={busy !== null}>Cancel remaining</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <button className="btn" onClick={sendTest} disabled={busy !== null || !preview}>
                {busy === "test" ? "Sending..." : "Send test to me"}
              </button>
              <label className="text-sm font-medium">Start at
                <input type="datetime-local" className="input mt-1" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </label>
              <button className="btn-primary" onClick={schedule} disabled={busy !== null || problems.length > 0 || toSend.length === 0}>
                {busy === "schedule" ? "Scheduling..." : `Schedule ${toSend.length} emails`}
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
