import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseContacts } from "../parse";
import { render, templateProblems } from "../template";
import { buildRawMessage } from "../mime";
import { sendTimes } from "../schedule";

const paste = readFileSync(new URL("../../../test-fixtures/apollo-paste.txt", import.meta.url), "utf8");

describe("parseContacts: Apollo paste", () => {
  const list = parseContacts(paste);
  it("finds every person", () => expect(list).toHaveLength(4));
  it("reads a normal block", () => {
    expect(list.find((c) => c.email === "pat.kim@acme.com")).toMatchObject({
      firstName: "Pat", lastName: "Kim", title: "Senior Recruiter | FDE", company: "Acme", location: "Indianapolis, Indiana",
    });
  });
  it("falls back to the email for a cut-off block", () => {
    expect(list[0]).toMatchObject({ firstName: "Jane", lastName: "Doe", title: "", company: "Acme", location: "Sunnyvale, California" });
  });
  it("does not mistake the employee count for a location", () => {
    expect(list.every((c) => c.location !== "9,400")).toBe(true);
  });
});

describe("parseContacts: CSV", () => {
  it("maps common headers, quoted commas, and name fallback", () => {
    const csv = 'First Name,Last Name,Email,Company,Location\nAna,Lee,ana@acme.io,"Acme, Inc","Austin, Texas"\n,,bo.chen@x.com,X,\nnot-an-email,,,,\n';
    const list = parseContacts(csv);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ firstName: "Ana", company: "Acme, Inc", location: "Austin, Texas" });
    expect(list[1]).toMatchObject({ firstName: "Bo", lastName: "Chen" });
  });
  it("dedupes by email", () => {
    expect(parseContacts("email,first name\na@b.co,A\nA@B.co,A\n")).toHaveLength(1);
  });
});

describe("parseContacts: plain lists", () => {
  it("handles comma, semicolon and newline separated emails", () => {
    const list = parseContacts("ana.lee@acme.io, bo@gmail.com; cy.ng@stripe.com\nzed@acme.io");
    expect(list.map((c) => c.email)).toEqual(["ana.lee@acme.io", "bo@gmail.com", "cy.ng@stripe.com", "zed@acme.io"]);
    expect(list[0]).toMatchObject({ firstName: "Ana", lastName: "Lee", company: "Acme" });
    expect(list[1].company).toBe("");
  });
  it("keeps names from Name <email> pairs", () => {
    const list = parseContacts('Mary Yu <mary.yu@co.com>, "Bo Chen" <bo@co.com>');
    expect(list[0]).toMatchObject({ firstName: "Mary", lastName: "Yu", email: "mary.yu@co.com" });
    expect(list[1]).toMatchObject({ firstName: "Bo", lastName: "Chen" });
  });
  it("still treats an Apollo block as an Apollo block", () => {
    expect(parseContacts(paste)[1].title).toBe("Senior Recruiter");
  });
});

describe("template", () => {
  const body = "Hi {{FirstName}},\n\nIntro.\n\n{{CustomLine}}\n\nBye";
  it("fills placeholders and drops an empty custom line cleanly", () => {
    expect(render(body, { firstName: "Mary" })).toBe("Hi Mary,\n\nIntro.\n\nBye");
    expect(render(body, { firstName: "Mary", customLine: "Hey" })).toBe("Hi Mary,\n\nIntro.\n\nHey\n\nBye");
  });
  it("flags bracket text, unknown tokens and blank fields", () => {
    const p = templateProblems("Hi [ROLE]", "{{Nickname}} {{Company}}", [{ company: "" }]);
    expect(p.join("\n")).toMatch(/\[ROLE\]/);
    expect(p.join("\n")).toMatch(/Nickname/);
    expect(p.join("\n")).toMatch(/no Company/);
  });
  it("passes a clean template", () => {
    expect(templateProblems("Hi", "Hi {{FirstName}} {{CustomLine}}", [{ firstName: "A" }])).toEqual([]);
  });
});

describe("mime", () => {
  it("builds a decodable message with attachment and safe headers", () => {
    const raw = buildRawMessage({
      fromName: "Layth Sarama", fromEmail: "me@gmail.com", to: "x@y.com",
      subject: "Café\r\nBcc: evil@x.com", body: "Line 1\nLine 2",
      attachment: { filename: "resume.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4") },
    });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toMatch(/^From: "Layth Sarama" <me@gmail.com>\r\n/);
    expect(text).not.toMatch(/\r\nBcc:/);
    expect(text).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(text).toMatch(/filename="resume.pdf"/);
    const bodyB64 = text.split('charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split("\r\n--")[0];
    expect(Buffer.from(bodyB64.replace(/\r\n/g, ""), "base64").toString()).toBe("Line 1\r\nLine 2");
  });
});

describe("sendTimes", () => {
  it("starts exactly on time and spaces the rest", () => {
    const start = new Date("2026-11-20T16:00:00Z");
    const t = sendTimes(start, 3, 3, () => 0.5);
    expect(t[0].toISOString()).toBe("2026-11-20T16:00:00.000Z");
    expect(t[1].toISOString()).toBe("2026-11-20T16:03:30.000Z");
    expect(t[2].toISOString()).toBe("2026-11-20T16:06:30.000Z");
  });
});
