"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Posty } from "./Posty";
import { Check, Clock, Pause, X, Alert } from "./icons";
import { signOut } from "@/lib/auth-client";
import type { CampaignLook, PersonLook } from "@/lib/view";

/* ---------- Header ---------- */

export function Header({ email }: { email?: string }) {
  return (
    <header className="border-b border-[#1f1f1f]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-[18px] sm:px-10">
        <Link href="/campaigns" className="flex items-center gap-3 no-underline">
          <Posty width={36} />
          <span className="text-xl font-semibold tracking-[-0.01em]">Outreach</span>
        </Link>
        {email && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-full border border-line py-2 pl-2.5 pr-3.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-mint" />
              <span className="mono text-[13px]">{email}</span>
            </div>
            <button onClick={signOut} className="text-sm text-dim hover:text-ink">Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}

export function BackLink({ href, label = "Campaigns" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 self-start text-[15px] text-muted no-underline hover:text-ink">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4 3 8l4 4" /></svg>
      {label}
    </Link>
  );
}

/* ---------- Pills ---------- */

const pillBase = "inline-flex items-center gap-[7px] whitespace-nowrap rounded-full font-medium";

export function CampaignPill({ look, large }: { look: CampaignLook; large?: boolean }) {
  const size = large ? "h-[30px] px-3 text-sm" : "h-7 px-[11px] text-[13px]";
  switch (look) {
    case "draft":
      return <span className={`${pillBase} ${size} border border-[#333] text-muted`}><span className="h-[7px] w-[7px] rounded-full border-[1.5px] border-muted" />Draft</span>;
    case "scheduled":
      return <span className={`${pillBase} ${size} border border-[#4a4a4a] text-ink`}><Clock size={13} />Scheduled</span>;
    case "sending":
      return <span className={`${pillBase} ${size} border border-mint/30 bg-mint/12 text-mint`}><span className="anim-pulse h-[7px] w-[7px] rounded-full bg-mint" />Sending</span>;
    case "done":
      return <span className={`${pillBase} ${size} bg-ink font-semibold text-bg`}><Check size={13} />Done</span>;
    case "paused":
      return <span className={`${pillBase} ${size} border border-dashed border-[#8a4a40] text-coral-ink`}><Pause size={12} />Paused</span>;
  }
}

const personStyles: Record<PersonLook | "ready" | "check", { cls: string; label: string }> = {
  waiting: { cls: "border border-dashed border-[#3a3a3a] text-muted", label: "Waiting" },
  sending: { cls: "border border-mint/30 bg-mint/12 text-mint", label: "Sending" },
  sent: { cls: "border border-[#333] text-[#d6d6d6]", label: "Sent" },
  opened: { cls: "border border-[#4a4a4a] bg-[#1f1f1f] text-ink", label: "Opened" },
  replied: { cls: "bg-mint text-bg", label: "Replied" },
  error: { cls: "border border-coral/40 bg-coral/12 text-coral-ink", label: "Error" },
  skipped: { cls: "border border-dashed border-[#333] text-dim line-through", label: "Skipped" },
  ready: { cls: "border border-[#333] text-[#d6d6d6]", label: "Ready" },
  check: { cls: "border border-coral/35 bg-coral/10 text-coral-ink", label: "Check" },
};

export function PersonPill({ look }: { look: keyof typeof personStyles }) {
  const s = personStyles[look];
  return (
    <span className={`inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium ${s.cls}`}>
      {look === "sending" && <span className="anim-pulse h-1.5 w-1.5 rounded-full bg-mint" />}
      {look === "ready" && <Check size={12} />}
      {look === "check" && <span aria-hidden className="font-bold">!</span>}
      {s.label}
    </span>
  );
}

export const dotStyle: Record<PersonLook, string> = {
  replied: "bg-mint",
  opened: "bg-ink",
  sent: "bg-[#8a8a8a]",
  sending: "bg-mint anim-ring",
  waiting: "border-[1.5px] border-[#5c5c5c]",
  error: "bg-coral",
  skipped: "border-[1.5px] border-dashed border-[#4a4a4a]",
};

/* ---------- Progress ---------- */

export function ProgressBar({ value, total, look }: { value: number; total: number; look: CampaignLook }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const color = look === "done" ? "bg-ink" : look === "paused" ? "bg-[#6b6b6b]" : "bg-mint";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, total, size = 128, done }: { value: number; total: number; size?: number; done?: boolean }) {
  const r = 54, c = 2 * Math.PI * r;
  const frac = total ? value / total : 0;
  if (done) {
    return (
      <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label={`${value} of ${total} sent`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="#262626" strokeWidth="10" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="#F2F2F0" strokeWidth="10" />
        <path d="m44 66 13 13 27-29" fill="none" stroke="#F2F2F0" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label={`${value} of ${total} sent`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#222" strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke="#B9F2A1" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${Math.max(frac * c, value ? 0 : 4)} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="66" textAnchor="middle" fill="#F2F2F0" fontFamily="var(--font-geist-sans)" fontSize="30" fontWeight="500">{value}</text>
      <text x="64" y="88" textAnchor="middle" fill="#808080" fontFamily="var(--font-geist-mono)" fontSize="12">OF {total}</text>
    </svg>
  );
}

/* ---------- Counter tile ---------- */

export function CounterTile({ index, label, value, accent, muted }: { index: number; label: string; value: number; accent?: boolean; muted?: boolean }) {
  // Show a "+1" that floats up whenever the number goes up while you're watching.
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (value > prev.current) setBump(value - prev.current);
    prev.current = value;
    if (value) { const t = setTimeout(() => setBump(0), 2400); return () => clearTimeout(t); }
  }, [value]);
  return (
    <div className="brk flex min-h-[150px] flex-col gap-[18px] px-6 pb-[26px] pt-[22px]">
      <span className="label">{String(index).padStart(2, "0")}&nbsp;&nbsp;{label}</span>
      <div className="flex items-start gap-2.5">
        <span className={`text-[64px] font-medium leading-none tracking-[-0.04em] tabular-nums ${muted ? "text-dim" : accent ? "text-mint" : ""}`}>{value}</span>
        {bump > 0 && (
          <span key={value} className="mono mt-1.5 rounded-full bg-mint/14 px-2 py-[3px] text-[13px] text-mint" style={{ animation: "tick 2.4s ease-in-out forwards" }}>+{bump}</span>
        )}
      </div>
    </div>
  );
}

/* ---------- Toast + banners ---------- */

export type ToastMsg = { kind: "ok" | "error"; text: string; detail?: string } | null;

export function Toast({ msg, onClose }: { msg: ToastMsg; onClose: () => void }) {
  useEffect(() => {
    if (!msg || msg.kind === "error") return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [msg, onClose]);
  if (!msg) return null;
  const ok = msg.kind === "ok";
  return (
    <div role={ok ? "status" : "alert"}
      className={`fixed bottom-8 left-1/2 z-30 flex max-w-[92vw] items-center gap-3 rounded-[14px] py-3.5 pl-[18px] text-[15px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${ok ? "bg-ink pr-[18px] font-medium text-bg" : "border border-coral/40 bg-[#2a1714] pr-2.5 text-[#ffd2ca]"}`}
      style={{ animation: "toastin .2s ease-out", transform: "translateX(-50%)" }}>
      {ok ? <Check size={18} /> : <span className="text-coral"><Alert size={18} /></span>}
      <span>{msg.text}{msg.detail && <> <span className="mono text-[13px]">{msg.detail}</span></>}</span>
      {!ok && <button aria-label="Dismiss" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-coral-ink"><X size={14} /></button>}
    </div>
  );
}

export function OkBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-mint/22 bg-mint/8 px-4 py-3.5 text-[15px]">
      <span className="text-mint"><Check size={18} /></span><span>{children}</span>
    </div>
  );
}

export function PausedBanner({ waiting, onSignIn }: { waiting: number; onSignIn: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 rounded-[14px] border border-dashed border-coral/50 bg-coral/8 px-5 py-[18px]">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-coral/14 text-coral-ink"><Pause size={16} /></span>
      <div className="flex flex-[1_1_320px] flex-col gap-1">
        <span className="text-[17px] font-medium">Google sign-in expired.</span>
        <span className="text-[15px] text-[#d6c2be]">Sign in again, then hit Schedule to send the rest. {waiting} still waiting.</span>
      </div>
      <button onClick={onSignIn} className="btn-primary !h-[46px] !px-5 !text-base">Sign in again</button>
    </div>
  );
}

export function StepHeader({ n, title, sub, right }: { n: number; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="brk mono inline-flex h-11 w-11 items-center justify-center text-[15px]" style={{ ["--s" as string]: "10px" }}>{String(n).padStart(2, "0")}</span>
      <div className="flex flex-[1_1_200px] flex-col gap-1">
        <h2 className="m-0 text-2xl font-medium tracking-[-0.01em]">{title}</h2>
        <span className="text-[15px] text-muted">{sub}</span>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-8 ${className}`}>{children}</section>;
}
