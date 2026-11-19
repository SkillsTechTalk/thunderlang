"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { PromotePanel } from "./PromotePanel";
import type { ReadItem, ReadKind } from "../../../compiler/src/read.mjs";
import { parseIntent } from "../../../compiler/src/parse.mjs";
import { translateDecisions } from "../../../compiler/src/translate.mjs";
import { HighlightedCode, HighlightedSource } from "@/lib/highlight";
import type { CodeLang } from "@/lib/code-tokens";

export const KNOW: { key: CodeLang; label: string }[] = [
  { key: "typescript", label: "TypeScript" },
  { key: "python", label: "Python" },
  { key: "go", label: "Go" },
  { key: "rust", label: "Rust" },
  { key: "csharp", label: "C#" },
  { key: "java", label: "Java" },
];

export const LANG_LABEL: Record<string, string> = {
  typescript: "TypeScript", javascript: "JavaScript", python: "Python", go: "Go", rust: "Rust", csharp: "C#", java: "Java",
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
export function SourceView({ source, highlighted, label, maxHeight = "max-h-[560px]" }: { source: string; highlighted: Set<number>; label: string; maxHeight?: string }) {
  const refs = useRef(new Map<number, HTMLElement>());
  const first = useMemo(() => Math.min(...highlighted), [highlighted]);
  useEffect(() => {
    if (Number.isFinite(first)) refs.current.get(first)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [first]);
  return (
    <pre aria-label={label} className={`${maxHeight} overflow-auto py-3 font-mono text-[12.5px] leading-6 text-haze-300`}>
      {source.split("\n").map((l, i) => (
        <div
          key={i}
          ref={(el) => { if (el) refs.current.set(i + 1, el); else refs.current.delete(i + 1); }}
          className={`flex ${highlighted.has(i + 1) ? "bg-gold-400/15 text-white" : ""}`}
        >
          <span className="w-12 shrink-0 select-none pr-4 text-right text-haze-500">{i + 1}</span>
          <span className="whitespace-pre pr-4">{l || " "}</span>
        </div>
      ))}
    </pre>
  );
}

export function ReadCard({ item, know, selected, onShow, compact = false }: { item: ReadItem & { route?: { method: string; path: string } }; know: CodeLang; selected: boolean; onShow: () => void; compact?: boolean }) {
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
  const guards = item.guards ?? [];
  const [promoting, setPromoting] = useState(false);

  return (
    <li className={`rounded-2xl border transition ${compact ? "p-4" : "p-5"} ${selected ? "border-gold-300/60 bg-gold-400/[0.05]" : "border-white/10 bg-ink-850/40"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {item.route ? (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FACETS[0].tone}`}>Route</span>
        ) : (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${kind.tone}`}>{kind.label}</span>
        )}
        <h3 className="min-w-0 break-all font-mono text-base font-semibold text-white">{item.name}</h3>
        {item.status === "partial" && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-xs text-amber-200">Partly read</span>}
        <button
          type="button"
          onClick={onShow}
          aria-pressed={selected}
          className="ml-auto rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-haze-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
        >
          {selected ? `Showing line ${item.line}` : `Show line ${item.line} in the code`}
        </button>
      </div>
      <p className="mt-3 leading-relaxed text-haze-100">{guards.length ? item.says.replace(/ It checks \d+ conditions? first:.*$/, "") : item.says}</p>

      {guards.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#F9A8D4]">Checks first</p>
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

      {item.rules && item.otherwise && (
        <table className="mt-4 w-full text-left text-sm">
          <caption className="sr-only">Rules for {item.name}, checked top to bottom</caption>
          <thead className="text-xs uppercase tracking-wide text-haze-400">
            <tr><th scope="col" className="pb-2 pr-4 font-medium">When</th><th scope="col" className="pb-2 font-medium">The answer is</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {item.rules.map((r, i) => (
              <tr key={i}>
                <td className="py-2 pr-4 text-haze-200">{i ? "Otherwise, if " : "If "}{r.says}</td>
                <td className="py-2 font-medium text-[#67E8F9]">{r.result}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-4 text-haze-200">Otherwise</td>
              <td className="py-2 font-medium text-[#67E8F9]">{item.otherwise.result}</td>
            </tr>
          </tbody>
        </table>
      )}

      {item.thunder && (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium text-haze-400">In ThunderLang</p>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-haze-200"><HighlightedSource source={item.thunder} /></pre>
          </div>
          {rewritten && (
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-haze-400">In {knowLabel}, a language you know</p>
              <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-haze-200"><HighlightedCode source={rewritten} lang={know} /></pre>
            </div>
          )}
        </div>
      )}

      {item.kind === "decision" && (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={promoting}
            onClick={() => setPromoting((v) => !v)}
            className="rounded-lg border border-gold-300/50 px-3 py-2 text-sm font-semibold text-gold-200 hover:bg-gold-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
          >
            {promoting ? "Hide the contract" : "Turn into a contract"}
          </button>
          {promoting && <PromotePanel item={item} file={(item as ReadItem & { file?: string }).file} />}
        </div>
      )}

      {!compact && !!item.unread?.length && (
        <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Not read</p>
          <ul className="mt-1 space-y-1 text-sm">
            {item.unread.map((u, i) => (
              <li key={i} className="text-haze-300">
                <span className="text-haze-400">Line {u.line}:</span> <code className="font-mono text-haze-200">{u.text}</code> {u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {compact && !!item.unread?.length && (
        <p className="mt-3 text-xs text-haze-400">{item.unread.length} line{item.unread.length === 1 ? "" : "s"} not read as rules.</p>
      )}
    </li>
  );
}
