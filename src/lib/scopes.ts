// Plain module (no server-only) so it can be unit tested.
// Everyone grants SEND_SCOPE: send as the user, no inbox access at all.
// Reply tracking is opt-in and adds HEADERS_SCOPE: message headers (sender, subject, date)
// across the inbox, never message text. Stagger only uses it on threads it started.
export const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const HEADERS_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";

/** `scopes` is the space-separated list Google returned when the user signed in. */
export const hasReplyTracking = (scopes: string | null | undefined) => (scopes ?? "").split(" ").includes(HEADERS_SCOPE);
