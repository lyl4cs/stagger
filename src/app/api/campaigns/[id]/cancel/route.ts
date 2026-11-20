import { handle, requireUser } from "@/lib/api";

// Stops a run. Already-sent rows stay sent; everything else goes back to pending.
export async function POST(_req: Request, ctx: RouteContext<"/api/campaigns/[id]/cancel">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { sb } = await requireUser();
    await sb.from("campaigns").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", id);
    const { data } = await sb.from("recipients").update({ status: "pending", send_at: null })
      .eq("campaign_id", id).eq("status", "queued").select("id");
    return { cancelled: data?.length ?? 0 };
  });
}
