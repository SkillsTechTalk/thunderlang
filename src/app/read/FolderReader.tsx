"use client";

import { useMemo, useRef, useState } from "react";
import { readRepo, searchRepo, groupByFile, readableLanguage, type RepoReading, type RepoItem } from "../../../compiler/src/read-repo.mjs";
import { READ_SAMPLES } from "./samples.mjs";
import { FACETS, LANG_LABEL, ReadCard, SourceView, chip, field, linesOf, type ReadFacet } from "./parts";
import type { CodeLang } from "@/lib/code-tokens";

const MAX_FILES = 3000;
const MAX_FILE_BYTES = 400_000;
const PAGE = 60;

const SAMPLE_PROJECT = [
  { path: "shop/shipping/shipping.go", source: READ_SAMPLES[0].source },
  { path: "shop/payments/fraud.rs", source: READ_SAMPLES[1].source },
  { path: "shop/loans/LoanPolicy.java", source: READ_SAMPLES[2].source },
  { path: "shop/school/grading.py", source: READ_SAMPLES[3].source },
  { path: "shop/docs/AccessPolicy.cs", source: READ_SAMPLES[4].source },
  { path: "shop/delivery/Delivery.kt", source: READ_SAMPLES[5].source },
  { path: "shop/checkout/Coupons.php", source: READ_SAMPLES[6].source },
  { path: "shop/support/priority.rb", source: READ_SAMPLES[7].source },
];

type Progress = { done: number; total: number } | null;

/** Read a whole folder in the browser. Files are read locally with the File API; nothing is uploaded. */
export function FolderReader({ know }: { know: CodeLang }) {
  const [index, setIndex] = useState<RepoReading | null>(null);
  const [sources, setSources] = useState<Map<string, string>>(new Map());
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<ReadFacet[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [input, setInput] = useState("");
  const [folder, setFolder] = useState("");
  const [selected, setSelected] = useState<RepoItem | null>(null);
  const [shown, setShown] = useState(PAGE);
  const picker = useRef<HTMLInputElement>(null);

  function load(files: { path: string; source: string; size?: number }[], label: string) {
    const next = readRepo(files, { maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES });
    setIndex(next);
    setSources(new Map(files.filter((f) => f.source).map((f) => [f.path.replace(/\\/g, "/"), f.source])));
    setName(label);
    setQuery(""); setFacets([]); setLanguages([]); setAnswer(""); setInput(""); setFolder(""); setSelected(null); setShown(PAGE);
    setProgress(null);
  }

  async function onPick(list: FileList | null) {
    setError("");
    if (!list || !list.length) return;
    const all = Array.from(list);
    const root = (all[0].webkitRelativePath || all[0].name).split("/")[0];
    const wanted = all.filter((f) => readableLanguage(f.webkitRelativePath || f.name));
    if (!wanted.length) {
      setError(`No TypeScript, JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby files were found in "${root}" outside dependency and build folders.`);
      return;
    }
    const capped = wanted.slice(0, MAX_FILES);
    const files: { path: string; source: string; size?: number }[] = [];
    setProgress({ done: 0, total: capped.length });
    // Read in small batches so the page stays responsive and progress is visible.
    for (let i = 0; i < capped.length; i += 25) {
      const batch = capped.slice(i, i + 25);
      const read = await Promise.all(batch.map(async (f) => {
        const path = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
        return f.size > MAX_FILE_BYTES ? { path, source: "", size: f.size } : { path, source: await f.text() };
      }));
      files.push(...read);
      setProgress({ done: Math.min(i + 25, capped.length), total: capped.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    load(files, wanted.length > MAX_FILES ? `${root} (first ${MAX_FILES} of ${wanted.length} code files)` : root);
  }

  const items = useMemo(() => {
    if (!index) return [];
    const kinds = facets.filter((f) => f !== "guard" && f !== "route");
    const extras = facets.filter((f) => f === "guard" || f === "route");
    // Kind chips are "any of"; Routes and With checks narrow further when also chosen.
    let list = searchRepo(index, { query, kinds: kinds.length ? kinds : [], languages, path: folder, answer, input });
    if (extras.includes("route")) list = list.filter((i) => i.route);
    if (extras.includes("guard")) list = list.filter((i) => i.guards?.length);
    return list;
  }, [index, query, facets, languages, folder, answer, input]);
  const groups = useMemo(() => groupByFile(items.slice(0, shown)), [items, shown]);
  const highlighted = useMemo(() => new Set(selected ? linesOf(selected) : []), [selected]);
  const filtersOn = !!(query || facets.length || languages.length || answer || input || folder);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={picker}
          type="file"
          className="sr-only"
          id="folder-picker"
          // Directory selection is a non-standard attribute supported by current Chrome, Edge, Firefox, and Safari.
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          multiple
          onChange={(e) => { void onPick(e.target.files); e.target.value = ""; }}
        />
        <button type="button" onClick={() => picker.current?.click()} className="rounded-lg bg-gold-400 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300">
          Choose a folder
        </button>
        <button type="button" onClick={() => load(SAMPLE_PROJECT, "shop (sample project in eight languages)")} className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-haze-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300">
          Try a sample project
        </button>
        <p className="text-sm text-haze-400">Files are read in your browser. Nothing is uploaded. Dependency and build folders are skipped.</p>
      </div>

      {progress && (
        <div role="status" aria-live="polite" className="space-y-2">
          <p className="text-sm text-haze-200">Reading {progress.done} of {progress.total} files…</p>
          <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gold-300 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}

      {index && !progress && (
        <>
          <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-5">
            <p className="font-medium text-white">{name}</p>
            <p className="mt-1 text-sm text-haze-300">
              {index.files.length} files read ({Object.entries(index.languages).map(([l, n]) => `${LANG_LABEL[l] ?? l} ${n}`).join(", ")}). {index.counts.route} routes,{" "}
              {index.counts.decision} decisions, {index.counts.guarded} functions with checks, {index.counts.function} other functions, {index.counts.error} errors, {index.counts.test} tests.
            </p>
            {index.skipped.length > 0 && (
              <details className="mt-2 text-sm text-haze-400">
                <summary className="cursor-pointer">{index.skipped.length} file{index.skipped.length === 1 ? "" : "s"} skipped</summary>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                  {index.skipped.map((s) => <li key={s.path}><span className="font-mono text-haze-300">{s.path}</span>: {s.reason}</li>)}
                </ul>
              </details>
            )}
          </div>

          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm text-haze-300">
              Search the whole folder: names, routes, inputs, conditions, answers, and file paths
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="for example: refund, POST /orders, creditScore" className={field} />
            </label>
            <div role="group" aria-label="Show only" className="flex flex-wrap gap-2">
              {FACETS.map((f) => {
                const count = f.key === "route" ? index.counts.route : f.key === "guard" ? index.counts.guarded : index.counts[f.key];
                return (
                  <button key={f.key} type="button" aria-pressed={facets.includes(f.key)} disabled={!count} onClick={() => { setFacets((x) => toggle(x, f.key)); setShown(PAGE); }} className={chip(facets.includes(f.key), f.tone)}>
                    {f.label} <span className="text-haze-400">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.keys(index.languages).length > 1 && (
                <div role="group" aria-label="Languages" className="flex flex-wrap items-center gap-2">
                  {Object.entries(index.languages).map(([l, n]) => (
                    <button key={l} type="button" aria-pressed={languages.includes(l)} onClick={() => { setLanguages((x) => toggle(x, l)); setShown(PAGE); }} className={chip(languages.includes(l), "border-gold-300/50 text-white")}>
                      {LANG_LABEL[l] ?? l} <span className="text-haze-400">{n}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm text-haze-300">
                Where the code answers or fails with
                <select className={field} value={answer} onChange={(e) => { setAnswer(e.target.value); setShown(PAGE); }}>
                  <option value="">Any answer</option>
                  {index.answers.map((a) => <option key={a.name} value={a.name}>{a.name} ({a.decisions.length})</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-haze-300">
                Rules that use the input
                <select className={field} value={input} onChange={(e) => { setInput(e.target.value); setShown(PAGE); }}>
                  <option value="">Any input</option>
                  {index.inputs.map((a) => <option key={a.name} value={a.name}>{a.name} ({a.decisions.length})</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-haze-300">
                Folder
                <select className={field} value={folder} onChange={(e) => { setFolder(e.target.value); setShown(PAGE); }}>
                  <option value="">Everywhere</option>
                  {Object.entries(index.folders).sort().map(([f, n]) => <option key={f} value={f === "." ? "" : `${f}/`}>{f === "." ? "(top level)" : f} ({n} files)</option>)}
                </select>
              </label>
            </div>
            <p role="status" aria-live="polite" className="text-sm text-haze-300">
              {filtersOn ? `${items.length} match${items.length === 1 ? "" : "es"} of ${index.items.length}.` : `${index.items.length} items in ${index.files.length} files.`}{" "}
              {items.length === 0 && "Nothing matches. Try fewer words or clear the filters. "}
              {filtersOn && (
                <button type="button" className="font-medium text-gold-300 hover:text-gold-200" onClick={() => { setQuery(""); setFacets([]); setLanguages([]); setAnswer(""); setInput(""); setFolder(""); setShown(PAGE); }}>
                  Clear filters
                </button>
              )}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="min-w-0 space-y-6">
              {groups.map((g) => (
                <section key={g.file} aria-label={g.file}>
                  <h3 className="mb-2 flex flex-wrap items-baseline gap-2 font-mono text-sm text-haze-100">
                    {g.file} <span className="font-sans text-xs text-haze-400">{LANG_LABEL[g.language] ?? g.language}</span>
                  </h3>
                  <ul className="space-y-3">
                    {g.items.map((it) => (
                      <ReadCard key={it.id} item={it} know={know} compact selected={selected?.id === it.id} onShow={() => setSelected(it)} />
                    ))}
                  </ul>
                </section>
              ))}
              {items.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-haze-100 hover:bg-white/10">
                  Show {Math.min(PAGE, items.length - shown)} more of {items.length - shown}
                </button>
              )}
            </div>
            <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <div className="overflow-hidden rounded-xl border border-white/15 bg-ink-900/80">
                <div className="border-b border-white/10 px-4 py-2.5 text-sm">
                  {selected ? <span className="font-mono text-haze-100">{selected.file}</span> : <span className="text-haze-300">Choose &ldquo;Show line&rdquo; on any item to see its code here.</span>}
                </div>
                {selected && sources.get(selected.file) != null && (
                  <SourceView source={sources.get(selected.file)!} highlighted={highlighted} label={`Code of ${selected.file}`} maxHeight="max-h-[70vh]" language={selected.language} />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
