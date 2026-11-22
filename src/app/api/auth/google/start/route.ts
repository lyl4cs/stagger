import { NextResponse, type NextRequest } from "next/server";
import { SEND_SCOPE, HEADERS_SCOPE } from "@/lib/gmail";

// Step 1 of sign-in: send the browser to Google ourselves instead of through Supabase,
// so Google's screens say "continue to <this app's domain>" rather than the Supabase URL.
//   ?consent=1   show Google's permission screen (the only way to get a new refresh token)
//   ?tracking=1  also ask for the headers permission that reply tracking needs
//   ?fresh=1     don't fold in permissions granted earlier (used right after revoking)
//   ?next=/path  where to land afterwards (same-site paths only)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tracking = url.searchParams.get("tracking") === "1";
  const fresh = url.searchParams.get("fresh") === "1";
  // Adding a permission needs the consent screen so Google issues a refresh token that covers it.
  const forceConsent = url.searchParams.get("consent") === "1" || tracking;
  const nextParam = url.searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/campaigns"; // no open redirects
  const state = crypto.randomUUID(); // ties the callback to this browser (CSRF protection)

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${url.origin}/api/auth/google/callback`,
    response_type: "code",
    scope: ["openid", "email", "profile", SEND_SCOPE, ...(tracking ? [HEADERS_SCOPE] : [])].join(" "),
    access_type: "offline",          // ask for a refresh token so we can send while you're offline
    include_granted_scopes: fresh ? "false" : "true", // keep reply tracking on for people who already turned it on
    prompt: forceConsent ? "consent" : "select_account",
    state,
  }).toString();

  const res = NextResponse.redirect(google);
  const cookie = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  res.cookies.set("g_oauth_state", state, cookie);
  res.cookies.set("g_oauth_next", next, cookie);
  return res;
}
