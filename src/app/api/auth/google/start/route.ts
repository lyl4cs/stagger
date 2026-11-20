import { NextResponse, type NextRequest } from "next/server";
import { GMAIL_SCOPES } from "@/lib/gmail";

// Step 1 of sign-in: send the browser to Google ourselves instead of through Supabase,
// so Google's screens say "continue to <this app's domain>" rather than the Supabase URL.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forceConsent = url.searchParams.get("consent") === "1";
  const state = crypto.randomUUID(); // ties the callback to this browser (CSRF protection)

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: "code",
    scope: ["openid", "email", "profile", ...GMAIL_SCOPES].join(" "),
    access_type: "offline",          // ask for a refresh token so we can send while you're offline
    include_granted_scopes: "true",
    prompt: forceConsent ? "consent" : "select_account",
    state,
  }).toString();

  const res = NextResponse.redirect(google);
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
