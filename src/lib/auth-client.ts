"use client";
import { supabaseBrowser } from "./supabase/client";

// Sign-in goes through our own /api/auth/google routes (not Supabase's hosted flow), so
// Google shows this app's domain on its screens. Normal sign-ins skip Google's permission
// screen; forceConsent shows it, which is the only time Google hands out a refresh token.
export function signInWithGoogle(opts: { forceConsent?: boolean } = {}) {
  // Full page load on purpose: this route redirects to Google, which client-side routing can't do.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/api/auth/google/start${opts.forceConsent ? "?consent=1" : ""}`;
}

export async function signOut() {
  await supabaseBrowser().auth.signOut();
  // Full reload on purpose: drops every bit of in-memory state from the signed-out session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}
