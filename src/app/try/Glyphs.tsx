// The first four shapes of the Thunder visual grammar. Shape says what kind of
// thing it is; words always sit beside it; color is reserved for pass/fail status.
type Props = { className?: string };
const base = "inline-block h-4 w-4 shrink-0 text-haze-300";

/** Contract: a square you can open. */
export const ContractGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><rect x="2" y="2" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
);
/** Decision: a diamond, where a choice happens. */
export const DecisionGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
);
/** Example: a ticket you can run. */
export const ExampleGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><path d="M1.5 4h13v2.5a1.5 1.5 0 0 0 0 3V12h-13V9.5a1.5 1.5 0 0 0 0-3Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M10 4.5v7" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 1.5" /></svg>
);
/** Outcome: a rounded label in the outcome color (cyan), never green or red, so it never reads as pass/fail. */
export const Outcome = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full border border-[#67E8F9]/45 bg-[#67E8F9]/[0.08] px-3 py-0.5 text-sm font-semibold text-[#67E8F9]">{children}</span>
);

// Architecture and integration shapes (same grammar, one level up).
/** Service: an area. */
export const ServiceGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><rect x="1.5" y="3" width="13" height="10" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
);
/** Package or file: a folder. */
export const FolderGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><path d="M1.5 4.5V12.5h13V5.5H8L6.5 3.5h-5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
/** Action: a function that does something. */
export const ActionGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><rect x="2" y="4.5" width="12" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
);
/** External API: a cloud. */
export const CloudGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><path d="M4.5 12.5h7.5a2.75 2.75 0 0 0 .3-5.48A4 4 0 0 0 4.6 6.2 3.1 3.1 0 0 0 4.5 12.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
/** Database or table: a cylinder. */
export const CylinderGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><ellipse cx="8" cy="4" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
);
/** Event or queue: an envelope. */
export const EnvelopeGlyph = ({ className = "" }: Props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}><rect x="1.5" y="3.5" width="13" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m2 4.5 6 4.5 6-4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
