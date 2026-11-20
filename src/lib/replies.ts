// Decides what happened in a sent email's Gmail thread, from headers alone.

export type ThreadMessageLite = { from: string; autoSubmitted: string; internalDate: number };
export type Verdict = { kind: "none" } | { kind: "replied"; at: Date } | { kind: "bounced"; at: Date };

const BOUNCE_RE = /mailer-daemon|postmaster/i;

export function addressOf(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

export function classifyThread(messages: ThreadMessageLite[], myEmail: string, sentAtMs: number): Verdict {
  const me = myEmail.toLowerCase();
  // Anything older than our send (minus clock slack) belongs to an earlier conversation.
  const later = messages.filter((m) => m.internalDate >= sentAtMs - 60_000).sort((a, b) => a.internalDate - b.internalDate);

  const bounce = later.find((m) => BOUNCE_RE.test(m.from));
  if (bounce) return { kind: "bounced", at: new Date(bounce.internalDate) };

  const reply = later.find((m) => {
    if (addressOf(m.from) === me) return false;
    // Out-of-office and other auto-replies set Auto-Submitted; they aren't real replies.
    if (m.autoSubmitted && m.autoSubmitted.toLowerCase() !== "no") return false;
    return true;
  });
  return reply ? { kind: "replied", at: new Date(reply.internalDate) } : { kind: "none" };
}
