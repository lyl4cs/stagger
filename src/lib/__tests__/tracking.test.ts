import { describe, it, expect } from "vitest";
import { buildRawMessage, textToHtml } from "../mime";
import { classifyThread } from "../replies";
import { campaignLook, personLook, counters, startOfWeek, activity } from "../view";
import type { Recipient } from "../types";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("mime with tracking", () => {
  it("adds an HTML alternative with the pixel, keeps the text part, nests under mixed with an attachment", () => {
    const text = decode(buildRawMessage({
      fromEmail: "me@gmail.com", to: "x@y.com", subject: "Hi", body: "a <b> & c\nline2",
      trackingPixelUrl: "https://app.test/api/o/123",
      attachment: { filename: "r.pdf", contentType: "application/pdf", data: Buffer.from("pdf") },
    }));
    expect(text).toMatch(/Content-Type: multipart\/mixed/);
    expect(text).toMatch(/Content-Type: multipart\/alternative/);
    expect(text.indexOf("multipart/mixed")).toBeLessThan(text.indexOf("multipart/alternative"));
    expect(text).toMatch(/text\/plain/);
    expect(text).toMatch(/text\/html/);
  });
  it("escapes HTML and places the pixel", () => {
    const html = textToHtml("a <b> & c\nline2", "https://app.test/api/o/1");
    expect(html).toContain("a &lt;b&gt; &amp; c<br>");
    expect(html).toContain('<img src="https://app.test/api/o/1"');
  });
  it("stays plain text without tracking", () => {
    const text = decode(buildRawMessage({ fromEmail: "me@gmail.com", to: "x@y.com", subject: "Hi", body: "yo" }));
    expect(text).not.toMatch(/multipart/);
  });
});

describe("classifyThread", () => {
  const sent = Date.parse("2026-11-20T16:00:00Z");
  const me = "Layth@Gmail.com";
  it("finds a real reply", () => {
    const v = classifyThread([
      { from: "Layth <layth@gmail.com>", autoSubmitted: "", internalDate: sent },
      { from: "Mary Yu <mary@co.com>", autoSubmitted: "", internalDate: sent + 3_600_000 },
    ], me, sent);
    expect(v.kind).toBe("replied");
  });
  it("ignores out-of-office auto replies and my own follow-ups", () => {
    const v = classifyThread([
      { from: "layth@gmail.com", autoSubmitted: "", internalDate: sent },
      { from: "Mary <mary@co.com>", autoSubmitted: "auto-replied", internalDate: sent + 1000 },
      { from: "layth@gmail.com", autoSubmitted: "", internalDate: sent + 2000 },
    ], me, sent);
    expect(v.kind).toBe("none");
  });
  it("detects a bounce", () => {
    const v = classifyThread([
      { from: "layth@gmail.com", autoSubmitted: "", internalDate: sent },
      { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", autoSubmitted: "auto-replied", internalDate: sent + 5000 },
    ], me, sent);
    expect(v.kind).toBe("bounced");
  });
});

describe("view helpers", () => {
  it("labels campaigns", () => {
    const now = Date.parse("2026-11-20T16:05:00Z");
    expect(campaignLook({ status: "scheduled", start_at: "2026-11-20T16:00:00Z" }, now)).toBe("sending");
    expect(campaignLook({ status: "scheduled", start_at: "2026-11-21T16:00:00Z" }, now)).toBe("scheduled");
    expect(campaignLook({ status: "needs_reauth", start_at: null }, now)).toBe("paused");
  });
  it("labels people, replies win over opens", () => {
    expect(personLook({ status: "sent", opened_at: "x", replied_at: "y" })).toBe("replied");
    expect(personLook({ status: "sent", opened_at: "x", replied_at: null })).toBe("opened");
    expect(personLook({ status: "queued", opened_at: null, replied_at: null })).toBe("waiting");
  });
  it("counts the week from Monday", () => {
    const thu = new Date(2026, 10, 19, 21, 0);
    expect(startOfWeek(thu).getDay()).toBe(1);
    expect(startOfWeek(thu).getDate()).toBe(16);
    const c = counters([
      { status: "sent", sent_at: new Date(2026, 10, 17).toISOString(), replied_at: "x" },
      { status: "sent", sent_at: new Date(2026, 10, 10).toISOString(), replied_at: null },
      { status: "queued", sent_at: null, replied_at: null },
    ], thu);
    expect(c).toEqual({ sentAll: 2, sentWeek: 1, replies: 1, scheduled: 1 });
  });
  it("builds an activity feed newest first", () => {
    const r = { id: "1", first_name: "Mary", last_name: "Yu", email: "m@x.com", status: "sent", sent_at: "2026-11-20T16:03:00Z", replied_at: "2026-11-20T18:00:00Z", opened_at: null } as unknown as Recipient;
    const feed = activity({ start_at: "2026-11-20T16:00:00Z" }, [r]);
    expect(feed.map((f) => f.kind)).toEqual(["replied", "sent", "started"]);
  });
});
