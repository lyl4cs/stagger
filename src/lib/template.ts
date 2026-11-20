// Fills {{Placeholders}} in a subject/body for one contact, and checks a
// template for mistakes before anything gets scheduled.

import type { Contact } from "./parse";

export const PLACEHOLDERS: Record<string, keyof Contact> = {
  FirstName: "firstName",
  LastName: "lastName",
  Email: "email",
  Title: "title",
  Company: "company",
  Location: "location",
  CustomLine: "customLine",
};

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

export function render(text: string, contact: Partial<Contact>): string {
  return text
    .replace(TOKEN_RE, (_, key: string) => {
      const field = PLACEHOLDERS[key];
      return field ? String(contact[field] ?? "").trim() : `{{${key}}}`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n") // an empty {{CustomLine}} on its own line leaves no gap
    .trim();
}

export function templateProblems(
  subject: string,
  body: string,
  contacts: Partial<Contact>[],
): string[] {
  const problems: string[] = [];
  if (!subject.trim()) problems.push("Subject is empty.");
  if (!body.trim()) problems.push("Body is empty.");

  const brackets = `${subject}\n${body}`.match(/\[[^\]\n]{2,80}\]/g);
  if (brackets) problems.push(`Unfilled placeholder text: ${[...new Set(brackets)].join(", ")}`);

  const used = [...`${subject}\n${body}`.matchAll(TOKEN_RE)].map((m) => m[1]);
  const unknown = [...new Set(used.filter((k) => !PLACEHOLDERS[k]))];
  if (unknown.length) {
    problems.push(`Unknown placeholder(s): ${unknown.map((k) => `{{${k}}}`).join(", ")}. Use ${Object.keys(PLACEHOLDERS).map((k) => `{{${k}}}`).join(", ")}.`);
  }

  // A placeholder that's blank for someone means a broken sentence, except CustomLine, which is optional.
  for (const key of new Set(used)) {
    const field = PLACEHOLDERS[key];
    if (!field || field === "customLine") continue;
    const missing = contacts.filter((c) => !String(c[field] ?? "").trim()).length;
    if (missing) problems.push(`${missing} contact(s) have no ${key}, but the template uses {{${key}}}.`);
  }

  if (contacts.length === 0) problems.push("No contacts to send to.");
  return problems;
}

const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** Problems with the template itself, independent of who it goes to. */
export function globalProblems(subject: string, body: string): string[] {
  const problems: string[] = [];
  if (!subject.trim()) problems.push("The email has no subject.");
  if (!body.trim()) problems.push("The email body is empty.");
  const brackets = `${subject}\n${body}`.match(/\[[^\]\n]{2,80}\]/g);
  if (brackets) problems.push(`${[...new Set(brackets)].join(", ")} is still in the email.`);
  const used = [...`${subject}\n${body}`.matchAll(TOKEN_RE)].map((m) => m[1]);
  const unknown = [...new Set(used.filter((k) => !PLACEHOLDERS[k]))];
  if (unknown.length) problems.push(`${unknown.map((k) => `{{${k}}}`).join(", ")} isn't a placeholder this app knows.`);
  return problems;
}

/** Problems for one person: placeholders the template uses that are blank for them. */
export function personProblems(c: Partial<Contact>, subject: string, body: string): string[] {
  const used = new Set([...`${subject}\n${body}`.matchAll(TOKEN_RE)].map((m) => m[1]));
  const who = String(c.firstName || c.email || "this person");
  const out: string[] = [];
  for (const key of used) {
    const field = PLACEHOLDERS[key];
    if (!field || field === "customLine") continue;
    if (!String(c[field] ?? "").trim()) {
      const where = subject.includes(`{{${key}}}`) ? "The subject and body will read wrong." : "A sentence will read wrong.";
      out.push(`No ${label(key)} for ${who}. ${where}`);
    }
  }
  return out;
}
