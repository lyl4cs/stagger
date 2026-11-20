import "server-only";

// Thrown when Google won't refresh the token: the user revoked access, or (while the
// Google app is in "Testing") the 7-day refresh token expired. Fix: sign in again.
export class ReauthError extends Error {}
// 429 / 5xx from Gmail: worth retrying later.
export class RetryableError extends Error {}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new ReauthError("Google sign-in expired or was revoked");
    throw new RetryableError(`Token refresh failed (${res.status}): ${json.error ?? "unknown"}`);
  }
  return json.access_token as string;
}

export async function sendGmail(accessToken: string, raw: string): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json.id as string;
  const msg = json?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) throw new ReauthError(msg);
  if (res.status === 429 || res.status >= 500) throw new RetryableError(msg);
  throw new Error(msg);
}
