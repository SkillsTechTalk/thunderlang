// The Steps card: any function, read as plain steps. Decisions become rules (the rule picture);
// everything else becomes steps. Shape and color say the kind of step; words say what it does.
export type Step = { kind: string; says: string; code?: string; line?: number; children?: Step[] };

const MARK: Record<string, { mark: string; cls: string; label: string }> = {
  check: { mark: "✓", cls: "text-[#F472B6] border-[#F472B6]/40", label: "Check" },
  branch: { mark: "◇", cls: "text-[#7FB2FF] border-[#7FB2FF]/40", label: "If" },
  loop: { mark: "↻", cls: "text-[#C4B5FD] border-[#C4B5FD]/40", label: "Repeat" },
  set: { mark: "=", cls: "text-[#FCD34D] border-[#FCD34D]/40", label: "Set" },
  call: { mark: "→", cls: "text-[#67E8F9] border-[#67E8F9]/40", label: "Call" },
  return: { mark: "⇥", cls: "text-[#67E8F9] border-[#67E8F9]/40", label: "Return" },
  fail: { mark: "✕", cls: "text-[#FDBA74] border-[#FDBA74]/40", label: "Fail" },
  try: { mark: "⛉", cls: "text-[#C4B5FD] border-[#C4B5FD]/40", label: "Try" },
  other: { mark: "·", cls: "text-haze-400 border-dashed border-white/25", label: "Not read" },
};

function StepRow({ s, onLine }: { s: Step; onLine?: (line: number) => void }) {
  const m = MARK[s.kind] ?? MARK.other;
  const body = s.kind === "other"
    ? <code className="font-mono text-[12.5px] text-haze-300">{s.code ?? s.says}</code>
    : <span className="text-haze-100">{s.says}</span>;
  return (
    <li>
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-semibold ${m.cls}`}>{m.mark}</span>
        <span className="sr-only">{m.label}: </span>
        {onLine && s.line ? <button type="button" onClick={() => onLine(s.line!)} className="text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">{body}</button> : body}
      </div>
      {!!s.children?.length && (
        <ul className="ml-[9px] mt-1.5 space-y-1.5 border-l border-white/12 pl-4">{s.children.map((c, i) => <StepRow key={i} s={c} onLine={onLine} />)}</ul>
      )}
    </li>
  );
}

export function StepsView({ steps, more = 0, onLine }: { steps: Step[]; more?: number; onLine?: (line: number) => void }) {
  return (
    <div>
      <ol className="space-y-2 text-[15px]">{steps.map((s, i) => <StepRow key={i} s={s} onLine={onLine} />)}</ol>
      {more > 0 && <p className="mt-2 text-xs text-haze-400">+{more} more step{more === 1 ? "" : "s"} in the code.</p>}
    </div>
  );
}
