"use client";
import { useState } from "react";
import { ConfirmDialog } from "./ui";
import { Trash } from "./icons";

// Delete button plus its confirm step. `queued` is how many emails haven't gone out yet,
// so the dialog can say exactly what deleting will stop.
export function DeleteCampaign({ id, name, queued, variant, onDeleted }: {
  id: string; name: string; queued: number; variant: "icon" | "text"; onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Couldn't delete. Try again.");
    setOpen(false);
    onDeleted();
  }

  return (
    <>
      {variant === "icon" ? (
        <button type="button" className="btn-icon-danger" aria-label={`Delete ${name}`} title="Delete campaign" onClick={() => setOpen(true)}>
          <Trash />
        </button>
      ) : (
        <button type="button" className="btn-ghost-danger" onClick={() => setOpen(true)}><Trash />Delete campaign</button>
      )}
      {open && (
        <ConfirmDialog
          title={`Delete "${name}"?`}
          confirmLabel={busy ? "Deleting..." : "Delete"}
          cancelLabel="Keep it"
          danger busy={busy} error={error}
          onConfirm={confirm} onClose={() => !busy && setOpen(false)}
        >
          {queued > 0
            ? `${queued} email${queued === 1 ? "" : "s"} still waiting to send won't go out. `
            : "Its contacts and tracking go with it. "}
          Emails already sent stay in your Gmail. This can&apos;t be undone.
        </ConfirmDialog>
      )}
    </>
  );
}
