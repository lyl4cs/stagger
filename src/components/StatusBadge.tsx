export function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", done: "Done", needs_reauth: "Paused: sign in again" };
  return <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">{label[status] ?? status}</span>;
}
