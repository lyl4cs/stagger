import { handle, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { templateProblems } from "@/lib/template";
import { sendTimes } from "@/lib/schedule";
import { toContact, type Campaign, type Recipient } from "@/lib/types";

// (Re)schedules everything in the campaign that hasn't been sent yet.
export async function POST(req: Request, ctx: RouteContext<"/api/campaigns/[id]/schedule">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { sb, user } = await requireUser();
    const { startAt } = await req.json();

    const start = new Date(startAt);
    if (Number.isNaN(start.getTime())) throw new HttpError(400, "Invalid start time");
    if (start.getTime() < Date.now() - 60_000) throw new HttpError(400, "Start time is in the past");

    const { data: campaign } = await sb.from("campaigns").select("*").eq("id", id).single<Campaign>();
    if (!campaign) throw new HttpError(404, "Campaign not found");

    const { data: rows } = await sb.from("recipients").select("*").eq("campaign_id", id)
      .in("status", ["pending", "queued"]).order("position");
    const recipients = (rows ?? []) as Recipient[];

    const problems = templateProblems(campaign.subject, campaign.body, recipients.map(toContact));
    if (problems.length) throw new HttpError(400, "Fix the template first", { problems });

    const { data: token } = await supabaseAdmin().from("gmail_tokens").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!token) throw new HttpError(400, "Sign in with Google again so the app can send from your Gmail");

    const times = sendTimes(start, recipients.length, campaign.gap_minutes);
    await Promise.all(recipients.map((r, i) =>
      sb.from("recipients").update({ status: "queued", send_at: times[i].toISOString(), error: null }).eq("id", r.id)));
    await sb.from("campaigns").update({ status: "scheduled", start_at: start.toISOString(), updated_at: new Date().toISOString() }).eq("id", id);

    return { scheduled: recipients.length, firstAt: times[0]?.toISOString(), lastAt: times.at(-1)?.toISOString() };
  });
}
