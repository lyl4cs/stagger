import { handle, requireUser, HttpError } from "@/lib/api";

// Deletes a campaign for good. Deleting the row is what stops sending: its recipients are
// removed with it (on delete cascade), so the cron has nothing left to claim. Row-level
// security means someone else's campaign id just matches nothing and returns 404.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { sb, user } = await requireUser();
    const { data, error } = await sb.from("campaigns").delete().eq("id", id).select("id");
    if (error) throw new HttpError(500, error.message);
    if (!data?.length) throw new HttpError(404, "Campaign not found");

    // Every upload for a campaign lives under <user>/<campaign>/, so clear the whole folder
    // (this also catches files left behind by earlier replaced attachments).
    // Best effort: a leftover file costs a few KB, a failed delete would confuse the user.
    try {
      const folder = `${user.id}/${id}`;
      const { data: files } = await sb.storage.from("attachments").list(folder);
      if (files?.length) await sb.storage.from("attachments").remove(files.map((f) => `${folder}/${f.name}`));
    } catch (e) {
      console.error("Attachment cleanup failed:", e);
    }
    return { deleted: true };
  });
}
