"use client";
import { supabaseBrowser } from "./supabase/client";

// gmail.send: send as you. gmail.metadata: read headers (who replied, bounces), never bodies.
// Google only hands out a refresh token (what lets the server send while you're offline) when
// it shows the full permission screen. So normal sign-ins skip that screen, and we force it only
// the first time or after the old token stops working (forceConsent).
export async function signInWithGoogle(opts: { forceConsent?: boolean } = {}) {
  await supabaseBrowser().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.metadata",
      queryParams: { access_type: "offline", prompt: opts.forceConsent ? "consent" : "select_account" },
    },
  });
}

export async function signOut() {
  await supabaseBrowser().auth.signOut();
  // Full reload on purpose: drops every bit of in-memory state from the signed-out session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}
