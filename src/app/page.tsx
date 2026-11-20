"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Posty } from "@/components/Posty";
import { Lock } from "@/components/icons";
import { signInWithGoogle } from "@/lib/auth-client";
import { supabaseBrowser } from "@/lib/supabase/client";

function SignIn() {
  const router = useRouter();
  const error = useSearchParams().get("error");

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => { if (data.user) router.replace("/campaigns"); });
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <svg viewBox="0 0 900 900" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2">
        <circle cx="450" cy="450" r="330" fill="none" stroke="#1E1E1E" />
        <circle cx="450" cy="450" r="410" fill="none" stroke="#181818" strokeDasharray="2 6" />
        <path d="M450 80v40M450 780v40M80 450h40M780 450h40" stroke="#2A2A2A" />
        <g fill="#4A4A4A" fontFamily="var(--font-geist-mono)" fontSize="12">
          <text x="458" y="76">270°</text><text x="458" y="836">90°</text><text x="40" y="444">180°</text><text x="826" y="444">0°</text><text x="700" y="210">r 330</text>
        </g>
      </svg>

      <div className="relative flex w-full max-w-[440px] flex-col items-center gap-7 rounded-2xl border border-line bg-surface px-10 pb-9 pt-12 text-center">
        <div style={{ animation: "float 3.2s ease-in-out infinite" }}>
          <Posty mood="sending" width={92} ink="#141414" />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="m-0 text-[40px] font-semibold tracking-[-0.03em]">Outreach</h1>
          <p className="m-0 text-lg leading-[1.45] text-muted">One email, personalized for everyone, sent from your Gmail.</p>
        </div>
        <button onClick={signInWithGoogle} className="btn-primary !h-14 w-full">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Sign in with Google
        </button>
        {error && <p className="m-0 text-sm text-coral-ink">Sign-in didn&apos;t finish. Try again.</p>}
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <Lock size={16} />
          <span>Sends as you and spots replies. Never reads what anyone wrote.</span>
        </div>
        <span className="mono text-xs tracking-[0.04em] text-dim">[ v0.2 &nbsp;/&nbsp; FOR PERSONAL SENDING ]</span>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
