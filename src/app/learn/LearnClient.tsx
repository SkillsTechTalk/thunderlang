"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LESSONS } from "./lessons.mjs";
import { ThunderEditor } from "@/components/ThunderEditor";
import { LanguageOutput, OUTPUT_TABS, type OutputKey } from "@/components/LanguageOutput";
import { compileContract, type Compiled } from "@/lib/thunder-compile";

const LANG_KEY = "thunderlang-learn-language";
const btn =
  "rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-haze-100 transition hover:bg-white/10 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300 disabled:cursor-not-allowed disabled:opacity-40";

function useCompiled(source: string) {
  const last = useRef<Compiled | null>(null);
  return useMemo(() => {
    try {
      const compiled = compileContract(source);
      last.current = compiled;
      return { compiled, error: "" };
    } catch (e) {
      return { compiled: last.current, error: e instanceof Error ? e.message : "This contract could not be read." };
    }
  }, [source]);
}

export function LearnClient() {
  const [index, setIndex] = useState(0);
  const [sources, setSources] = useState<string[]>(() => LESSONS.map((l) => l.source));
  const [tried, setTried] = useState<boolean[]>(() => LESSONS.map(() => false));
  const [lang, setLang] = useState<OutputKey>("typescript");
  const heading = useRef<HTMLHeadingElement>(null);

  const lesson = LESSONS[index];
  const source = sources[index];
  const { compiled, error } = useCompiled(source);
  const tests = compiled?.report.tests;
  const failing = !error && tests ? tests.results.filter((r) => !r.pass) : [];
  const canTry = source.includes(lesson.tryThis.find);

  // Remember the reader's language between visits (a per-viewer convenience only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as OutputKey | null;
      if (saved && OUTPUT_TABS.some((t) => t.key === saved)) setLang(saved);
    } catch {}
  }, []);
  function chooseLang(next: OutputKey) {
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch {}
  }

  function setSource(next: string) {
    setSources((all) => all.map((s, i) => (i === index ? next : s)));
  }
  function applyTry() {
    setSource(source.replace(lesson.tryThis.find, lesson.tryThis.replace));
    setTried((all) => all.map((t, i) => (i === index ? true : t)));
  }
  function reset() {
    setSource(lesson.source);
    setTried((all) => all.map((t, i) => (i === index ? false : t)));
  }
  function go(next: number) {
    setIndex(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function download() {
    if (!compiled) return;
    const name = `${compiled.report.mission ?? "Contract"}.thunder`;
    const url = URL.createObjectURL(new Blob([compiled.code.thunder], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-10">
      {/* Lesson steps: where you are, and where you can go. */}
      <nav aria-label="Lessons">
        <ol className="grid gap-2 sm:grid-cols-5">
          {LESSONS.map((l, i) => (
            <li key={l.slug}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                className={`flex h-full w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${
                  i === index ? "border-gold-300/60 bg-gold-400/10 text-white" : "border-white/10 text-haze-300 hover:border-white/25 hover:text-haze-100"
                }`}
              >
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${i === index ? "bg-gold-300 text-ink-950" : "bg-white/10"}`}>{i + 1}</span>
                <span className="font-medium leading-snug">{l.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section aria-labelledby="lesson-title" className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        {/* The idea before the syntax. */}
        <div>
          <p className="text-sm font-semibold text-gold-300">Lesson {index + 1} of {LESSONS.length}</p>
          <h2 id="lesson-title" ref={heading} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight text-white focus:outline-none">
            {lesson.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-haze-200">{lesson.idea}</p>
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-haze-400">Picture it</p>
            <p className="mt-1 text-haze-200">{lesson.picture}</p>
          </div>
          <dl className="mt-6 space-y-3">
            {lesson.words.map((w) => (
              <div key={w.word} className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-3 text-sm">
                <dt className="font-mono text-[#C4B5FD]">{w.word}</dt>
                <dd className="text-haze-300">{w.means}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Write it, check it, see it in every language. */}
        <div className="min-w-0 space-y-5">
          <div className="overflow-hidden rounded-xl border border-white/20 bg-black/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <label htmlFor="learn-source" className="text-sm font-medium text-haze-100">Write ThunderLang</label>
              <span className="text-xs text-haze-400">Updates as you type</span>
            </div>
            <ThunderEditor
              id="learn-source"
              value={source}
              onChange={setSource}
              invalid={!!error}
              describedBy={error ? "learn-status learn-error" : "learn-status"}
            />
          </div>

          {error ? (
            <p id="learn-error" role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">
              {error}
            </p>
          ) : (
            <div id="learn-status" role="status" aria-live="polite" className={`rounded-lg border p-3 text-sm ${failing.length ? "border-red-400/40 bg-red-400/10" : "border-emerald-400/30 bg-emerald-400/[0.06]"}`}>
              <p className={`font-semibold ${failing.length ? "text-red-200" : "text-emerald-200"}`}>
                {failing.length
                  ? `${failing.length} of ${tests?.total} examples ${failing.length === 1 ? "fails" : "fail"}. The rule does not match what you said it should do.`
                  : `All ${tests?.total} examples pass. The rule does what you said it should.`}
              </p>
              <ul className="mt-2 space-y-1">
                {tests?.results.map((r) => (
                  <li key={r.case} className="flex gap-2 text-haze-200">
                    <span aria-hidden="true" className={r.pass ? "text-emerald-300" : "text-red-300"}>{r.pass ? "✓" : "✗"}</span>
                    <span>
                      <span className="sr-only">{r.pass ? "Passed: " : "Failed: "}</span>
                      {r.case}
                      {!r.pass && <span className="text-red-200">: expected {String(r.expected)}, got {String(r.actual)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-gold-300/25 bg-gold-400/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-300">Try this</p>
            <p className="mt-1 text-haze-100">{lesson.tryThis.prompt}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className={`${btn} border-gold-300/50`} onClick={applyTry} disabled={!canTry}>
                Make this change
              </button>
              <button type="button" className={btn} onClick={reset} disabled={source === lesson.source}>
                Reset lesson
              </button>
            </div>
            {!canTry && !tried[index] && <p className="mt-2 text-xs text-haze-400">You have edited this line already. Reset the lesson to try the change.</p>}
            {tried[index] && <p className="mt-3 text-sm text-haze-200"><strong className="text-white">What happened: </strong>{lesson.tryThis.expect}</p>}
          </div>

          {compiled && (
            <LanguageOutput idPrefix="learn-out" code={compiled.code} active={lang} onActive={chooseLang} stale={!!error} />
          )}
          <p className="text-xs text-haze-400">
            Generated in your browser by the ThunderLang compiler, deterministically, with no AI. Each tab is the same rule; the
            first matching rule wins in every language.
          </p>

          <div className="flex flex-wrap justify-between gap-3">
            <button type="button" className={btn} onClick={() => go(index - 1)} disabled={index === 0}>
              ← Previous lesson
            </button>
            {index < LESSONS.length - 1 ? (
              <button type="button" className={`${btn} border-transparent bg-gold-400 text-ink-950 hover:bg-gold-300`} onClick={() => go(index + 1)}>
                Next: {LESSONS[index + 1].title} →
              </button>
            ) : (
              <button type="button" className={`${btn} border-transparent bg-gold-400 text-ink-950 hover:bg-gold-300`} onClick={download} disabled={!compiled || !!error}>
                Download {compiled?.report.mission ?? "Contract"}.thunder
              </button>
            )}
          </div>
        </div>
      </section>

      <TakeItFurther onDownload={download} canDownload={!!compiled && !error} name={compiled?.report.mission ?? "Contract"} />
    </div>
  );
}

function TakeItFurther({ onDownload, canDownload, name }: { onDownload: () => void; canDownload: boolean; name: string }) {
  const file = `${name}.thunder`;
  return (
    <section aria-labelledby="further" className="border-t border-white/10 pt-10">
      <h2 id="further" className="text-2xl font-semibold text-white">Keep writing where you work</h2>
      <p className="mt-2 max-w-2xl text-haze-300">
        The same file works in the browser, in your terminal, and in OpenThunder. Download this lesson as standard ThunderLang to
        carry it over.
      </p>
      <button type="button" onClick={onDownload} disabled={!canDownload} className={`${btn} mt-4`}>
        Download {file}
      </button>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 p-5">
          <h3 className="font-semibold text-white">In the browser</h3>
          <p className="mt-2 text-sm text-haze-300">Write larger contracts with completions, diagrams, and proofs. Nothing to install.</p>
          <div className="mt-4 flex flex-col gap-2 text-sm">
            <Link href="/playground" className="font-medium text-gold-300 hover:text-gold-200">Open the Playground →</Link>
            <Link href="/try" className="font-medium text-gold-300 hover:text-gold-200">Test a rule against a real app →</Link>
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-white/10 p-5">
          <h3 className="font-semibold text-white">In your terminal</h3>
          <p className="mt-2 text-sm text-haze-300">Run the examples, generate code, and run the examples against that code.</p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-6 text-haze-200">
            <span className="tok-comment"># install once</span>{"\n"}
            npm install -g @skillstech/thunderlang{"\n"}
            thunder test {file}{"\n"}
            thunder gen {file} --target python{"\n"}
            thunder test {file} --target typescript
          </pre>
          <p className="mt-2 text-xs text-haze-400">
            The published CLI generates TypeScript, Python, C#, and Java. Go and Rust output above comes from the newer compiler
            that powers this page.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 p-5">
          <h3 className="font-semibold text-white">In OpenThunder</h3>
          <p className="mt-2 text-sm text-haze-300">
            Open <code className="font-mono text-haze-100">.thunder</code> files in the OpenThunder editor with highlighting,
            completions, and hover help. From the repository, check every contract and compare languages:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-6 text-haze-200">
            openthunder intent prove{"\n"}
            openthunder intent conform
          </pre>
        </div>
      </div>
    </section>
  );
}
