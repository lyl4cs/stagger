"use client";
import { useRef } from "react";
import { PLACEHOLDERS } from "@/lib/template";

// Friendly names for the insert buttons. The text inserted is still the {{Placeholder}}.
const CHIP_LABELS: Record<string, string> = {
  FirstName: "First name",
  LastName: "Last name",
  Title: "Job title",
  Company: "Company",
  Location: "City",
  CustomLine: "Custom line",
};

const SPLIT_RE = /(\{\{\s*\w+\s*\}\}|\[[^\]\n]{2,80}\])/g;

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(SPLIT_RE).map((part, i) => {
        if (!part) return null;
        if (part.startsWith("{{")) {
          const known = PLACEHOLDERS[part.replace(/[{}\s]/g, "")];
          return <span key={i} className={known ? "tok" : "brkt"}>{part}</span>;
        }
        if (/^\[[^\]\n]{2,80}\]$/.test(part)) return <span key={i} className="brkt">{part}</span>;
        return <span key={i}>{part}</span>;
      })}
      {/* Trailing newline keeps the layer as tall as the textarea when the text ends in a line break. */}
      {"\n"}
    </>
  );
}

export function TemplateEditor({ value, onChange, onCommit, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void; // save to the database
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    onCommit(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[15px] text-muted">Personalize</span>
        {Object.keys(PLACEHOLDERS).filter((k) => k !== "Email").map((k) => (
          <button key={k} type="button" className="chip" disabled={disabled} title={`Inserts {{${k}}}`} onClick={() => insert(`{{${k}}}`)}>
            <span aria-hidden className="chip-plus">+</span>{CHIP_LABELS[k] ?? k}
          </button>
        ))}
      </div>
      <div className="hl-wrap">
        <pre className="hl-layer" aria-hidden="true"><Highlighted text={value} /></pre>
        <textarea
          ref={ref}
          aria-label="Email body"
          className="hl-input"
          value={value}
          disabled={disabled}
          spellCheck
          placeholder={"Hi {{FirstName}},\n\n..."}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
        />
      </div>
    </div>
  );
}
