import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Google sends the user back here after they approve. We swap the code for a session,
// and save Google's refresh token so the server can send mail later while they're offline.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?error=missing_code", url.origin));

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(new URL("/?error=auth", url.origin));

  const { session } = data;
  if (session.provider_refresh_token) {
    await supabaseAdmin().from("gmail_tokens").upsert({
      user_id: session.user.id,
      email: session.user.email!,
      refresh_token: session.provider_refresh_token,
      updated_at: new Date().toISOString(),
    });
  }
  return NextResponse.redirect(new URL("/campaigns", url.origin));
}
