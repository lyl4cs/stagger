import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Step 2 of sign-in: Google sends the user back here with a one-time code.
// We swap it for tokens, sign the user into Supabase with Google's ID token,
// and save the refresh token the server uses to send mail later.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url.origin));
    res.cookies.delete("g_oauth_state");
    res.cookies.delete("g_oauth_next");
    return res;
  };
  const next = req.cookies.get("g_oauth_next")?.value ?? "/campaigns";

  if (url.searchParams.get("error")) return go("/?error=google_denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("g_oauth_state")?.value) return go("/?error=state");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.id_token) {
    console.error("Google token exchange failed:", tokens.error, tokens.error_description);
    return go("/?error=google_token");
  }

  // Google lets people untick permissions. Without send access the app is useless, so ask again.
  if (!String(tokens.scope ?? "").includes("gmail.send")) return go("/?error=missing_scope");

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithIdToken({
    provider: "google",
    token: tokens.id_token,
    access_token: tokens.access_token,
  });
  if (error || !data.user) {
    console.error("Supabase sign-in with Google ID token failed:", error?.message);
    return go("/?error=auth");
  }

  const admin = supabaseAdmin();
  // Google's answer lists every permission this grant now covers, so it is the source of truth.
  const scopes = String(tokens.scope ?? "");
  if (tokens.refresh_token) {
    const { error: saveError } = await admin.from("gmail_tokens").upsert({
      user_id: data.user.id,
      email: data.user.email!,
      refresh_token: tokens.refresh_token,
      scopes,
      updated_at: new Date().toISOString(),
    });
    if (saveError) {
      console.error("Saving Gmail token failed:", saveError.message);
      return go("/?error=token_save");
    }
  } else {
    // Normal sign-ins skip Google's permission screen, so no new refresh token comes back.
    // Fine if one is saved already; otherwise go through the permission screen once.
    const { data: existing } = await admin.from("gmail_tokens").update({ scopes, updated_at: new Date().toISOString() })
      .eq("user_id", data.user.id).select("user_id").maybeSingle();
    if (!existing) return go("/?consent=1");
  }
  return go(next.startsWith("/settings") ? "/settings?from=google" : next.startsWith("/") && !next.startsWith("//") ? next : "/campaigns");
}
