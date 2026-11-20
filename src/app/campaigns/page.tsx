"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import type { Campaign, RecipientStatus } from "@/lib/types";

type Row = Campaign & { recipients: { status: RecipientStatus }[] };

export default function CampaignsPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const [email, setEmail] = useState<string>();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/");
      setEmail(user.email);
      const { data } = await sb.from("campaigns").select("*, recipients(status)").order("created_at", { ascending: false });
      setRows((data ?? []) as Row[]);
    })();
  }, [sb, router]);

  async function create() {
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from("campaigns")
      .insert({ sender_name: user?.user_metadata?.full_name ?? "" }).select("id").single();
    if (error) return alert(error.message);
    router.push(`/campaigns/${data.id}`);
  }

  return (
    <>
      <Header email={email} />
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <button onClick={create} className="btn-primary">New campaign</button>
        </div>
        {rows === null ? <p className="text-neutral-500">Loading...</p> : rows.length === 0 ? (
          <p className="text-neutral-500">No campaigns yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {rows.map((c) => {
              const sent = c.recipients.filter((r) => r.status === "sent").length;
              return (
                <li key={c.id}>
                  <Link href={`/campaigns/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-sm text-neutral-500">
                      {sent}/{c.recipients.length} sent <StatusBadge status={c.status} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
