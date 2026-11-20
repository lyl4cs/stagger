"use client";
import { supabaseBrowser } from "./supabase/client";

// gmail.send: send as you. gmail.metadata: read headers (who replied, bounces), never bodies.
// access_type=offline + prompt=consent make Google return a refresh token every time.
export async function signInWithGoogle() {
  await supabaseBrowser().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.metadata",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}

export async function signOut() {
  await supabaseBrowser().auth.signOut();
  // Full reload on purpose: drops every bit of in-memory state from the signed-out session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}
