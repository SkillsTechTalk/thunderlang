"use client";

// The Thunder playground: write a program on the left; on the right see what it prints, try its functions with your
// own values, run its tests, and step through how it ran. Everything runs on the Thunder engine in this browser.

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ThunderEditor } from "@/components/ThunderEditor";
import { problemsOf, functionsOf, encodeProgram, decodeProgram } from "./core-playground.mjs";

export type PlaygroundExample = { id: string; label: string; source: string };

type Tab = "prints" | "try" | "tests" | "steps";
const TABS: { key: Tab; label: string }[] = [
  { key: "prints", label: "What it prints" },
  { key: "try", label: "Try it" },
  { key: "tests", label: "Tests" },
  { key: "steps", label: "Steps" },
];

type Problem = { line: number | null; message: string; hint: string | null; code: string };
type FnInfo = { name: string; line: number; inputs: { name: string; kind: string | null }[] };

const tabClass = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition active:scale-[0.97] ${on ? "bg-gold-400/15 text-gold-200 ring-1 ring-gold-300/40" : "text-haze-300 hover:text-white"}`;
const panel = "rounded-xl border border-white/10 bg-ink-900/80";
const mono = "font-mono text-[13px] leading-6";

// One worker runs every job, so the compiler loads once, not on every keystroke. A job that runs too long (a
// Repeat that never ends) is stopped by replacing the worker; the jobs that were waiting behind it are sent again.
type Pending = { job: Record<string, unknown>; done: (r: unknown) => void; arm: () => void };
let shared: { worker: Worker; ready: Promise<void>; pending: Map<number, Pending> } | null = null;
let nextId = 1;

function sharedWorker() {
  if (shared) return shared;
  const worker = new Worker(new URL("./playground.worker.ts", import.meta.url));
  const pending = new Map<number, Pending>();
  let markReady: () => void = () => {};
  const ready = new Promise<void>((res) => { markReady = res; });
  worker.onmessage = (e) => {
    if (e.data?.ready) { markReady(); return; }
    const p = pending.get(e.data.id);
    if (p) { pending.delete(e.data.id); p.done(e.data.result); }
  };
  shared = { worker, ready, pending };
  return shared;
}

/** Stop the job `id` by replacing the worker; every other waiting job is sent to the new one. */
function stopJob(id: number) {
  if (!shared) return;
  const waiting = [...shared.pending].filter(([k]) => k !== id);
  shared.worker.terminate();
  shared = null;
  const next = sharedWorker();
  next.ready.then(() => { for (const [k, p] of waiting) { next.pending.set(k, p); next.worker.postMessage({ ...p.job, id: k }); p.arm(); } });
}

/** Run one job; a job that runs longer than `ms` (counted once the worker is ready) is stopped and said so. */
function useJob<T>(job: Record<string, unknown> | null, ms = 1500): { result: T | null; stopped: boolean; busy: boolean } {
  const [state, setState] = useState<{ result: T | null; stopped: boolean; busy: boolean }>({ result: null, stopped: false, busy: false });
  const key = job ? JSON.stringify(job) : "";
  useEffect(() => {
    if (!job) return;
    let live = true;
    const id = nextId++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, busy: true }));
    const w = sharedWorker();
    // The time limit starts (and starts again, if the job is sent to a new worker) when the job is sent.
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (shared?.pending.has(id)) { stopJob(id); if (live) setState({ result: null, stopped: true, busy: false }); } }, ms); };
    w.pending.set(id, { job, arm, done: (r) => { clearTimeout(timer); if (live) setState({ result: r as T, stopped: false, busy: false }); } });
    w.ready.then(() => {
      if (!live || !shared || !shared.pending.has(id)) return;
      shared.worker.postMessage({ ...job, id });
      arm();
    });
    return () => { live = false; clearTimeout(timer); shared?.pending.delete(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return state;
}

const STOPPED = "Stopped after a moment: this keeps running (a Repeat that never ends?). Nothing was lost; change the program and it runs again.";

export function CorePlayground({ examples }: { examples: PlaygroundExample[] }) {
  const [exampleId, setExampleId] = useState(examples[0]?.id ?? "");
  const [source, setSource] = useState(examples[0]?.source ?? "");
  const [tab, setTab] = useState<Tab>("prints");
  const [copied, setCopied] = useState<"" | "done" | "failed">("");

  // A shared link (#code=…) opens that program.
  useEffect(() => {
    const open = () => {
      const m = /#code=([\w-]+)/.exec(window.location.hash);
      const shared = m ? decodeProgram(m[1]) : null;
      if (shared) { setSource(shared); setExampleId(""); }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  const program = useDeferredValue(source);
  const problems = useMemo(() => problemsOf(program) as Problem[], [program]);
  const ok = problems.length === 0;
  const fns = useMemo(() => (ok ? (functionsOf(program) as FnInfo[]) : []), [program, ok]);

  const chooseExample = (id: string) => {
    const ex = examples.find((e) => e.id === id);
    if (!ex) return;
    setExampleId(id);
    setSource(ex.source);
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#code=${encodeProgram(source)}`;
    try { await navigator.clipboard.writeText(url); window.history.replaceState(null, "", url); setCopied("done"); } catch { setCopied("failed"); }
    setTimeout(() => setCopied(""), 2500);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* The program */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="pg-source" className="text-sm font-medium text-white">Your program</label>
          <div className="flex items-center gap-2">
            <label htmlFor="pg-example" className="text-xs text-haze-400">Start from</label>
            <select id="pg-example" value={exampleId} onChange={(e) => chooseExample(e.target.value)} className="rounded-lg border border-white/12 bg-ink-900 px-2 py-1 text-sm text-haze-100">
              {exampleId === "" && <option value="">your own program</option>}
              {examples.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
        </div>
        <div className={panel}>
          <ThunderEditor id="pg-source" value={source} onChange={(v) => { setSource(v); }} minRows={16} maxRows={30} invalid={!ok} describedBy="pg-problems" />
        </div>
        <div id="pg-problems" aria-live="polite" className="mt-3 text-sm">
          {ok ? (
            <p className="text-emerald-300">✓ Thunder understands this program.</p>
          ) : (
            <div className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-amber-100">
              <p className="font-medium">Not quite yet: {problems.length === 1 ? "one problem" : `${problems.length} problems`}. Your text is kept as you typed it.</p>
              <ul className="mt-1 space-y-1">
                {problems.slice(0, 5).map((p, i) => (
                  <li key={i}><span className="font-mono text-amber-200">Line {p.line ?? "?"}</span>: {p.message}{p.hint ? <span className="block text-amber-100/80">{p.hint}</span> : null}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={share} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-haze-100 transition hover:border-gold-300/50 hover:text-white active:scale-[0.97]">Copy a link to this program</button>
          <span aria-live="polite" className="text-xs text-haze-400">{copied === "done" ? "Link copied. Anyone who opens it sees this program." : copied === "failed" ? "Could not copy. The link is in the address bar." : ""}</span>
        </div>
      </div>

      {/* What it does */}
      <div>
        <div role="tablist" aria-label="What to see" className="mb-2 flex flex-wrap gap-1">
          {TABS.map((t) => <button key={t.key} role="tab" id={`pg-tab-${t.key}`} aria-selected={tab === t.key} aria-controls="pg-panel" className={tabClass(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
        <div id="pg-panel" role="tabpanel" aria-labelledby={`pg-tab-${tab}`}>
          {!ok ? (
            <p className={`${panel} p-4 text-sm text-haze-300`}>Fix the problem on the left and this shows what the program does. The last thing you typed is kept.</p>
          ) : tab === "prints" ? <Prints source={program} />
            : tab === "try" ? <TryIt source={program} fns={fns} />
            : tab === "tests" ? <Tests source={program} />
            : <Steps source={program} />}
        </div>
        <p className="mt-3 text-xs text-haze-400">Runs on the Thunder engine in your browser. Nothing is sent anywhere.</p>
      </div>
    </div>
  );
}

function Prints({ source }: { source: string }) {
  const { result, stopped } = useJob<{ status: number; stdout: string; stderr: string; crashed?: string }>({ op: "run", source });
  return (
    <pre aria-live="polite" className={`${panel} ${mono} min-h-[8rem] whitespace-pre-wrap break-words p-4`}><code>
      {stopped ? <span className="text-amber-200">{STOPPED}</span>
        : !result ? <span className="text-haze-400">Running…</span>
        : result.crashed ? <span className="text-red-300">{result.crashed}</span>
        : <>{result.stdout}{result.stderr && <span className="text-red-300">{result.stderr}</span>}{!result.stdout && !result.stderr && <span className="text-haze-400">It runs and prints nothing. Add a line like: say &quot;hello&quot;. Or open Try it to call a function.</span>}</>}
    </code></pre>
  );
}

function TryIt({ source, fns }: { source: string; fns: FnInfo[] }) {
  const [fnName, setFnName] = useState(fns[0]?.name ?? "");
  const fn = fns.find((f) => f.name === fnName) ?? fns[0];
  const [values, setValues] = useState<Record<string, string>>({});
  const vals = fn ? fn.inputs.map((i) => values[`${fn.name}/${i.name}`] ?? "") : [];
  const ready = !!fn && vals.every((v) => v.trim());
  const { result, stopped, busy } = useJob<{ ok: boolean; value?: string; error?: string; hint?: string }>(ready && fn ? { op: "try", source, fn: fn.name, values: vals } : null);
  if (!fns.length) return <p className={`${panel} p-4 text-sm text-haze-300`}>This program has no functions to try. A function starts with <code className="text-gold-200">To</code>, for example <code className="text-gold-200">To calculate shipping:</code>.</p>;
  return (
    <div className={`${panel} p-4`}>
      <label htmlFor="pg-fn" className="text-sm text-haze-300">Function</label>
      <select id="pg-fn" value={fn?.name} onChange={(e) => setFnName(e.target.value)} className="ml-2 rounded-lg border border-white/12 bg-ink-900 px-2 py-1 text-sm text-haze-100">
        {fns.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
      </select>
      <div className="mt-4 space-y-3">
        {fn?.inputs.length === 0 && <p className="text-sm text-haze-400">It takes no inputs.</p>}
        {fn?.inputs.map((inp) => {
          const k = `${fn.name}/${inp.name}`;
          return (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`pg-in-${k}`} className="w-44 text-sm text-white">{inp.name}{inp.kind ? <span className="ml-1 text-xs text-haze-400">({inp.kind})</span> : null}</label>
              <input id={`pg-in-${k}`} value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} placeholder={inp.kind === "yes/no" ? "yes or no" : inp.kind === "text" ? '"some text"' : inp.kind === "list" ? "[1, 2, 3]" : inp.kind === "number" || inp.kind === "whole number" ? "100" : inp.kind === "money" ? "$5" : 'a value: 100, "text", yes'} className={`flex-1 rounded-lg border border-white/12 bg-ink-950 px-2 py-1 ${mono} text-haze-100`} />
            </div>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-4 rounded-lg border border-white/10 p-3">
        {!ready ? <p className="text-sm text-haze-400">Type a value for each input to see the answer. Write numbers as 100, money as $5, text in quotes, yes or no.</p>
          : stopped ? <p className="text-sm text-amber-200">{STOPPED}</p>
          : busy || !result ? <p className="text-sm text-haze-400">Working…</p>
          : result.ok ? <p className="text-sm text-haze-200"><span className="text-haze-400">{fn?.name} gives </span><span className={`${mono} text-lg text-emerald-300`}>{result.value}</span></p>
          : <p className="text-sm text-amber-100">{result.error}{result.hint ? <span className="block text-amber-100/80">{result.hint}</span> : null}</p>}
      </div>
    </div>
  );
}

function Tests({ source }: { source: string }) {
  const { result, stopped } = useJob<{ none?: boolean; passed?: number; failed?: number; tests?: { title: string; line: number; ok: boolean; why: string | null }[]; crashed?: string }>({ op: "test", source }, 3000);
  if (stopped) return <p className={`${panel} p-4 text-sm text-amber-200`}>{STOPPED}</p>;
  if (!result) return <p className={`${panel} p-4 text-sm text-haze-400`}>Running the tests…</p>;
  if (result.crashed) return <p className={`${panel} p-4 text-sm text-red-300`}>{result.crashed}</p>;
  if (result.none) return <p className={`${panel} p-4 text-sm text-haze-300`}>No tests yet. Add one at the left edge, for example:<code className={`mt-2 block ${mono} text-gold-200`}>{'Test "members get 20% off":'}<br />{"  Expect calculate discount with 150 and yes to be 30"}</code></p>;
  return (
    <div className={`${panel} p-4`} aria-live="polite">
      <p className={`text-sm font-medium ${result.failed ? "text-amber-200" : "text-emerald-300"}`}>{result.failed ? `${result.failed} of ${result.tests!.length} tests fail` : `All ${result.passed} tests pass`}</p>
      <ul className="mt-3 space-y-2">
        {result.tests!.map((t, i) => (
          <li key={i} className="text-sm">
            <span className={t.ok ? "text-emerald-300" : "text-amber-200"}>{t.ok ? "✓ passes" : "✗ fails"}</span> <span className="text-white">{t.title}</span> <span className="text-xs text-haze-400">line {t.line}</span>
            {t.why && <span className="mt-1 block pl-4 text-amber-100/90">{t.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Steps({ source }: { source: string }) {
  const { result, stopped } = useJob<{ steps: { n: number; line: number; code: string; depth: number; says: string }[]; stdout: string; stderr: string; truncated: boolean; crashed?: string }>({ op: "steps", source }, 3000);
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [source]);
  if (stopped) return <p className={`${panel} p-4 text-sm text-amber-200`}>{STOPPED}</p>;
  if (!result) return <p className={`${panel} p-4 text-sm text-haze-400`}>Recording the run…</p>;
  if (result.crashed) return <p className={`${panel} p-4 text-sm text-red-300`}>{result.crashed}</p>;
  const steps = result.steps;
  if (!steps.length) return <p className={`${panel} p-4 text-sm text-haze-300`}>Nothing ran at the top of the program. A program with only functions does its work when called: open Try it.</p>;
  const s = steps[Math.min(at, steps.length - 1)];
  return (
    <div className={`${panel} p-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setAt((a) => Math.max(0, a - 1))} disabled={at === 0} className="rounded-lg border border-white/15 px-3 py-1 text-sm text-haze-100 disabled:opacity-40 active:scale-[0.97]">← Back</button>
        <button type="button" onClick={() => setAt((a) => Math.min(steps.length - 1, a + 1))} disabled={at >= steps.length - 1} className="rounded-lg border border-white/15 px-3 py-1 text-sm text-haze-100 disabled:opacity-40 active:scale-[0.97]">Next →</button>
        <label htmlFor="pg-step" className="sr-only">Step</label>
        <input id="pg-step" type="range" min={0} max={steps.length - 1} value={Math.min(at, steps.length - 1)} onChange={(e) => setAt(Number(e.target.value))} className="flex-1" />
        <span className="text-xs text-haze-400">step {Math.min(at, steps.length - 1) + 1} of {steps.length}{result.truncated ? " (the recording stopped here)" : ""}</span>
      </div>
      <div aria-live="polite" className="mt-4 rounded-lg border border-white/10 p-3">
        <p className="text-xs text-haze-400">Line {s.line}</p>
        <p className={`${mono} text-gold-200`}>{s.code}</p>
        <p className="mt-1 text-sm text-haze-200">{s.says || "goes on to the next line"}</p>
      </div>
      <ol className={`mt-4 max-h-64 overflow-y-auto ${mono} text-xs`}>
        {steps.map((st, i) => (
          <li key={st.n}>
            <button type="button" onClick={() => setAt(i)} className={`w-full rounded px-2 py-0.5 text-left ${i === at ? "bg-gold-400/15 text-gold-100" : "text-haze-300 hover:text-white"}`} style={{ paddingLeft: `${0.5 + (st.depth - 1) * 1}rem` }}>
              <span className="text-haze-500">{String(st.line).padStart(3)} </span>{st.code}{st.says ? <span className="text-haze-400">  · {st.says}</span> : null}
            </button>
          </li>
        ))}
      </ol>
      {result.stderr && <p className="mt-3 text-sm text-red-300">{result.stderr}</p>}
    </div>
  );
}
