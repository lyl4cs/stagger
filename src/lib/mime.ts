// Builds a raw email (RFC 2822 / MIME) in the base64url form the Gmail API's
// messages.send endpoint expects. Plain text body, optional single attachment.

export type Attachment = { filename: string; contentType: string; data: Buffer };

export type Message = {
  fromName?: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
  attachment?: Attachment;
};

// Headers must be ASCII. Anything else (accents, curly quotes) gets RFC 2047 encoded.
function encodeHeader(value: string): string {
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function stripCrlf(s: string): string {
  return s.replace(/[\r\n]+/g, " "); // blocks header injection through a subject or name
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

  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64")),
  ].join("\r\n");

  let raw: string;
  if (!m.attachment) {
    raw = [...headers, textPart].join("\r\n");
  } else {
    const boundary = `b_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const name = stripCrlf(m.attachment.filename).replace(/"/g, "");
    raw = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      textPart,
      `--${boundary}`,
      `Content-Type: ${m.attachment.contentType}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(m.attachment.data.toString("base64")),
      `--${boundary}--`,
    ].join("\r\n");
  }

  return Buffer.from(raw, "utf8").toString("base64url");
}
