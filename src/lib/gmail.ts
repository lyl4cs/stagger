import "server-only";

// Thrown when Google won't refresh the token: the user revoked access, or (while the
// Google app is in "Testing") the 7-day refresh token expired. Fix: sign in again.
export class ReauthError extends Error {}
// 429 / 5xx from Gmail: worth retrying later.
export class RetryableError extends Error {}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",     // send as the user
  "https://www.googleapis.com/auth/gmail.metadata", // headers only: who replied, never the body
];

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

async function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json;
  const msg = json?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) throw new ReauthError(msg);
  if (res.status === 429 || res.status >= 500) throw new RetryableError(msg);
  throw new Error(msg);
}

export async function sendGmail(accessToken: string, raw: string): Promise<{ id: string; threadId: string }> {
  const json = await gmailFetch(accessToken, "messages/send", { method: "POST", body: JSON.stringify({ raw }) });
  return { id: json.id, threadId: json.threadId };
}

export type ThreadMessage = { from: string; autoSubmitted: string; internalDate: number };

/** Headers-only view of a thread (gmail.metadata scope). */
export async function getThreadMessages(accessToken: string, threadId: string): Promise<ThreadMessage[]> {
  const json = await gmailFetch(accessToken, `threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Auto-Submitted`);
  type Raw = { internalDate: string; payload?: { headers?: { name: string; value: string }[] } };
  return (json.messages ?? []).map((m: Raw) => {
    const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
    return { from: header("from"), autoSubmitted: header("auto-submitted"), internalDate: Number(m.internalDate) };
  });
}
