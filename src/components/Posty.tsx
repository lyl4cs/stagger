// Posty, the envelope mascot. Moods match the design file.
type Mood = "idle" | "empty" | "sending" | "stand";

export function Posty({ mood = "idle", width = 80, ink = "#0E0E0E", className, style }: {
  mood?: Mood; width?: number; ink?: string; className?: string; style?: React.CSSProperties;
}) {
  const eyes = {
    idle: <><rect x="43" y="58" width="9" height="17" rx="4.5" fill={ink} /><rect x="68" y="58" width="9" height="17" rx="4.5" fill={ink} /></>,
    stand: <><rect x="43" y="56" width="9" height="20" rx="4.5" fill={ink} /><rect x="68" y="56" width="9" height="20" rx="4.5" fill={ink} /></>,
    empty: <path d="M40 66 q6 6 12 0 M68 66 q6 6 12 0" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />,
    sending: <path d="M41 70 l6 -6 l6 6 M67 70 l6 -6 l6 6" fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />,
  }[mood];
  const body = (
    <svg width={width} height={width * 0.8} viewBox="0 0 120 96" aria-hidden="true" className={className} style={style}>
      <rect x="6" y="10" width="108" height="78" rx="24" fill="#F2F2F0" />
      <path d="M24 26 L60 50 L96 26" fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {eyes}
    </svg>
  );
  if (mood !== "sending") return body;
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={width * 0.3} height={width * 0.375} viewBox="0 0 30 36" aria-hidden="true">
        <path d="M4 10h16M10 18h18M2 26h14" stroke="#5C5C5C" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {body}
    </span>
  );
}
