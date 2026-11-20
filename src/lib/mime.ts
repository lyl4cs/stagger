// Builds a raw email (RFC 2822 / MIME) in the base64url form the Gmail API's
// messages.send endpoint expects.
//
// Without tracking: a plain-text email. With an open-tracking pixel URL: a
// multipart/alternative email whose HTML part is the same text plus a 1x1 image.
// Either can carry one attachment, which wraps everything in multipart/mixed.

export type Attachment = { filename: string; contentType: string; data: Buffer };

export type Message = {
  fromName?: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  attachment?: Attachment;
  trackingPixelUrl?: string;
};

// Headers must be ASCII. Anything else (accents, curly quotes) gets RFC 2047 encoded.
function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
const stripCrlf = (s: string) => s.replace(/[\r\n]+/g, " "); // blocks header injection
const boundary = (tag: string) => `${tag}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function textToHtml(text: string, pixelUrl?: string): string {
  const body = escapeHtml(text).replace(/\r?\n/g, "<br>\n");
  const pixel = pixelUrl
    ? `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="border:0;width:1px;height:1px">`
    : "";
  return `<div dir="ltr">${body}</div>${pixel}`;
}

function base64Part(contentType: string, content: string | Buffer, extraHeaders: string[] = []): string {
  const data = typeof content === "string" ? Buffer.from(content.replace(/\r?\n/g, "\r\n"), "utf8") : content;
  return [`Content-Type: ${contentType}`, ...extraHeaders, "Content-Transfer-Encoding: base64", "", wrap76(data.toString("base64"))].join("\r\n");
}

function multipart(kind: "mixed" | "alternative", parts: string[]): { header: string; body: string } {
  const b = boundary(kind[0]);
  return {
    header: `Content-Type: multipart/${kind}; boundary="${b}"`,
    body: [...parts.flatMap((p) => [`--${b}`, p]), `--${b}--`].join("\r\n"),
  };
}

export function buildRawMessage(m: Message): string {
  const from = m.fromName
    ? `${encodeHeader(`"${stripCrlf(m.fromName).replace(/"/g, "")}"`)} <${m.fromEmail}>`
    : m.fromEmail;
  const headers = [
    `From: ${from}`,
    `To: ${stripCrlf(m.to)}`,
    `Subject: ${encodeHeader(stripCrlf(m.subject))}`,
    "MIME-Version: 1.0",
  ];

  const text = base64Part('text/plain; charset="UTF-8"', m.body);

  // The readable content: plain text alone, or text + HTML-with-pixel as alternatives.
  let content: string;
  if (m.trackingPixelUrl) {
    const html = base64Part('text/html; charset="UTF-8"', textToHtml(m.body, m.trackingPixelUrl));
    const alt = multipart("alternative", [text, html]);
    content = `${alt.header}\r\n\r\n${alt.body}`;
  } else {
    content = text;
  }

  if (m.attachment) {
    const name = stripCrlf(m.attachment.filename).replace(/"/g, "");
    const file = base64Part(`${m.attachment.contentType}; name="${name}"`, m.attachment.data, [
      `Content-Disposition: attachment; filename="${name}"`,
    ]);
    const mixed = multipart("mixed", [content, file]);
    content = `${mixed.header}\r\n\r\n${mixed.body}`;
  }

  return Buffer.from([...headers, content].join("\r\n"), "utf8").toString("base64url");
}
