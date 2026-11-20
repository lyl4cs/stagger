"use client";
import Link from "next/link";
import { signOut } from "@/lib/auth-client";

export function Header({ email }: { email?: string }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
      <Link href="/campaigns" className="font-semibold">Outreach</Link>
      {email && (
        <div className="flex items-center gap-4 text-sm text-neutral-500">
          <span>{email}</span>
          <button onClick={signOut} className="underline">Sign out</button>
        </div>
      )}
    </header>
  );
}
