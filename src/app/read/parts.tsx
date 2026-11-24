"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { PromotePanel } from "./PromotePanel";
import { WritePanel, type WriteTarget } from "./WritePanel";
import type { ReadItem, ReadKind } from "../../../compiler/src/read.mjs";
import { parseIntent } from "../../../compiler/src/parse.mjs";
import { translateDecisions } from "../../../compiler/src/translate.mjs";
import { HighlightedCode, HighlightedSource } from "@/lib/highlight";
import type { CodeLang } from "@/lib/code-tokens";
import { sourceLines } from "@/lib/source-tokens.mjs";
import { plainFromReading } from "../../../compiler/src/plain-contract.mjs";
import type { PlainModel } from "../../../compiler/src/plain-contract.d.mts";
import { RulePictureStatic } from "@/app/try/RuleVisual";
import { AskIt } from "@/components/AskIt";
import { StepsView, type Step } from "@/app/try/StepsView";

export const KNOW: { key: CodeLang; label: string }[] = [
  { key: "typescript", label: "TypeScript" },
  { key: "python", label: "Python" },
  { key: "go", label: "Go" },
  { key: "rust", label: "Rust" },
  { key: "csharp", label: "C#" },
  { key: "java", label: "Java" },
];

export const LANG_LABEL: Record<string, string> = {
  typescript: "TypeScript", javascript: "JavaScript", python: "Python", go: "Go", rust: "Rust", csharp: "C#", java: "Java", kotlin: "Kotlin", php: "PHP", ruby: "Ruby",
};

/** Filter chips. "route" and "guard" match items that have a route or checks, whatever their kind. */
export type ReadFacet = ReadKind | "route" | "guard";
export const FACETS: { key: ReadFacet; label: string; tone: string }[] = [
  { key: "route", label: "Routes", tone: "border-[#FCD34D]/40 text-[#FCD34D]" },
  { key: "decision", label: "Decisions", tone: "border-[#C4B5FD]/40 text-[#C4B5FD]" },
  { key: "guard", label: "With checks", tone: "border-[#F9A8D4]/40 text-[#F9A8D4]" },
  { key: "function", label: "Other functions", tone: "border-[#67E8F9]/40 text-[#67E8F9]" },
  { key: "error", label: "Errors", tone: "border-red-300/40 text-red-200" },
  { key: "test", label: "Tests", tone: "border-emerald-300/40 text-emerald-200" },
];

export const field =
  "rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-sm text-haze-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300";
export const chip = (on: boolean, tone: string) =>
  `rounded-full border px-3 py-1 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 disabled:opacity-40 ${
    on ? `${tone} bg-white/10` : "border-white/15 text-haze-300 hover:text-haze-100"
  }`;

const KIND_BADGE: Record<ReadKind, { label: string; tone: string }> = {
  decision: { label: "Decision", tone: FACETS[1].tone },
  function: { label: "Function", tone: FACETS[3].tone },
  error: { label: "Error", tone: FACETS[4].tone },
  test: { label: "Test", tone: FACETS[5].tone },
};

/** True when a function reads well as steps (most of its statements recognized). */
export function hasSteps(item: ReadItem): boolean {
  const it = item as ReadItem & { steps?: Step[]; stepsReadable?: number };
  return item.kind === "function" && !!it.steps?.length && (it.stepsReadable ?? 0) >= 0.5;
}

/** True when Thunder can draw this item as a Thunder card. */
export function isDrawable(item: ReadItem): boolean {
  if (item.kind !== "decision") return false;
  try { return !!plainFromReading(item); } catch { return false; }
}

const readable = (n: string) => n.replace(/^(GET|POST|PUT|PATCH|DELETE) /, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\?$/, "").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Every source line a reading item is based on, for highlighting. */
export function linesOf(item: ReadItem): number[] {
  const lines = new Set<number>([item.line]);
  for (const r of item.rules ?? []) lines.add(r.line);
  if (item.otherwise) lines.add(item.otherwise.line);
  for (const g of item.guards ?? []) lines.add(g.line);
  for (const u of item.unread ?? []) lines.add(u.line);
  return [...lines];
}

/** Source with line numbers; highlighted lines scroll into view when they change. */
export function SourceView({ source, highlighted, label, maxHeight = "max-h-[560px]", language = "typescript" }: { source: string; highlighted: Set<number>; label: string; maxHeight?: string; language?: string }) {
  // Editor colors, line by line (a block comment or multi-line string keeps its color across lines).
  const colored = useMemo(() => sourceLines(source, language), [source, language]);
  const refs = useRef(new Map<number, HTMLElement>());
  const first = useMemo(() => Math.min(...highlighted), [highlighted]);
  useEffect(() => {
    if (Number.isFinite(first)) refs.current.get(first)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [first]);
  return (
    <pre aria-label={label} className={`${maxHeight} overflow-auto py-3 font-mono text-[12.5px] leading-6 text-haze-200`}>
      {colored.map((l, i) => (
        <div
          key={i}
          ref={(el) => { if (el) refs.current.set(i + 1, el); else refs.current.delete(i + 1); }}
          className={`flex border-l-2 ${highlighted.has(i + 1) ? "border-gold-300 bg-gold-400/15" : "border-transparent"}`}
        >
          <span className={`w-12 shrink-0 select-none pr-4 text-right ${highlighted.has(i + 1) ? "text-haze-200" : "text-haze-400"}`}>{i + 1}</span>
          <span className="whitespace-pre pr-4">{l.length ? l.map((t, k) => <span key={k} className={t.cls}>{t.text}</span>) : " "}</span>
        </div>
      ))}
    </pre>
  );
}

export function ReadCard({ item, know, selected, onShow, compact = false, write }: { item: ReadItem & { route?: { method: string; path: string } }; know: CodeLang; selected: boolean; onShow: () => void; compact?: boolean; write?: WriteTarget }) {
  const kind = KIND_BADGE[item.kind];
  const rewritten = useMemo(() => {
    if (!item.thunder) return "";
    try {
      return translateDecisions(parseIntent(item.thunder), know).split("\n").slice(2).join("\n");
    } catch {
      return "";
    }
  }, [item.thunder, know]);
  const knowLabel = KNOW.find((k) => k.key === know)?.label ?? know;
  // The picture is the product: a decision Thunder can draw becomes a Thunder card.
  const card = useMemo(() => {
    if (item.kind !== "decision") return null;
    try { return plainFromReading(item) as (PlainModel & { needsReview?: string[]; partial?: boolean }) | null; } catch { return null; }
  }, [item]);
  const stepItem = item as ReadItem & { steps?: Step[]; stepsMore?: number };
  const steps = hasSteps(item) ? stepItem.steps! : null;
  const dashed = !card && !steps;
  const guards = item.guards ?? [];
  const [promoting, setPromoting] = useState(false);
  const [changing, setChanging] = useState(false);
  const canWrite = !!write && item.kind === "decision" && !!item.rules?.length && !!item.otherwise;
  const [asking, setAsking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showUnread, setShowUnread] = useState(false);
  const [hood, setHood] = useState(false);

  return (
    <li className={`rounded-2xl border transition ${compact ? "p-4" : "p-5"} ${dashed ? "border-dashed" : ""} ${selected ? "border-gold-300/60 bg-gold-400/[0.05]" : dashed ? "border-white/20" : "border-white/10 bg-ink-850/40"}`}>
      <button type="button" onClick={onShow} aria-pressed={selected} title="Highlight it in the code"
        className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">
        {card
          ? <><span aria-hidden="true" className="text-[#7FB2FF]">◇</span><span className="min-w-0 text-base font-semibold tok-fn">{card.question}</span></>
          : steps
            ? <span className="min-w-0 text-base font-semibold text-white">What <span className="tok-id">{readable(item.name).toLowerCase()}</span> does</span>
            : <><span aria-hidden="true" className="text-haze-400">▭</span><span className="min-w-0 truncate text-base font-semibold text-white">{readable(item.name)}</span></>}
        {item.route && <span className={`rounded-full border px-2 py-0.5 text-[11px] ${FACETS[0].tone}`}>{item.route.method} {item.route.path}</span>}
        {(item.status === "partial" || card?.partial) && <span className="rounded-full border border-dashed border-white/30 px-2 py-0.5 text-[11px] text-haze-300">partly read</span>}
        <span className="ml-auto shrink-0 font-mono text-xs text-haze-400">{card || item.name !== readable(item.name) ? `${item.name} · ` : ""}line {item.line}</span>
      </button>
      {card ? (
        <div className="mt-4">
          <RulePictureStatic model={card} hideQuestion />
          {asking && !compact && <div className="mt-4 border-t border-white/10 pt-4"><AskIt model={card} /></div>}
        </div>
      ) : steps ? (
        <div className="mt-3"><StepsView steps={steps} more={stepItem.stepsMore ?? 0} /></div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-haze-300">Thunder can&apos;t draw this yet. {guards.length ? item.says.replace(/ It checks \d+ conditions? first:.*$/, "").replace(/ Its body does more than choose between fixed answers, so no rules are shown\./, "") : ""}</p>
      )}

      {guards.length > 0 && !steps && (
        <div className="mt-3">
          <p className="text-xs font-medium text-haze-400">It checks first</p>
          <ul className="mt-1 space-y-1 text-sm text-haze-200">
            {guards.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-[#F9A8D4]">•</span>
                <span>
                  {g.says}
                  {!g.readable && <span className="text-haze-400"> (condition shown as written)</span>}
                  <span className="text-haze-500"> Line {g.line}.</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}


      {!compact && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-sm">
          {card && <button type="button" aria-expanded={asking} onClick={() => setAsking((v) => !v)} className={`rounded-lg border px-3 py-1.5 font-medium ${asking ? "border-gold-300/60 text-white" : "border-white/20 text-haze-100 hover:bg-white/10"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300`}>{asking ? "Hide Ask it" : "Ask it"}</button>}
          {canWrite && <button type="button" aria-expanded={changing} onClick={() => setChanging((v) => !v)} className={`rounded-lg border px-3 py-1.5 font-medium ${changing ? "border-gold-300/60 text-white" : "border-white/20 text-haze-100 hover:bg-white/10"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300`}>{changing ? "Hide Change a rule" : "Change a rule"}</button>}
          {item.kind === "decision" && <button type="button" aria-expanded={promoting} onClick={() => setPromoting((v) => !v)} className="rounded-lg px-3 py-1.5 text-haze-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">{promoting ? "Hide the contract" : "Turn into a contract"}</button>}
          {!!card?.needsReview?.length && <button type="button" aria-expanded={reviewing} onClick={() => setReviewing((v) => !v)} className="rounded-lg px-3 py-1.5 text-haze-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">{card.needsReview.length} to confirm</button>}
          {!!item.unread?.length && <button type="button" aria-expanded={showUnread} onClick={() => setShowUnread((v) => !v)} className="rounded-lg px-3 py-1.5 text-haze-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">{item.unread.length} line{item.unread.length === 1 ? "" : "s"} not read</button>}
          {item.thunder && <button type="button" aria-expanded={hood} onClick={() => setHood((v) => !v)} className="ml-auto rounded-lg px-3 py-1.5 text-haze-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">Under the hood</button>}
        </div>
      )}
      {reviewing && !!card?.needsReview?.length && (
        <ul className="mt-3 space-y-1 rounded-lg border border-dashed border-white/20 p-3 text-sm text-haze-300">{card.needsReview.map((n) => <li key={n}>• {n}</li>)}</ul>
      )}
      {showUnread && !!item.unread?.length && (
        <ul className="mt-3 space-y-1 rounded-lg border border-dashed border-white/20 p-3 text-sm">
          {item.unread.map((u, i) => <li key={i} className="text-haze-300"><span className="text-haze-400">Line {u.line}:</span> <code className="font-mono text-haze-200">{u.text}</code> {u.reason}</li>)}
        </ul>
      )}
      {changing && canWrite && write && <WritePanel item={item} target={write} />}
      {promoting && <div className="mt-3"><PromotePanel item={item} file={(item as ReadItem & { file?: string }).file} /></div>}
      {hood && item.thunder && (
        <div className="mt-3 space-y-3">
          {item.rules && item.otherwise && (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Rules for {item.name}, checked top to bottom</caption>
              <tbody className="divide-y divide-white/5">
                {item.rules.map((r, i) => <tr key={i}><td className="py-1.5 pr-4 text-haze-300">{i ? "Otherwise, if " : "If "}{r.says}</td><td className="py-1.5 font-medium text-[#67E8F9]">{r.result}</td></tr>)}
                <tr><td className="py-1.5 pr-4 text-haze-300">Otherwise</td><td className="py-1.5 font-medium text-[#67E8F9]">{item.otherwise.result}</td></tr>
              </tbody>
            </table>
          )}
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="min-w-0"><p className="mb-1 text-xs font-medium text-haze-400">Thunder source</p><pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-haze-200"><HighlightedSource source={item.thunder} /></pre></div>
            {rewritten && <div className="min-w-0"><p className="mb-1 text-xs font-medium text-haze-400">In {knowLabel}</p><pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-haze-200"><HighlightedCode source={rewritten} lang={know} /></pre></div>}
          </div>
        </div>
      )}
      {compact && !!item.unread?.length && (
        <p className="mt-3 text-xs text-haze-400">{item.unread.length} line{item.unread.length === 1 ? "" : "s"} not read as rules.</p>
      )}
    </li>
  );
}
