"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ThunderEditor } from "@/components/ThunderEditor";
import { HighlightedCode, HighlightedSource } from "@/lib/highlight";
import { thunderModel, readLevel } from "../../../compiler/src/model.mjs";
import { pythonToCore } from "../../../compiler/src/core/from-python.mjs";
import { compileCore } from "../../../compiler/src/core/index.mjs";
import { toPython } from "../../../compiler/src/core/target-python.mjs";
import { toTypeScript } from "../../../compiler/src/core/target-typescript.mjs";
import { toCSharp } from "../../../compiler/src/core/target-csharp.mjs";
import { toJava } from "../../../compiler/src/core/target-java.mjs";
import { toGo, goNamespaces } from "../../../compiler/src/core/target-go.mjs";
import { toRust } from "../../../compiler/src/core/target-rust.mjs";

// ── From your code to Thunder ───────────────────────────────────────────────────────────────────────────────
const LANGS = [
  { key: "python", label: "Python", ext: "py" },
  { key: "typescript", label: "TypeScript", ext: "ts" },
  { key: "javascript", label: "JavaScript", ext: "js" },
  { key: "java", label: "Java", ext: "java" },
  { key: "csharp", label: "C#", ext: "cs" },
  { key: "go", label: "Go", ext: "go" },
  { key: "rust", label: "Rust", ext: "rs" },
] as const;
type LangKey = (typeof LANGS)[number]["key"];

const CODE: Record<LangKey, string> = {
  python: `def delivery_fee(total, distance_km):
    """Nearby orders of $20 or more are delivered free."""
    if total >= 20 and distance_km <= 5:
        return "Free"
    if distance_km > 15:
        return "TooFar"
    return "Standard"
`,
  typescript: `/** Nearby orders of $20 or more are delivered free. */
export function deliveryFee(total: number, distanceKm: number): string {
  if (total >= 20 && distanceKm <= 5) return "Free";
  if (distanceKm > 15) return "TooFar";
  return "Standard";
}
`,
  javascript: `// Nearby orders of $20 or more are delivered free.
function deliveryFee(total, distanceKm) {
  if (total >= 20 && distanceKm <= 5) return "Free";
  if (distanceKm > 15) return "TooFar";
  return "Standard";
}
`,
  java: `class Delivery {
  /** Nearby orders of $20 or more are delivered free. */
  static String deliveryFee(double total, double distanceKm) {
    if (total >= 20 && distanceKm <= 5) return "Free";
    if (distanceKm > 15) return "TooFar";
    return "Standard";
  }
}
`,
  csharp: `public static class Delivery {
  /// Nearby orders of $20 or more are delivered free.
  public static string DeliveryFee(decimal total, decimal distanceKm) {
    if (total >= 20 && distanceKm <= 5) return "Free";
    if (distanceKm > 15) return "TooFar";
    return "Standard";
  }
}
`,
  go: `package delivery

// DeliveryFee: nearby orders of $20 or more are delivered free.
func DeliveryFee(total float64, distanceKm float64) string {
	if total >= 20 && distanceKm <= 5 {
		return "Free"
	}
	if distanceKm > 15 {
		return "TooFar"
	}
	return "Standard"
}
`,
  rust: `/// Nearby orders of $20 or more are delivered free.
pub fn delivery_fee(total: f64, distance_km: f64) -> &'static str {
    if total >= 20.0 && distance_km <= 5.0 {
        return "Free";
    }
    if distance_km > 15.0 {
        return "TooFar";
    }
    "Standard"
}
`,
};

// ── From Thunder to your language ────────────────────────────────────────────────────────────────────────────
const THUNDER_START = `To delivery fee:
  Receive total and distance
  When total is at least $20 and distance is at most 5:
    Give "Free"
  Otherwise when distance is more than 15:
    Give "Too far"
  Otherwise:
    Give "Standard"

say delivery fee with $25 and 3
say delivery fee with $12.50 and 8
`;

const TARGETS = [
  { key: "python", label: "Python", file: "main.py" },
  { key: "typescript", label: "TypeScript", file: "main.ts" },
  { key: "csharp", label: "C#", file: "Main.cs" },
  { key: "java", label: "Java", file: "Main.java" },
  { key: "go", label: "Go", file: "main.go" },
  { key: "rust", label: "Rust", file: "main.rs" },
] as const;
type TargetKey = (typeof TARGETS)[number]["key"];

const tab = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${on ? "bg-gold-400/15 text-gold-200 ring-1 ring-gold-300/40" : "text-haze-300 hover:text-white"}`;
const panel = "rounded-xl border border-white/10 bg-ink-900/80 [scrollbar-color:#394150_#080B14] [scrollbar-width:thin]";

/** Thunder's reading of code in another language, from the same model OpenThunder shows. */
function readAsThunder(source: string, lang: LangKey) {
  try {
    const ext = LANGS.find((l) => l.key === lang)!.ext;
    const model = thunderModel([{ path: `your-code.${ext}`, source }], { name: "your code" });
    const text = String(readLevel(model, "text", undefined).text ?? "").trim();
    const core = lang === "python" ? pythonToCore(source) : null;
    return { text, core, error: "" };
  } catch (e) {
    return { text: "", core: null, error: e instanceof Error ? e.message : "Thunder could not read this yet." };
  }
}

/** The program compiled to every language; null when it does not compile (the problems say why). */
function compileAll(source: string) {
  const r = compileCore(source, { file: "main.thunder" });
  if (!r.ok) return { ok: false as const, problems: r.diagnostics.map((d: { line?: number; message: string; code?: string }) => `Line ${d.line ?? "?"}: ${d.message}${d.code ? `  [${d.code}]` : ""}`) };
  const out: Partial<Record<TargetKey, string>> = {};
  const safe = (f: () => string) => { try { return f(); } catch (e) { return `// This target cannot be written for this program yet: ${e instanceof Error ? e.message : e}`; } };
  out.python = safe(() => toPython(r.program, r.info, { source: "main.thunder" }));
  out.typescript = safe(() => toTypeScript(r.program, r.info, { source: "main.thunder" }));
  out.csharp = safe(() => toCSharp(r.program, r.info, { source: "main.thunder" }));
  out.java = safe(() => toJava(r.program, r.info, { source: "main.thunder" }));
  out.go = safe(() => toGo(r.program, r.info, { source: "main.thunder", module: "main", ns: goNamespaces([{ ...r, module: "main", kind: "src" }]).get("main") }));
  out.rust = safe(() => toRust(r.program, r.info, { source: "main.thunder" }));
  return { ok: true as const, code: out };
}

type RunResult = { status: number; stdout: string; stderr: string } | { stopped: true } | null;

/** Run on the Thunder engine in a worker; a program that runs too long is stopped and said so. */
function useEngineRun(source: string, enabled: boolean): RunResult {
  const [result, setResult] = useState<RunResult>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const id = ++seq.current;
    const worker = new Worker(new URL("./run.worker.ts", import.meta.url));
    const timer = setTimeout(() => { worker.terminate(); if (id === seq.current) setResult({ stopped: true }); }, 1500);
    worker.onmessage = (e) => {
      clearTimeout(timer); worker.terminate();
      if (id === seq.current && e.data.ok) setResult({ status: e.data.status, stdout: e.data.stdout, stderr: e.data.stderr });
    };
    worker.postMessage({ id, source });
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [source, enabled]);
  return result;
}

export function LiveClient() {
  const [mode, setMode] = useState<"to-thunder" | "from-thunder">("to-thunder");
  const [lang, setLang] = useState<LangKey>("python");
  const [code, setCode] = useState(CODE.python);
  const [thunder, setThunder] = useState(THUNDER_START);
  const [target, setTarget] = useState<TargetKey>("python");
  const deferredCode = useDeferredValue(code);
  const deferredThunder = useDeferredValue(thunder);
  const reading = useMemo(() => readAsThunder(deferredCode, lang), [deferredCode, lang]);
  const compiled = useMemo(() => compileAll(deferredThunder), [deferredThunder]);
  const lastGood = useRef<Partial<Record<TargetKey, string>>>({});
  if (compiled.ok) lastGood.current = compiled.code;
  const run = useEngineRun(deferredThunder, mode === "from-thunder" && compiled.ok);

  const chooseLang = (k: LangKey) => {
    // Keep what the person typed unless it is still one of the samples.
    if (Object.values(CODE).includes(code)) setCode(CODE[k]);
    setLang(k);
  };

  return (
    <div>
      <div role="tablist" aria-label="Which way to translate" className="flex flex-wrap gap-2">
        <button role="tab" aria-selected={mode === "to-thunder"} className={tab(mode === "to-thunder")} onClick={() => setMode("to-thunder")}>Your code → Thunder</button>
        <button role="tab" aria-selected={mode === "from-thunder"} className={tab(mode === "from-thunder")} onClick={() => setMode("from-thunder")}>Thunder → your language</button>
      </div>

      {mode === "to-thunder" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="live-code" className="text-sm font-medium text-white">Your code</label>
              <select aria-label="Your language" value={lang} onChange={(e) => chooseLang(e.target.value as LangKey)} className="rounded-lg border border-white/12 bg-ink-900 px-2 py-1 text-sm text-haze-100">
                {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
            </div>
            <div className={panel}>
              <ThunderEditor id="live-code" value={code} onChange={setCode} minRows={14} highlight={(s) => <HighlightedCode source={s} lang={lang} />} />
            </div>
            <p className="mt-2 text-xs text-haze-400">Type or paste any code. Thunder reads it as you type, in your browser.</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-white">In Thunder</p>
            <pre aria-live="polite" className={`${panel} min-h-[16rem] overflow-x-auto p-4 font-mono text-[13px] leading-6`}><code>
              {reading.error ? <span className="text-amber-200">{reading.error}</span> : reading.text ? <HighlightedSource source={reading.text} /> : <span className="text-haze-400">Nothing Thunder can read yet: write a function, a class, or a rule.</span>}
            </code></pre>
            {reading.core && (
              <>
                <p className="mb-2 mt-5 text-sm font-medium text-white">As Thunder Core you can edit and run
                  <span className="ml-2 text-xs font-normal text-haze-400">{reading.core.functions.filter((f: { exact: boolean }) => f.exact).length} of {reading.core.functions.length} functions said exactly; anything else is marked &ldquo;Not translated&rdquo;</span>
                </p>
                <pre className={`${panel} overflow-x-auto p-4 font-mono text-[13px] leading-6`}><code><HighlightedSource source={reading.core.core.trimEnd()} /></code></pre>
                <button className="mt-3 text-sm font-medium text-gold-300 hover:text-gold-200" onClick={() => { if (reading.core) { setThunder(reading.core.core); setMode("from-thunder"); } }}>
                  Open it in &ldquo;Thunder → your language&rdquo; →
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <label htmlFor="live-thunder" className="mb-2 block text-sm font-medium text-white">Thunder</label>
            <div className={panel}>
              <ThunderEditor id="live-thunder" value={thunder} onChange={setThunder} minRows={14} invalid={!compiled.ok} describedBy="live-problems" />
            </div>
            <div id="live-problems" aria-live="polite" className="mt-3 text-sm">
              {compiled.ok ? (
                <p className="text-emerald-300">✓ Thunder understands this program.</p>
              ) : (
                <div className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-amber-100">
                  <p className="font-medium">Not quite yet. The other side shows the last version that worked.</p>
                  <ul className="mt-1 list-disc pl-5">{compiled.problems.slice(0, 4).map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-white">What it prints <span className="text-xs font-normal text-haze-400">(run by the Thunder engine, in your browser)</span></p>
              <pre aria-live="polite" className={`${panel} min-h-[4rem] whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-6`}><code>
                {!run ? <span className="text-haze-400">…</span>
                  : "stopped" in run ? <span className="text-amber-200">Stopped after a moment: this program keeps running (a Repeat that never ends?).</span>
                  : <>{run.stdout}{run.stderr && <span className="text-red-300">{run.stderr}</span>}{!run.stdout && !run.stderr && <span className="text-haze-400">It runs, and says nothing. Add a line like: say &quot;hello&quot;</span>}</>}
              </code></pre>
            </div>
          </div>
          <div>
            <div role="tablist" aria-label="Your language" className="mb-2 flex flex-wrap gap-1">
              {TARGETS.map((t) => <button key={t.key} role="tab" aria-selected={target === t.key} className={tab(target === t.key)} onClick={() => setTarget(t.key)}>{t.label}</button>)}
            </div>
            <pre className={`${panel} overflow-x-auto p-4 font-mono text-[13px] leading-6 ${compiled.ok ? "" : "opacity-60"}`}><code>
              <HighlightedCode source={(lastGood.current[target] ?? "").trimEnd()} lang={TARGETS.find((t) => t.key === target)!.file} />
            </code></pre>
            <p className="mt-2 text-xs text-haze-400">The same program in every language gives the same output: each one passes the same {137} test programs. Lines end with a mark showing the Thunder line they came from.</p>
          </div>
        </div>
      )}
    </div>
  );
}
