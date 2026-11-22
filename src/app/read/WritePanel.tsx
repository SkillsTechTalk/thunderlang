"use client";

import { useMemo, useState } from "react";
import type { ReadItem } from "../../../compiler/src/read.mjs";
import { writeRule, ruleParts, joinRuleParts, COMPARISON_CHOICES, type RulePart, type WriteChange } from "../../../compiler/src/write.mjs";

export type WriteTarget = {
  source: string;
  language: string;
  file?: string;
  /** Replace the code on the page. Returns nothing; the page shows the change and offers Undo. */
  apply: (next: string, info: { lines: number[]; summary: string }) => void;
  undo: (() => void) | null;
  download: () => void;
};

type Draft = { kind: RulePart["kind"]; value: string; words?: string };
const toDraft = (parts: RulePart[]): Draft[] => parts.map((p) => ({ kind: p.kind, value: String(p.value), words: "words" in p ? p.words : undefined }));
const control = "rounded-md border border-white/20 bg-ink-900 px-2 py-1 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300";
const OTHER = "__other__";

/** Thunder write on the page: change one rule's number, comparison, text, or answer; see the exact code change first. */
export function WritePanel({ item, target }: { item: ReadItem; target: WriteTarget }) {
  const rules = item.rules ?? [];
  const answers = useMemo(() => [...new Set([...rules.map((r) => r.result), item.otherwise?.result].filter(Boolean) as string[])], [rules, item.otherwise]);
  const [pick, setPick] = useState<number | "otherwise" | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [answer, setAnswer] = useState("");
  const [otherAnswer, setOtherAnswer] = useState("");
  const [applied, setApplied] = useState<string | null>(null);

  function choose(i: number | "otherwise") {
    setPick(i);
    setApplied(null);
    setDraft(i === "otherwise" ? [] : toDraft(ruleParts(rules[i].when)));
    setAnswer(i === "otherwise" ? item.otherwise!.result : rules[i].result);
    setOtherAnswer("");
  }
  const original = useMemo(() => (pick == null ? null : pick === "otherwise" ? { when: null, result: item.otherwise!.result } : rules[pick]), [pick, item.otherwise, rules]);
  const badNumber = draft.some((d) => d.kind === "number" && (d.value.trim() === "" || !Number.isFinite(Number(d.value))));
  const newAnswer = answer === OTHER ? otherAnswer.trim() : answer;
  const when = pick == null || pick === "otherwise" || badNumber ? null : joinRuleParts(draft.map((d) => (d.kind === "number" ? { kind: "number", value: Number(d.value) } : { kind: d.kind, value: d.value }) as RulePart));
  const result = useMemo(() => {
    if (pick == null || !original || badNumber || (answer === OTHER && !newAnswer)) return null;
    const changedWhen = when != null && original.when != null && when !== joinRuleParts(ruleParts(original.when)) ? when : null;
    const changedAnswer = newAnswer && newAnswer !== original.result ? newAnswer : null;
    if (!changedWhen && !changedAnswer) return null;
    return writeRule({ source: target.source, language: target.language, file: target.file, decision: item.name, line: item.line, rule: pick === "otherwise" ? "otherwise" : pick + 1, when: changedWhen, answer: changedAnswer });
  }, [pick, original, badNumber, when, answer, newAnswer, target.source, target.language, target.file, item.name, item.line]);

  const sourceLines = target.source.split("\n");
  function apply() {
    if (!result?.ok) return;
    const lines = [...new Set(result.change.map((c: WriteChange) => c.line))];
    const summary = `${result.after}. Line ${lines.join(", ")} changed.`;
    target.apply(result.source, { lines, summary });
    setApplied(summary);
    setPick(null);
  }
  const id = `write-${item.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-gold-300/25 bg-gold-400/[0.04] p-4">
      <p className="text-sm text-haze-200">
        Pick a rule, then change a number, a comparison, a text value, or the answer. You see the exact code change and which
        answers move <strong className="text-white">before</strong> anything changes. Only those characters in the code change.
      </p>

      {applied && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300/30 bg-emerald-300/[0.06] p-3 text-sm text-emerald-100">
          <span>Applied to the code on this page. {applied}</span>
          <span className="ml-auto flex gap-2">
            {target.undo && <button type="button" onClick={() => { target.undo?.(); setApplied(null); }} className="rounded-md border border-white/20 px-2.5 py-1 font-medium text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">Undo</button>}
            <button type="button" onClick={target.download} className="rounded-md border border-white/20 px-2.5 py-1 font-medium text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">Download the changed file</button>
          </span>
        </div>
      )}

      <ol className="space-y-2" aria-label="Rules, checked top to bottom">
        {[...rules.map((r, i) => ({ key: i as number | "otherwise", label: `${i ? "Otherwise, if" : "If"} ${r.says}`, result: r.result, line: r.line })),
          ...(item.otherwise ? [{ key: "otherwise" as const, label: "Otherwise", result: item.otherwise.result, line: item.otherwise.line }] : [])].map((row) => (
          <li key={String(row.key)}>
            <button type="button" aria-pressed={pick === row.key} onClick={() => choose(row.key)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${pick === row.key ? "border-gold-300/60 bg-white/[0.06] text-white" : "border-white/12 text-haze-200 hover:border-white/30"}`}>
              <span className="min-w-0 flex-1">{row.label} <span aria-hidden="true">→</span> <span className="font-medium text-[#67E8F9]">{row.result}</span></span>
              <span className="shrink-0 text-xs text-haze-400">line {row.line}</span>
              <span className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 text-xs font-medium text-haze-100">{pick === row.key ? "Changing" : "Change"}</span>
            </button>
          </li>
        ))}
      </ol>

      {pick != null && original && (
        <div className="space-y-4 rounded-lg border border-white/12 bg-black/20 p-3">
          <fieldset>
            <legend className="text-xs font-medium text-haze-400">The new rule</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-haze-100">
              <span>{pick === "otherwise" ? "Otherwise" : pick === 0 ? "If" : "Otherwise, if"}</span>
              {draft.map((d, k) => {
                const set = (value: string) => setDraft((ds) => ds.map((x, j) => (j === k ? { ...x, value } : x)));
                if (d.kind === "number") return <input key={k} aria-label="Number" inputMode="decimal" value={d.value} onChange={(e) => set(e.target.value)} aria-invalid={!Number.isFinite(Number(d.value)) || d.value.trim() === ""} className={`${control} w-24 font-mono`} />;
                if (d.kind === "text") return <input key={k} aria-label="Text value" value={d.value} onChange={(e) => set(e.target.value)} className={`${control} w-32 font-mono`} />;
                if (d.kind === "comparison") return (
                  <select key={k} aria-label="Comparison" value={d.value} onChange={(e) => set(e.target.value)} className={control}>
                    {COMPARISON_CHOICES.map((c) => <option key={c.op} value={c.op}>{c.words}</option>)}
                  </select>
                );
                return <span key={k} className="font-medium text-white">{d.words}</span>;
              })}
              <span aria-hidden="true">→</span>
              <label className="sr-only" htmlFor={`${id}-answer`}>Answer</label>
              <select id={`${id}-answer`} value={answer} onChange={(e) => setAnswer(e.target.value)} className={control}>
                {answers.map((a) => <option key={a} value={a}>{a}</option>)}
                <option value={OTHER}>Another answer…</option>
              </select>
              {answer === OTHER && <input aria-label="New answer" placeholder="e.g. Escalate" value={otherAnswer} onChange={(e) => setOtherAnswer(e.target.value)} className={`${control} w-32`} />}
            </div>
            <p className="mt-2 text-xs text-haze-400">Names, “and”, and “or” stay as they are. To change the rule&apos;s shape, propose the change to the code&apos;s owner.</p>
          </fieldset>

          <div id={`${id}-status`} role="status" aria-live="polite" className="space-y-3 text-sm">
            {badNumber ? (
              <p className="text-amber-100">Enter a number to see the change.</p>
            ) : !result ? (
              <p className="text-haze-300">Change a value above to see exactly what changes in the code.</p>
            ) : !result.ok ? (
              <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3 text-amber-100">
                <p className="font-medium">This change can&apos;t be written safely, so nothing will change.</p>
                <ul className="mt-1 space-y-1">{result.problems.map((p: string) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-haze-300">Was: <span className="text-haze-100">{result.before}</span></p>
                  <p className="text-haze-300">Now: <span className="font-medium text-white">{result.after}</span></p>
                </div>
                <div>
                  <p className="text-xs font-medium text-haze-400">The code change (only these characters)</p>
                  <div className="mt-1 overflow-x-auto rounded-md bg-black/40 font-mono text-xs leading-6">
                    {[...new Set(result.change.map((c: WriteChange) => c.line))].map((ln) => (
                      <div key={ln}>
                        <div className="whitespace-pre px-3 text-red-200"><span aria-hidden="true" className="select-none text-haze-500">- {String(ln).padStart(3)} </span><span className="sr-only">Before, line {ln}: </span>{sourceLines[ln - 1]}</div>
                        <div className="whitespace-pre px-3 text-emerald-200"><span aria-hidden="true" className="select-none text-haze-500">+ {String(ln).padStart(3)} </span><span className="sr-only">After, line {ln}: </span>{result.source.split("\n")[ln - 1]}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-haze-400">Checked by reading the code again: this rule reads as shown, and every other rule and function reads exactly as before.</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-haze-400">Answers that change</p>
                  {result.cases.changed.length ? (
                    <ul className="mt-1 space-y-0.5 text-haze-200">
                      {result.cases.changed.slice(0, 6).map((c, k) => (
                        <li key={k}>{Object.entries(c.inputs).map(([n, v]) => `${n} ${typeof v === "string" ? `“${v}”` : String(v)}`).join(", ")}: <span className="text-haze-400">{c.before}</span> → <span className="font-medium text-white">{c.after}</span></li>
                      ))}
                      {result.cases.changed.length > 6 && <li className="text-haze-400">…and {result.cases.changed.length - 6} more.</li>}
                    </ul>
                  ) : <p className="mt-1 text-haze-200">None of the checked inputs get a different answer.</p>}
                  <p className="mt-1 text-xs text-haze-400">{result.cases.note}</p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={apply} disabled={!result?.ok} aria-describedby={`${id}-status`}
              className="rounded-lg bg-gold-300 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-gold-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 disabled:cursor-not-allowed disabled:opacity-40">
              Apply to the code on this page
            </button>
            <button type="button" onClick={() => setPick(null)} className="rounded-lg px-3 py-2 text-sm text-haze-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">Cancel</button>
            {!result?.ok && <span className="text-xs text-haze-400">{result ? "Fix the change above to apply it." : "Change a value to apply it."}</span>}
          </div>
        </div>
      )}
      <p className="text-xs text-haze-400">This changes the copy of the code on this page, not your files. Download it, or use <code className="font-mono text-haze-200">thunder write</code> in your repository.</p>
    </div>
  );
}
