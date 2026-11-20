import { render, PLACEHOLDERS } from "@/lib/template";
import type { Contact } from "@/lib/parse";

// Missing values become marked gaps instead of silently disappearing, so the
// preview shows exactly where a sentence would read wrong.
const OPEN = "", CLOSE = "";
const MARK_RE = new RegExp(`(${OPEN}[^${CLOSE}]*${CLOSE}|\\[[^\\]\\n]{2,80}\\])`, "g");

function withGaps(c: Contact): Contact {
  const out = { ...c };
  for (const [key, field] of Object.entries(PLACEHOLDERS)) {
    if (field === "customLine") continue;
    if (!String(c[field] ?? "").trim()) out[field] = `${OPEN}no ${key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}${CLOSE}`;
  }
  return out;
}

function Marked({ text }: { text: string }) {
  return (
    <>
      {text.split(MARK_RE).map((part, i) => {
        if (part.startsWith(OPEN)) return <mark key={i} className="rounded bg-[#ffe1db] px-1 text-[#a3321f]">{part.slice(1, -1)}</mark>;
        if (/^\[[^\]\n]{2,80}\]$/.test(part)) return <mark key={i} className="rounded bg-[#ffe1db] px-1 text-[#a3321f]">{part}</mark>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function EmailPreview({ contact, subject, body, attachmentName }: {
  contact: Contact; subject: string; body: string; attachmentName?: string | null;
}) {
  const c = withGaps(contact);
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  return (
    <article className="min-w-0 flex-[999_1_460px] overflow-hidden rounded-[14px] bg-[#f4f4f1] text-[#1a1a1a]">
      <div className="flex flex-col gap-2 border-b border-[#e2e2dd] px-6 py-[18px] text-[15px]">
        <div className="flex gap-3"><span className="w-16 flex-none text-[#6b6b66]">To</span><span className="min-w-0 break-all">{name ? `${name} <${contact.email}>` : contact.email}</span></div>
        <div className="flex gap-3"><span className="w-16 flex-none text-[#6b6b66]">Subject</span><span className="font-semibold"><Marked text={render(subject, c) || " "} /></span></div>
      </div>
      <div className="flex flex-col gap-3.5 p-6 text-base leading-[1.7]">
        <p className="m-0 whitespace-pre-wrap"><Marked text={render(body, c)} /></p>
        {attachmentName && (
          <div className="mt-1.5 inline-flex items-center gap-2.5 self-start rounded-[10px] border border-[#ddddd6] bg-white px-3.5 py-2.5 text-sm">
            <span className="mono flex h-[34px] w-7 items-end justify-center rounded bg-[#1a1a1a] pb-1 text-[9px] text-[#f4f4f1]">
              {(attachmentName.split(".").pop() ?? "").toUpperCase().slice(0, 4)}
            </span>
            <span>{attachmentName}</span>
          </div>
        )}
      </div>
    </article>
  );
}
