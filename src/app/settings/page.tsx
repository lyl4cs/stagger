"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth-client";
import { Header, BackLink, Card, ConfirmDialog, Toast, type ToastMsg } from "@/components/ui";

type Settings = { email: string; connected: boolean; replyTracking: boolean };

export default function SettingsPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMsg>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/");
      const res = await fetch("/api/settings");
      if (!res.ok) return setToast({ kind: "error", text: "Couldn't load settings." });
      const json: Settings = await res.json();
      setS(json);
      // Back from Google: confirm what actually got granted, then clean the URL.
      if (new URLSearchParams(window.location.search).get("from") === "google") {
        setToast({ kind: "ok", text: json.replyTracking ? "Reply tracking is on." : "Reply tracking is off. Stagger can only send." });
        router.replace("/settings");
      }
    })();
  }, [sb, router]);

  function turnOn() {
    // Full page load on purpose: this route redirects to Google.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/api/auth/google/start?tracking=1&next=/settings";
  }

  async function turnOff() {
    setBusy(true);
    const res = await fetch("/api/settings/reply-tracking", { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setConfirmOff(false); return setToast({ kind: "error", text: json.error ?? "Couldn't turn it off." }); }
    window.location.href = json.next;
  }

  return (
    <>
      <Header email={s?.email} />
      <main className="mx-auto flex w-full max-w-[820px] flex-col gap-9 px-6 pb-24 pt-10 sm:px-10">
        <BackLink href="/campaigns" />
        <h1 className="m-0 text-[40px] font-medium tracking-[-0.025em]">Settings</h1>

        <Card>
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-1.5">
              <span className="label">Gmail</span>
              {!s ? <span className="sk h-5 w-56" /> : s.connected
                ? <span className="text-xl">Connected as <span className="mono text-[17px]">{s.email}</span></span>
                : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span className="text-xl text-coral-ink">Not connected. Campaigns can&apos;t send.</span>
                    <button type="button" className="btn-primary" onClick={() => signInWithGoogle({ forceConsent: true })}>Connect Gmail</button>
                  </div>
                )}
            </div>

            <Row title="Send email" status={<span className="text-sm text-dim">Required</span>}>
              Sends your campaigns from your Gmail. On its own this permission can&apos;t read anything in your inbox.
            </Row>

            <Row title="Reply tracking" status={s?.connected ? (
              <button type="button" role="switch" aria-checked={s.replyTracking} aria-label="Reply tracking" disabled={busy}
                className={`switch ${s.replyTracking ? "on" : ""}`} onClick={() => (s.replyTracking ? setConfirmOff(true) : turnOn())}>
                <span />
              </button>
            ) : null}>
              {s?.replyTracking
                ? "On. Spots replies and bounces in the tracker. Google's permission covers message headers (sender, subject, date) for your inbox; Stagger only checks the threads it started and never sees message text."
                : "Off. Stagger can't see your inbox, so the tracker can't show replies or bounces. Turning it on asks Google for read access to message headers, never message text."}
            </Row>

            <p className="m-0 border-t border-[#222] pt-5 text-sm leading-normal text-muted">
              You can remove all of Stagger&apos;s access at any time from{" "}
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer" className="text-ink underline">your Google account</a>.
              Scheduled campaigns pause until you sign in again.
            </p>
          </div>
        </Card>
      </main>

      {confirmOff && (
        <ConfirmDialog
          title="Turn off reply tracking?"
          confirmLabel={busy ? "Turning off..." : "Turn off"} cancelLabel="Keep it on" busy={busy}
          onConfirm={turnOff} onClose={() => !busy && setConfirmOff(false)}
        >
          Stagger will remove its access at Google, then you&apos;ll approve sending once more so your campaigns keep going. Replies to emails you&apos;ve already sent won&apos;t be tracked.
        </ConfirmDialog>
      )}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}

function Row({ title, status, children }: { title: string; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-[17px] font-medium">{title}</span>
        <span className="text-[15px] leading-normal text-muted">{children}</span>
      </div>
      <div className="flex-none pt-0.5">{status}</div>
    </div>
  );
}
