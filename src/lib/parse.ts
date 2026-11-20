// Turns pasted text into a list of contacts.
// Handles two shapes: a CSV with a header row, or a raw copy-paste from a
// contact tool like Apollo, where each person is a block of lines around an email.

export type Contact = {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  company: string;
  location: string;
  customLine: string;
};

const EMAIL_RE = /^[\w.+'-]+@[\w-]+(\.[\w-]+)+$/;

export function isEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function parseContacts(text: string): Contact[] {
  const firstLine = text.trim().split(/\r?\n/)[0] ?? "";
  const looksLikeCsv = /email/i.test(firstLine) && /[,\t]/.test(firstLine);
  const contacts = looksLikeCsv ? parseCsv(text) : parseRawPaste(text);
  return dedupe(contacts);
}

function dedupe(list: Contact[]): Contact[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = c.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function nameFromEmail(email: string): [string, string] {
  const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean).map(cap);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

const PERSONAL_DOMAINS = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "aol", "proton", "protonmail"]);

function companyFromDomain(email: string): string {
  const label = email.split("@")[1]?.split(".")[0] ?? "";
  return PERSONAL_DOMAINS.has(label) ? "" : cap(label);
}

/* ---------- Raw paste (Apollo-style blocks) ---------- */

export function parseRawPaste(text: string): Contact[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: Contact[] = [];

  lines.forEach((line, i) => {
    if (!isEmail(line)) return;
    const email = line.toLowerCase();

    // The block above an email reads, bottom to top: company, title, name.
    const above: string[] = [];
    for (let j = i - 1; j >= 0 && j >= i - 8 && above.length < 3; j--) {
      if (isEmail(lines[j])) break; // ran into the previous person
      if (lines[j]) above.push(lines[j]);
    }
    const name = above[2] ?? "";
    let company = above[0] ?? "";
    let title = above[1] ?? "";

    // If the name's last word doesn't match the email, the block was cut off or
    // shaped differently. Trust the email instead of guessing.
    const localParts = email.split("@")[0].split(/[._-]+/);
    const lastFromEmail = localParts[localParts.length - 1];
    const lastFromName = name.split(/\s+/).pop()?.toLowerCase() ?? "";
    let first: string, last: string;
    if (name && lastFromName === lastFromEmail) {
      const parts = name.split(/\s+/);
      first = parts[0];
      last = parts.slice(1).join(" ");
    } else {
      [first, last] = nameFromEmail(email);
      title = "";
      if (/^[+\d]/.test(company)) company = "";
    }
    if (!company) company = companyFromDomain(email);

    // Location is the first "City, State" style line after the email.
    let location = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 16); j++) {
      const t = lines[j];
      if (isEmail(t)) break;
      if ((t.includes(",") && !/^[\d,+\s]+$/.test(t)) || t === "United States") {
        location = t;
        break;
      }
    }

    out.push({ firstName: first, lastName: last, email, title, company, location, customLine: "" });
  });

  return out;
}

/* ---------- CSV ---------- */

const HEADER_ALIASES: Record<keyof Contact, string[]> = {
  firstName: ["firstname", "first", "first name", "given name"],
  lastName: ["lastname", "last", "last name", "surname", "family name"],
  email: ["email", "e-mail", "email address", "work email"],
  title: ["title", "job title", "position", "role"],
  company: ["company", "company name", "organization", "organisation", "account name"],
  location: ["location", "city", "region"],
  customLine: ["customline", "custom line", "custom", "note", "personal line"],
};

export function parseCsv(text: string): Contact[] {
  const delimiter = text.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
  const rows = splitCsv(text, delimiter).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col: Partial<Record<keyof Contact, number>> = {};
  (Object.keys(HEADER_ALIASES) as (keyof Contact)[]).forEach((key) => {
    const idx = headers.findIndex((h) => HEADER_ALIASES[key].includes(h));
    if (idx >= 0) col[key] = idx;
  });
  const fullNameIdx = headers.findIndex((h) => h === "name" || h === "full name");

  return rows.slice(1).flatMap((r) => {
    const get = (k: keyof Contact) => (col[k] !== undefined ? (r[col[k]!] ?? "").trim() : "");
    const email = get("email").toLowerCase();
    if (!isEmail(email)) return [];
    let firstName = get("firstName");
    let lastName = get("lastName");
    if (!firstName && fullNameIdx >= 0) {
      const parts = (r[fullNameIdx] ?? "").trim().split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    if (!firstName) [firstName, lastName] = nameFromEmail(email);
    return [{
      firstName, lastName, email,
      title: get("title"), company: get("company"), location: get("location"), customLine: get("customLine"),
    }];
  });
}

// Minimal RFC 4180 splitter: handles quoted fields, escaped quotes and newlines inside quotes.
function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}
