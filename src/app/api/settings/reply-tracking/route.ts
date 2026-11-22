import { handle, requireUser } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revokeGoogleToken } from "@/lib/gmail";

// Turning reply tracking OFF. Google can't remove one permission from a grant, so we
// revoke the whole grant (that is what actually takes inbox access away) and delete our
// copy. The browser then goes straight back through Google for send-only access.
// Turning it ON needs no endpoint: the browser just goes to /api/auth/google/start?tracking=1.
export async function DELETE() {
  return handle(async () => {
    const { user } = await requireUser();
    const admin = supabaseAdmin();
    const { data } = await admin.from("gmail_tokens").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (data) {
      await revokeGoogleToken(data.refresh_token);
      await admin.from("gmail_tokens").delete().eq("user_id", user.id);
    }
    return { next: "/api/auth/google/start?consent=1&fresh=1&next=/settings" };
  });
}
