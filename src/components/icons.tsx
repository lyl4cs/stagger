// Small stroke icons from the design, 16x16 grid.
type P = { size?: number; className?: string };
const S = ({ size = 16, className, children, fill = "none", sw = 1.7 }: P & { children: React.ReactNode; fill?: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke={fill === "none" ? "currentColor" : undefined}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{children}</svg>
);
export const Check = (p: P) => <S {...p} sw={2}><path d="m3 8.5 3 3 7-7" /></S>;
export const Clock = (p: P) => <S {...p}><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" /></S>;
export const Pause = (p: P) => <S {...p} fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1.2" /><rect x="9.5" y="2" width="3.5" height="12" rx="1.2" /></S>;
export const Plus = (p: P) => <S {...p} sw={1.8}><path d="M8 3v10M3 8h10" /></S>;
export const Minus = (p: P) => <S {...p} sw={1.8}><path d="M3 8h10" /></S>;
export const ArrowLeft = (p: P) => <S {...p} sw={1.6}><path d="M13 8H3M7 4 3 8l4 4" /></S>;
export const ArrowRight = (p: P) => <S {...p} sw={1.6}><path d="M3 8h10M9 4l4 4-4 4" /></S>;
export const ChevL = (p: P) => <S {...p}><path d="M10 3 5 8l5 5" /></S>;
export const ChevR = (p: P) => <S {...p}><path d="m6 3 5 5-5 5" /></S>;
export const Reply = (p: P) => <S {...p} sw={1.6}><path d="M6 4 2 8l4 4M2 8h7a5 5 0 0 1 5 5" /></S>;
export const Lock = (p: P) => <S {...p} sw={1.5}><rect x="3" y="7" width="10" height="7" rx="2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></S>;
export const Clip = (p: P) => <S {...p} sw={1.5}><path d="M10.5 4.5 5.8 9.2a1.6 1.6 0 0 0 2.3 2.3l5-5a3 3 0 0 0-4.3-4.3l-5 5a4.4 4.4 0 0 0 6.2 6.2l4-4" /></S>;
export const X = (p: P) => <S {...p} sw={1.8}><path d="m4 4 8 8M12 4l-8 8" /></S>;
export const Alert = (p: P) => <S {...p} sw={1.6}><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5v4.2M8 11.2v.1" /></S>;
export const Pencil = (p: P) => <S {...p} sw={1.5}><path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z" /></S>;
export const Trash = (p: P) => <S {...p} sw={1.5}><path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4.5" /></S>;
