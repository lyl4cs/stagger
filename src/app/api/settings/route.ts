import { handle, requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasReplyTracking } from "@/lib/gmail";

// What the settings page shows. Tokens are server-only (no RLS policies), so this
// reports on them without ever sending the token itself to the browser.
export async function GET() {
  return handle(async () => {
    const { user } = await requireUser();
    const { data } = await supabaseAdmin().from("gmail_tokens").select("email,scopes").eq("user_id", user.id).maybeSingle();
    return { email: user.email, connected: !!data, replyTracking: hasReplyTracking(data?.scopes) };
  });
}
