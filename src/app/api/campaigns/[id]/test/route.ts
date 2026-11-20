import { handle, requireUser, HttpError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { render } from "@/lib/template";
import { buildRawMessage } from "@/lib/mime";
import { getAccessToken, sendGmail, ReauthError } from "@/lib/gmail";
import { toContact, type Campaign, type Recipient } from "@/lib/types";

// Sends one rendered copy to yourself, built from a chosen contact (or the first unsent one).
export async function POST(req: Request, ctx: RouteContext<"/api/campaigns/[id]/test">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { sb, user } = await requireUser();
    const { recipientId } = await req.json().catch(() => ({}));

    const { data: c } = await sb.from("campaigns").select("*").eq("id", id).single<Campaign>();
    if (!c) throw new HttpError(404, "Campaign not found");

    let q = sb.from("recipients").select("*").eq("campaign_id", id);
    q = recipientId ? q.eq("id", recipientId) : q.neq("status", "skipped").order("position");
    const { data: rows } = await q.limit(1);
    const r = (rows as Recipient[] | null)?.[0];
    if (!r) throw new HttpError(400, "Add a contact first");

    const admin = supabaseAdmin();
    const { data: token } = await admin.from("gmail_tokens").select("*").eq("user_id", user.id).maybeSingle();
    if (!token) throw new HttpError(400, "Sign in with Google again");

    let attachment;
    if (c.attachment_path) {
      const { data: file } = await admin.storage.from("attachments").download(c.attachment_path);
      if (file) attachment = { filename: c.attachment_name || "attachment", contentType: file.type || "application/pdf", data: Buffer.from(await file.arrayBuffer()) };
    }

    try {
      const access = await getAccessToken(token.refresh_token);
      await sendGmail(access, buildRawMessage({
        fromName: c.sender_name || undefined, fromEmail: token.email, to: token.email,
        subject: `[TEST] ${render(c.subject, toContact(r))}`, body: render(c.body, toContact(r)), attachment,
      }));
    } catch (e) {
      if (e instanceof ReauthError) throw new HttpError(401, "Google sign-in expired. Sign out and back in.");
      throw e;
    }
    return { sentTo: token.email, builtFrom: r.email };
  });
}
