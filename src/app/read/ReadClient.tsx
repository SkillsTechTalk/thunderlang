"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readCode, searchReading, type ReadItem, type Reading } from "../../../compiler/src/read.mjs";
import { READ_SAMPLES } from "./samples.mjs";
import type { CodeLang } from "@/lib/code-tokens";
import { FACETS, KNOW, ReadCard, SourceView, chip, field, linesOf, type ReadFacet } from "./parts";
import { FolderReader } from "./FolderReader";

const LANGS: { key: string; label: string }[] = [
  { key: "auto", label: "Detect automatically" },
  { key: "typescript", label: "TypeScript" },
  { key: "javascript", label: "JavaScript" },
  { key: "python", label: "Python" },
  { key: "go", label: "Go" },
  { key: "rust", label: "Rust" },
  { key: "csharp", label: "C#" },
  { key: "java", label: "Java" },
  { key: "kotlin", label: "Kotlin" },
  { key: "php", label: "PHP" },
  { key: "ruby", label: "Ruby" },
];
const KNOW_KEY = "thunderlang-read-language";
const labelOf = (key: string) => LANGS.find((l) => l.key === key)?.label ?? key;

export function ReadClient() {
  const [mode, setMode] = useState<"file" | "folder">("file");
  const [know, setKnow] = useState<CodeLang>("python");
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
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div role="group" aria-label="What to read" className="inline-flex rounded-xl border border-white/15 p-1">
          {([["file", "One file"], ["folder", "A whole folder"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mode === k}
              onClick={() => setMode(k)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${mode === k ? "bg-white/10 text-white" : "text-haze-300 hover:text-haze-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm text-haze-300">
          A language you know
          <select className={field} value={know} onChange={(e) => chooseKnow(e.target.value as CodeLang)}>
            {KNOW.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </label>
      </div>
      {mode === "file" ? <FileReader know={know} /> : <FolderReader know={know} />}
    </div>
  );
}

function FileReader({ know }: { know: CodeLang }) {
  const [sample, setSample] = useState(READ_SAMPLES[0].key);
  const [source, setSource] = useState(READ_SAMPLES[0].source);
  const [file, setFile] = useState(READ_SAMPLES[0].file);
  const [language, setLanguage] = useState("auto");
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<ReadFacet[]>([]);
  const [partialOnly, setPartialOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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
  }
  const toggleKind = (k: ReadFacet) => setKinds((all) => (all.includes(k) ? all.filter((x) => x !== k) : [...all, k]));
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
          </div>
          {reading && (
            <p className="text-sm text-haze-400">
              Thundered <span className="font-medium text-haze-100">{labelOf(reading.language)}</span>
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
              <SourceView source={source} highlighted={highlighted} label="Code with line numbers" language={reading?.language} />
            )}
            {highlighted.size > 0 && !editing && (
              <p className="border-t border-white/10 px-4 py-2 text-xs text-haze-400">Highlighted: the lines behind your selection.</p>
            )}
          </div>
        </div>

        {/* 2. The reading. */}
        <section aria-labelledby="read-output" className="min-w-0 space-y-4">
          <h2 id="read-output" className="text-xl font-semibold text-white">2. Read it in Thunder</h2>
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
                  {FACETS.map((k) => {
                    const count = k.key === "route" ? reading.counts.route : k.key === "guard" ? reading.counts.guarded : reading.counts[k.key];
                    return (
                      <button key={k.key} type="button" aria-pressed={kinds.includes(k.key)} onClick={() => toggleKind(k.key)} disabled={!count} className={chip(kinds.includes(k.key), k.tone)}>
                        {k.label} <span className="text-haze-400">{count}</span>
                      </button>
                    );
                  })}
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
        <h2 id="read-more" className="text-xl font-semibold text-white">In your terminal and your coding agent</h2>
        <p className="mt-2 max-w-2xl text-haze-300">The same reader runs on a file or a whole repository, with the same filters:</p>
        <pre className="mt-4 max-w-2xl overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-6 text-haze-200">
          thunder read . --kind route --answer 401{"\n"}
          thunder read services --answer Decline --in python{"\n"}
          thunder read LoanPolicy.java --json
        </pre>
        <p className="mt-3 text-sm text-haze-400">
          In Claude Code or Codex, <code className="font-mono text-haze-200">intent_read_repo</code> reads your repository and{" "}
          <code className="font-mono text-haze-200">intent_read</code> reads one file; ChatGPT can use <code className="font-mono text-haze-200">intent_read</code>.{" "}
          <Link href="/docs/reading-code" className="font-medium text-gold-300 hover:text-gold-200">How reading works →</Link>{" "}
          <Link href="/docs/mcp" className="font-medium text-gold-300 hover:text-gold-200">Connect your agent →</Link>
        </p>
      </section>
    </div>
  );
}
