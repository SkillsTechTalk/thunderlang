"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { readCode, searchReading, type ReadItem, type ReadKind, type Reading } from "../../../compiler/src/read.mjs";
import { parseIntent } from "../../../compiler/src/parse.mjs";
import { translateDecisions } from "../../../compiler/src/translate.mjs";
import { READ_SAMPLES } from "./samples.mjs";
import { HighlightedCode, HighlightedSource } from "@/lib/highlight";
import type { CodeLang } from "@/lib/code-tokens";

const LANGS: { key: string; label: string }[] = [
  { key: "auto", label: "Detect automatically" },
  { key: "typescript", label: "TypeScript" },
  { key: "javascript", label: "JavaScript" },
  { key: "python", label: "Python" },
  { key: "go", label: "Go" },
  { key: "rust", label: "Rust" },
  { key: "csharp", label: "C#" },
  { key: "java", label: "Java" },
];
const KNOW: { key: CodeLang; label: string }[] = [
  { key: "typescript", label: "TypeScript" },
  { key: "python", label: "Python" },
  { key: "go", label: "Go" },
  { key: "rust", label: "Rust" },
  { key: "csharp", label: "C#" },
  { key: "java", label: "Java" },
];
const KINDS: { key: ReadKind; label: string; tone: string }[] = [
  { key: "decision", label: "Decisions", tone: "border-[#C4B5FD]/40 text-[#C4B5FD]" },
  { key: "function", label: "Other functions", tone: "border-[#67E8F9]/40 text-[#67E8F9]" },
  { key: "error", label: "Errors", tone: "border-red-300/40 text-red-200" },
  { key: "test", label: "Tests", tone: "border-emerald-300/40 text-emerald-200" },
];
const KNOW_KEY = "thunderlang-read-language";
const field = "rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-sm text-haze-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300";
const labelOf = (key: string) => LANGS.find((l) => l.key === key)?.label ?? key;

function linesOf(item: ReadItem): number[] {
  const lines = new Set<number>([item.line]);
  for (const r of item.rules ?? []) lines.add(r.line);
  if (item.otherwise) lines.add(item.otherwise.line);
  for (const u of item.unread ?? []) lines.add(u.line);
  return [...lines];
}

export function ReadClient() {
  const [sample, setSample] = useState(READ_SAMPLES[0].key);
  const [source, setSource] = useState(READ_SAMPLES[0].source);
  const [file, setFile] = useState(READ_SAMPLES[0].file);
  const [language, setLanguage] = useState("auto");
  const [know, setKnow] = useState<CodeLang>("python");
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<ReadKind[]>([]);
  const [partialOnly, setPartialOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const lineRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KNOW_KEY) as CodeLang | null;
      if (saved && KNOW.some((k) => k.key === saved)) setKnow(saved);
    } catch {}
  }, []);
  function chooseKnow(next: CodeLang) {
    setKnow(next);
    try { localStorage.setItem(KNOW_KEY, next); } catch {}
  }

  const { reading, error } = useMemo((): { reading: Reading | null; error: string } => {
    if (!source.trim()) return { reading: null, error: "" };
    try {
      return { reading: readCode(source, { language: language === "auto" ? undefined : language, file: language === "auto" ? file : "" }), error: "" };
    } catch (e) {
      return { reading: null, error: e instanceof Error ? e.message : "This code could not be read." };
    }
  }, [source, language, file]);

  const items = useMemo(
    () => (reading ? searchReading(reading, { query, kinds, status: partialOnly ? ["partial", "signature-only"] : [] }) : []),
    [reading, query, kinds, partialOnly],
  );
  const highlighted = useMemo(() => {
    const it = reading?.items.find((i) => i.id === selected);
    return new Set(it ? linesOf(it) : []);
  }, [reading, selected]);

  function pickSample(key: string) {
    const s = READ_SAMPLES.find((x) => x.key === key)!;
    setSample(key);
    setSource(s.source);
    setFile(s.file);
    setLanguage("auto");
    setQuery("");
    setKinds([]);
    setPartialOnly(false);
    setSelected(null);
  }
  function showInCode(item: ReadItem) {
    setEditing(false);
    setSelected(item.id);
    requestAnimationFrame(() => lineRefs.current.get(item.line)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  const toggleKind = (k: ReadKind) => setKinds((all) => (all.includes(k) ? all.filter((x) => x !== k) : [...all, k]));
  const filtersOn = !!query || kinds.length > 0 || partialOnly;

  return (
    <div className="space-y-8">
      {/* 1. The code. */}
      <section aria-labelledby="read-input" className="space-y-4">
        <h2 id="read-input" className="text-xl font-semibold text-white">1. Paste code, or start from a sample</h2>
        <div role="group" aria-label="Samples" className="flex flex-wrap gap-2">
          {READ_SAMPLES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sample === s.key}
              onClick={() => pickSample(s.key)}
              className={`rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${
                sample === s.key ? "border-gold-300/60 bg-gold-400/10 text-white" : "border-white/15 text-haze-300 hover:text-haze-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm text-haze-300">
              Code language
              <select className={field} value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-haze-300">
              A language you know
              <select className={field} value={know} onChange={(e) => chooseKnow(e.target.value as CodeLang)}>
                {KNOW.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </label>
          </div>
          {reading && (
            <p className="text-sm text-haze-400">
              Reading as <span className="font-medium text-haze-100">{labelOf(reading.language)}</span>
              {reading.detected ? " (detected)" : ""}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* Source, with the lines behind the selected reading highlighted. */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-white/15 bg-ink-900/80">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
              {editing ? (
                <label htmlFor="read-source" className="text-sm font-medium text-haze-100">Edit the code</label>
              ) : (
                <span className="text-sm font-medium text-haze-100">The code</span>
              )}
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-haze-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
              >
                {editing ? "Done editing" : "Edit or paste code"}
              </button>
            </div>
            {editing ? (
              <textarea
                id="read-source"
                value={source}
                onChange={(e) => { setSource(e.target.value); setSample(""); setFile(""); setSelected(null); }}
                spellCheck={false}
                wrap="off"
                rows={22}
                autoFocus
                aria-describedby="read-summary"
                className="block max-h-[560px] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 text-haze-200 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-gold-300"
                style={{ colorScheme: "dark" }}
              />
            ) : (
              <pre aria-label="Code with line numbers" className="max-h-[560px] overflow-auto py-3 font-mono text-[12.5px] leading-6 text-haze-300">
                {source.split("\n").map((l, i) => (
                  <div
                    key={i}
                    ref={(el) => { if (el) lineRefs.current.set(i + 1, el); else lineRefs.current.delete(i + 1); }}
                    className={`flex ${highlighted.has(i + 1) ? "bg-gold-400/15 text-white" : ""}`}
                  >
                    <span className="w-12 shrink-0 select-none pr-4 text-right text-haze-500">{i + 1}</span>
                    <span className="whitespace-pre pr-4">{l || " "}</span>
                  </div>
                ))}
              </pre>
            )}
            {highlighted.size > 0 && !editing && (
              <p className="border-t border-white/10 px-4 py-2 text-xs text-haze-400">Highlighted: the lines behind your selection.</p>
            )}
          </div>
        </div>

        {/* 2. The reading. */}
        <section aria-labelledby="read-output" className="min-w-0 space-y-4">
          <h2 id="read-output" className="text-xl font-semibold text-white">2. Read what it decides</h2>
          {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          {!error && !reading && <p className="text-haze-300">Paste some code to read it.</p>}
          {reading && (
            <>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm text-haze-300">
                  Search names, inputs, conditions, and answers
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="for example: enterprise, amount, Decline"
                    className={field}
                  />
                </label>
                <div role="group" aria-label="Show only" className="flex flex-wrap items-center gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      aria-pressed={kinds.includes(k.key)}
                      onClick={() => toggleKind(k.key)}
                      disabled={!reading.counts[k.key]}
                      className={`rounded-full border px-3 py-1 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 disabled:opacity-40 ${
                        kinds.includes(k.key) ? `${k.tone} bg-white/10` : "border-white/15 text-haze-300 hover:text-haze-100"
                      }`}
                    >
                      {k.label} <span className="text-haze-400">{reading.counts[k.key]}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={partialOnly}
                    onClick={() => setPartialOnly((v) => !v)}
                    className={`rounded-full border px-3 py-1 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${
                      partialOnly ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/15 text-haze-300 hover:text-haze-100"
                    }`}
                  >
                    Needs a closer look
                  </button>
                  {filtersOn && (
                    <button type="button" onClick={() => { setQuery(""); setKinds([]); setPartialOnly(false); }} className="text-sm font-medium text-gold-300 hover:text-gold-200">
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
              <p id="read-summary" role="status" aria-live="polite" className="text-sm text-haze-300">
                {items.length === reading.items.length
                  ? `${reading.counts.decision} decision${reading.counts.decision === 1 ? "" : "s"}, ${reading.counts.function} other function${reading.counts.function === 1 ? "" : "s"}, ${reading.counts.error} error${reading.counts.error === 1 ? "" : "s"}, ${reading.counts.test} test${reading.counts.test === 1 ? "" : "s"}.`
                  : `Showing ${items.length} of ${reading.items.length}.`}{" "}
                {items.length === 0 && "Nothing matches. Try fewer words or clear the filters."}
              </p>
              <ul className="space-y-4">
                {items.map((it) => (
                  <ReadCard key={it.id} item={it} know={know} selected={selected === it.id} onShow={() => showInCode(it)} />
                ))}
              </ul>
              <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-haze-400">
                Inferred from the code by pattern, not by running it, and with no AI. A reading shows what the code appears to
                decide, not what it was meant to decide. Anything it could not read is listed under &ldquo;Not read&rdquo;
                instead of being guessed.
              </p>
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="read-more" className="border-t border-white/10 pt-8">
        <h2 id="read-more" className="text-xl font-semibold text-white">Read a whole repository</h2>
        <p className="mt-2 max-w-2xl text-haze-300">
          The same reader runs in your terminal and inside AI coding agents. Search and filter with the same words:
        </p>
        <pre className="mt-4 max-w-2xl overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-6 text-haze-200">
          thunder read src/billing.go --search refund --in python{"\n"}
          thunder read LoanPolicy.java --kind decision --json
        </pre>
        <p className="mt-3 text-sm text-haze-400">
          In Claude Code, Codex, or ChatGPT, the <code className="font-mono text-haze-200">intent_read</code> tool does the same.{" "}
          <Link href="/docs/mcp" className="font-medium text-gold-300 hover:text-gold-200">Connect your agent →</Link>
        </p>
      </section>
    </div>
  );
}

function ReadCard({ item, know, selected, onShow }: { item: ReadItem; know: CodeLang; selected: boolean; onShow: () => void }) {
  const kind = KINDS.find((k) => k.key === item.kind)!;
  const rewritten = useMemo(() => {
    if (!item.thunder) return "";
    try {
      return translateDecisions(parseIntent(item.thunder), know).split("\n").slice(2).join("\n");
    } catch {
      return "";
    }
  }, [item.thunder, know]);
  const knowLabel = KNOW.find((k) => k.key === know)?.label ?? know;

  return (
    <li className={`rounded-2xl border p-5 transition ${selected ? "border-gold-300/60 bg-gold-400/[0.05]" : "border-white/10 bg-ink-850/40"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${kind.tone}`}>{kind.label.replace(/s$/, "").replace("Other function", "Function")}</span>
        <h3 className="font-mono text-base font-semibold text-white">{item.name}</h3>
        {item.status === "partial" && <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-xs text-amber-200">Partly read</span>}
        <button type="button" onClick={onShow} aria-pressed={selected} className="ml-auto rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-haze-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">
          {selected ? `Showing line ${item.line}` : `Show line ${item.line} in the code`}
        </button>
      </div>
      <p className="mt-3 leading-relaxed text-haze-100">{item.says}</p>

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

      {!!item.unread?.length && (
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
    </li>
  );
}
