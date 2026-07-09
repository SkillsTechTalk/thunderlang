"use client";

import { useState, useRef } from "react";
import {
  heroExample,
  createInvoiceWithNotes,
  resetPasswordFull,
  architectureExample,
  apiExample,
  eventExample,
} from "@/lib/content";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { IntentMonaco } from "@/components/IntentMonaco";

type Fix = { label: string; insert?: string; block?: string };
type Diagnostic = {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  why?: string;
  fix?: Fix[];
};
type IntentNote = {
  id: string;
  lens: string;
  text: string;
  targetKind: string;
  targetPath: string;
  sourceSpan: { line: number; column: number };
};
type CompileResult = {
  mission: string;
  aiUsed: boolean;
  diagnostics: Diagnostic[];
  notes: IntentNote[];
  artifacts: {
    markdown: string;
    mermaid: string;
    testplan: string;
    contractGraph: unknown;
    architectureGraph: unknown;
    implementationPlan: unknown;
    proof: any;
  };
};

const samples = [
  { label: "CreateInvoice (notes)", code: createInvoiceWithNotes },
  { label: "CreateInvoice", code: heroExample },
  { label: "ResetPassword", code: resetPasswordFull },
  { label: "BillingService", code: architectureExample },
  { label: "CreateInvoice API", code: apiExample },
  { label: "InvoiceCreated event", code: eventExample },
];

type Tab = "debug" | "diagnostics" | "notes" | "docs" | "graph" | "testplan" | "proof";
const TABS: { id: Tab; label: string }[] = [
  { id: "debug", label: "Debug" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "notes", label: "Notes" },
  { id: "docs", label: "Docs" },
  { id: "graph", label: "Graph" },
  { id: "testplan", label: "Test Plan" },
  { id: "proof", label: "Proof" },
];

// Reader lenses for IntentLens notes (compiler is the source of truth for the notes).
const LENSES = ["all", "pm", "beginner", "qa", "risk", "security", "reviewer"];

const SEMANTIC_TYPES =
  /:\s*(Email|Money|Currency|Url|UserId|AccountId|Secret|Token|Jwt|Date|DateTime|Duration|Percentage|FilePath|Repository|ServiceName|ApiEndpoint|EventName|DatabaseTable|TraceId|CorrelationId|IdempotencyKey|Version|EnvironmentName)\b/;

// Remove a top-level block (keyword line + its indented body + one trailing blank).
function removeBlock(code: string, keyword: string): string {
  const lines = code.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isHeader =
      !/^\s/.test(line) && (line === keyword || line.startsWith(keyword + " "));
    if (isHeader) {
      i++;
      while (i < lines.length && /^\s+\S/.test(lines[i])) i++;
      if (i < lines.length && lines[i].trim() === "") i++;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

type Scores = {
  beauty: number;
  strong: string[];
  improve: string[];
  trust: "Ready" | "Partial" | "Not ready";
  trustReason: string;
};

function computeScores(code: string, result: CompileResult): Scores {
  const proof = result.artifacts.proof;
  const g = proof.guarantees ?? [];
  const n = proof.neverRules ?? [];
  const errors = result.diagnostics.filter((d) => d.level === "error").length;
  const warnings = result.diagnostics.filter((d) => d.level === "warning").length;
  const unverified =
    g.filter((x: { status: string }) => x.status !== "verified").length +
    n.filter((x: { status: string }) => x.status !== "verified").length;

  const checks: [string, boolean][] = [
    ["Clear mission and goal", /^\s*goal\b/m.test(code) && !!result.mission],
    ["States a why or because", /\b(why|because)\b/.test(code)],
    ["Uses semantic types", SEMANTIC_TYPES.test(code)],
    ["Declares never rules", n.length > 0],
    ["Declares verification", /\bverify\b/.test(code)],
  ];
  const strong = checks.filter(([, ok]) => ok).map(([label]) => label);
  const improve = checks.filter(([, ok]) => !ok).map(([label]) => `Add: ${label.toLowerCase()}`);
  const base = Math.round((strong.length / checks.length) * 100);
  const beauty = Math.max(0, base - Math.min(20, warnings * 4));

  let trust: Scores["trust"] = "Ready";
  if (errors > 0) trust = "Not ready";
  else if (unverified > 0 || warnings > 0 || proof.proofStatus !== "approved")
    trust = "Partial";
  const trustReason = `${g.length} guarantee${g.length === 1 ? "" : "s"} declared, ${
    g.length - g.filter((x: { status: string }) => x.status !== "verified").length
  } verified · ${n.length} never rule${n.length === 1 ? "" : "s"} · ${warnings} warning${
    warnings === 1 ? "" : "s"
  } · proof ${proof.proofStatus} · AI ${proof.ai?.used ? "used" : "not used"}`;

  return { beauty, strong, improve, trust, trustReason };
}

// Insert an indented line into an existing top-level block, creating the block
// at the end of the file if it does not exist yet.
function insertIntoBlock(code: string, block: string, text: string): string {
  const lines = code.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === block && !/^\s/.test(l));
  if (headerIdx === -1) {
    const suffix = code.endsWith("\n") ? "" : "\n";
    return `${code}${suffix}\n${block}\n  ${text}\n`;
  }
  let end = headerIdx + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
  lines.splice(end, 0, `  ${text}`);
  return lines.join("\n");
}

// Apply a fix: `top` appends a new top-level block, otherwise insert into a block.
function applyFix(code: string, fix: Fix): string {
  if (!fix.insert || !fix.block) return code;
  if (fix.block === "top") {
    const suffix = code.endsWith("\n") ? "" : "\n";
    return `${code}${suffix}\n${fix.insert}\n`;
  }
  return insertIntoBlock(code, fix.block, fix.insert);
}

// Best-effort mapping from a diagnostic to the source text it refers to.
function diagnosticNeedle(d: Diagnostic): string | null {
  const quoted = d.message.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  if (d.code === "missing-goal" || d.code === "missing-mission") return "mission";
  return null;
}

type DebugView = {
  meaning: string;
  why?: string;
  mustHold: string[];
  mustNever: string[];
  unverified: string[];
  proofLine: string;
  firstFix?: { message: string; fix?: Fix };
};

// Plain-language debug read of the mission, derived from the compile result.
function buildDebug(result: CompileResult): DebugView {
  const m = ((result.artifacts.contractGraph as any)?.missions?.[0] ?? {}) as any;
  const proof = result.artifacts.proof;
  const guarantees = m.guarantees ?? [];
  const neverRules = m.neverRules ?? [];
  const unverified = [
    ...guarantees.filter((g: any) => !(g.verify?.length)).map((g: any) => `guarantee: ${g.statement}`),
    ...neverRules.filter((n: any) => !(n.verify?.length)).map((n: any) => `never: ${n.statement}`),
  ];
  const name = m.name || result.mission;
  const errs = result.diagnostics.filter((d) => d.level === "error");
  const first = errs[0] ?? result.diagnostics.find((d) => d.level === "warning");
  const firstFix = first
    ? { message: first.message, fix: first.fix?.find((f) => f.insert && f.block) }
    : undefined;
  const proofLine = `Proof is ${proof.proofStatus}. ${
    proof.humanApproval?.approved ? "Human approved" : "Human approval required"
  }. AI ${proof.ai?.used ? "used" : "not used"}.`;
  return {
    meaning: m.goal ? `${name}: ${m.goal}` : name,
    why: m.why || undefined,
    mustHold: guarantees.map((g: any) => g.statement),
    mustNever: neverRules.map((n: any) => n.statement),
    unverified,
    proofLine,
    firstFix,
  };
}

const LIFT_SAMPLE = `// Paste TypeScript. IntentLift infers a humble .intent draft from it.
export class DuplicateInvoice extends Error {}

export async function createInvoice(
  orderId: OrderId,
  total: Money,
  key: IdempotencyKey,
): Promise<Result<Invoice, DuplicateInvoice>> {
  if (await exists(orderId)) throw new DuplicateInvoice();
  return ok(await save(orderId, total));
}

test("repeated order returns the same invoice", () => {});
it("never creates a duplicate invoice", () => {});
`;

const breakers: { label: string; apply: (c: string) => string }[] = [
  { label: "Remove idempotency key", apply: (c) => c.split("\n").filter((l) => !/idempotencyKey/.test(l)).join("\n") },
  { label: "Remove verify block", apply: (c) => removeBlock(c, "verify") },
  { label: "Remove goal", apply: (c) => removeBlock(c, "goal") },
];

function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function OutputBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-[440px] overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-4 font-mono text-[12.5px] leading-relaxed text-haze-100">
      {text}
    </pre>
  );
}

export function PlaygroundClient() {
  const [code, setCode] = useState(createInvoiceWithNotes);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [status, setStatus] = useState<"idle" | "compiling" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState<Tab>("diagnostics");
  const [graphView, setGraphView] = useState<"diagram" | "source">("diagram");
  const [copied, setCopied] = useState(false);
  const [compiledSrc, setCompiledSrc] = useState("");
  const [lens, setLens] = useState("all");
  const [showLift, setShowLift] = useState(false);
  const [liftCode, setLiftCode] = useState(LIFT_SAMPLE);
  const [liftLang, setLiftLang] = useState("typescript");
  const [liftResult, setLiftResult] = useState<any>(null);
  const [liftBusy, setLiftBusy] = useState(false);
  const [approvedIntent, setApprovedIntent] = useState<string | null>(null);
  const [driftResult, setDriftResult] = useState<any>(null);

  async function approveDraft() {
    if (!liftResult?.intentText) return;
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intentText: liftResult.intentText,
        approvedAt: new Date().toISOString(),
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setApprovedIntent(data.text);
      setDriftResult(null);
    }
  }

  async function checkDrift() {
    if (!approvedIntent) return;
    const res = await fetch("/api/drift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentText: approvedIntent, source: liftCode, language: liftLang }),
    });
    const data = await res.json();
    if (data.ok) setDriftResult(data);
  }
  // Monaco editor instance (set on mount). Completions + hover are inline,
  // powered by the compiler through /api/assist inside IntentMonaco.
  const editorRef = useRef<any>(null);

  async function lift() {
    setLiftBusy(true);
    setLiftResult(null);
    setApprovedIntent(null);
    setDriftResult(null);
    try {
      const res = await fetch("/api/lift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: liftCode, language: liftLang }),
      });
      setLiftResult(await res.json());
    } catch {
      setLiftResult({ error: "Network error. Please try again." });
    } finally {
      setLiftBusy(false);
    }
  }

  // Reveal and select a 1-based source line in the Monaco editor.
  function highlightLine(line: number) {
    const ed = editorRef.current;
    if (!ed || line < 1) return;
    const model = ed.getModel?.();
    const endCol = model ? model.getLineMaxColumn(line) : 1;
    ed.revealLineInCenter(line);
    ed.setSelection({
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: endCol,
    });
    ed.focus();
  }

  // Find the first source line containing `needle`, then highlight it.
  function highlightSource(needle: string | null) {
    if (!needle) return;
    const lines = code.split("\n");
    const idx = lines.findIndex((l) =>
      l.toLowerCase().includes(needle.toLowerCase()),
    );
    if (idx >= 0) highlightLine(idx + 1);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function run(src?: string) {
    const source = src ?? code;
    setStatus("compiling");
    setErrorMsg("");
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus("error");
        setErrorMsg(data.error ?? "Compile failed.");
        setResult(null);
        return;
      }
      setResult(data as CompileResult);
      setCompiledSrc(source);
      setStatus("idle");
      setTab("debug");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  const errors = result?.diagnostics.filter((d) => d.level === "error").length ?? 0;
  const warnings = result?.diagnostics.filter((d) => d.level === "warning").length ?? 0;
  const proof = result?.artifacts.proof;
  const gaps = proof
    ? (proof.guarantees ?? []).filter((g: { status: string }) => g.status !== "verified").length +
      (proof.neverRules ?? []).filter((n: { status: string }) => n.status !== "verified").length
    : 0;
  const scores = result ? computeScores(compiledSrc || code, result) : null;
  const debug = result ? buildDebug(result) : null;
  const trustColor =
    scores?.trust === "Ready"
      ? "text-emerald-300"
      : scores?.trust === "Partial"
        ? "text-gold-300"
        : "text-red-300";

  return (
    <div>
      {/* IntentLift: code -> inferred intent */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-ink-900/40">
        <button
          type="button"
          onClick={() => setShowLift((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-sm font-medium text-white">
            IntentLift{" "}
            <span className="text-haze-400">
              · lift TypeScript into an inferred intent draft
            </span>
          </span>
          <span className="text-haze-400">{showLift ? "−" : "+"}</span>
        </button>
        {showLift && (
          <div className="border-t border-white/8 p-5">
            <p className="mb-3 text-xs leading-relaxed text-haze-400">
              Paste code you do not know (or want to understand). The compiler
              infers a humble, source-mapped draft: evidence, confidence, and what
              a human must review. It never claims the inferred intent is verified.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <textarea
                  value={liftCode}
                  onChange={(e) => setLiftCode(e.target.value)}
                  spellCheck={false}
                  className="h-64 w-full resize-none rounded-xl border border-white/10 bg-ink-900/80 p-4 font-mono text-[12.5px] leading-relaxed text-haze-100 outline-none focus:border-gold-300/40"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={lift}
                    disabled={liftBusy}
                    className="btn-primary disabled:opacity-60"
                  >
                    {liftBusy ? "Lifting…" : "Lift to Intent"}
                  </button>
                  <select
                    value={liftLang}
                    onChange={(e) => setLiftLang(e.target.value)}
                    className="rounded-md border border-white/12 bg-ink-900 px-2 py-1 text-xs text-haze-200 outline-none focus:border-gold-300/40"
                  >
                    <option value="typescript">TypeScript</option>
                    <option value="rust">Rust</option>
                    <option value="perl">Perl</option>
                  </select>
                  <span className="text-[11px] text-haze-500">no AI</span>
                </div>
              </div>
              <div>
                {!liftResult && (
                  <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/12 text-center text-xs text-haze-500">
                    The inferred .intent draft appears here.
                  </div>
                )}
                {liftResult?.error && (
                  <div className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4 text-sm text-red-200">
                    {liftResult.error}
                  </div>
                )}
                {liftResult?.ok && (
                  <div>
                    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <TrustChip ok label={`mission ${liftResult.summary.mission}`} />
                      <TrustChip
                        warn={liftResult.summary.confidence !== "high"}
                        ok={liftResult.summary.confidence === "high"}
                        label={`confidence ${liftResult.summary.confidence}`}
                      />
                      <TrustChip ok label={`${liftResult.summary.functions} fn`} />
                      <TrustChip ok label={`${liftResult.summary.tests} tests`} />
                      <TrustChip warn label={`${liftResult.summary.unknowns.length} unknowns`} />
                      <TrustChip warn label="reviewed: false" />
                    </div>
                    <pre className="max-h-52 overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-3 font-mono text-[12px] leading-relaxed text-haze-100">
                      {liftResult.intentText}
                    </pre>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCode(liftResult.intentText);
                          setShowLift(false);
                          run(liftResult.intentText);
                        }}
                        className="btn-ghost"
                      >
                        Open in editor
                      </button>
                      <button
                        type="button"
                        onClick={() => copy(liftResult.intentText)}
                        className="text-xs text-gold-300 hover:text-gold-200"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          download(
                            `${liftResult.summary.mission}.intent`,
                            liftResult.intentText,
                          )
                        }
                        className="text-xs text-gold-300 hover:text-gold-200"
                      >
                        Download .intent
                      </button>
                    </div>

                    {/* Round-trip: approve, then check the code against it */}
                    <div className="mt-3 border-t border-white/8 pt-3">
                      {!approvedIntent ? (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={approveDraft}
                            className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-400/[0.16]"
                          >
                            Approve draft
                          </button>
                          <span className="text-[11px] text-haze-500">
                            After review, approve to enable drift checks.
                          </span>
                        </div>
                      ) : (
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <TrustChip ok label="approved: reviewed true" />
                            <button
                              type="button"
                              onClick={checkDrift}
                              className="rounded-md border border-white/12 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-haze-200 hover:border-gold-300/40 hover:text-gold-200"
                            >
                              Check drift vs the code above
                            </button>
                            <span className="text-[11px] text-haze-500">
                              Edit the code, then re-check.
                            </span>
                          </div>
                          {driftResult && (
                            <div className="mt-2">
                              <TrustChip
                                ok={driftResult.status === "in_sync"}
                                warn={driftResult.status !== "in_sync"}
                                label={`drift: ${driftResult.status}`}
                              />
                              {driftResult.findings.length > 0 && (
                                <ul className="mt-1.5 space-y-1">
                                  {driftResult.findings.map(
                                    (f: { code: string; message: string; level: string }, i: number) => (
                                      <li
                                        key={i}
                                        className="text-[11px] leading-relaxed text-haze-300"
                                      >
                                        <span className="font-mono text-haze-500">
                                          {f.code}
                                        </span>{" "}
                                        {f.message}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-haze-400">
            Examples
          </span>
          {samples.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setCode(s.code);
                setResult(null);
                setStatus("idle");
              }}
              className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs text-haze-200 transition-colors hover:border-white/25 hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
        <IntentMonaco
          value={code}
          onChange={setCode}
          onEditor={(ed) => (editorRef.current = ed)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => run()}
            disabled={status === "compiling"}
            className="btn-primary disabled:opacity-60"
          >
            {status === "compiling" ? "Compiling…" : "Run Compiler"}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Compiled without AI
          </span>
          <button
            type="button"
            onClick={() => download("playground.intent", code)}
            className="text-xs text-haze-400 hover:text-haze-200"
          >
            Download .intent
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-haze-500">Try breaking it:</span>
          {breakers.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => {
                const c = b.apply(code);
                setCode(c);
                run(c);
              }}
              className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs text-haze-300 transition-colors hover:border-gold-300/40 hover:text-gold-200"
            >
              {b.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-haze-500">
          Inline autocomplete and hover are powered by the compiler. Press
          Ctrl+Space for suggestions; hover a semantic type or note lens for help.
        </p>
      </div>

      {/* Output */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              disabled={!result}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                tab === t.id && result
                  ? "bg-white/[0.08] text-white"
                  : "text-haze-300 hover:text-haze-100"
              }`}
            >
              {t.label}
              {t.id === "diagnostics" && result
                ? ` (${result.diagnostics.length})`
                : ""}
            </button>
          ))}
        </div>

        {!result && status !== "error" && (
          <div className="flex h-[460px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center">
            <p className="text-sm text-haze-300">
              Click <span className="text-white">Run Compiler</span> to compile
              this intent.
            </p>
            <p className="mt-2 max-w-xs text-xs text-haze-500">
              Deterministic. No AI. You get diagnostics, docs, a graph, a test
              plan, and a proof artifact.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/[0.06] p-5 text-sm text-red-200">
            {errorMsg}
          </div>
        )}

        {result && (
          <div>
            {/* Trust strip */}
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5 text-xs">
              <TrustChip ok={errors === 0} label={errors === 0 ? "Syntax passed" : "Syntax failed"} />
              <TrustChip
                ok={warnings === 0}
                warn={warnings > 0}
                label={warnings > 0 ? `${warnings} semantic warning${warnings === 1 ? "" : "s"}` : "No semantic warnings"}
              />
              <TrustChip ok label={`${result.notes?.length ?? 0} notes`} />
              <TrustChip ok label="Docs generated" />
              <TrustChip ok label="Test plan generated" />
              <TrustChip warn label={`Proof: ${proof?.proofStatus ?? "draft"}`} />
              <TrustChip ok label="AI used: false" />
              <TrustChip ok label="Local compiler" />
            </div>

            {/* Semantic beauty + trust readiness */}
            {scores && (
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-haze-400">
                      Semantic beauty
                    </span>
                    <span className="font-mono text-lg text-white">
                      {scores.beauty}
                      <span className="text-xs text-haze-500">/100</span>
                    </span>
                  </div>
                  {scores.improve.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-haze-400">
                      {scores.improve.slice(0, 3).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-haze-400">
                      Trust readiness
                    </span>
                    <span className={`text-sm font-semibold ${trustColor}`}>
                      {scores.trust}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-haze-400">
                    {scores.trustReason}
                  </p>
                </div>
              </div>
            )}

            {/* Status line, brand voice */}
            <p className="mb-3 text-sm text-haze-200">
              <span className="font-medium text-white">Intent compiled.</span>{" "}
              Contract generated, guarantees mapped, never rules checked, proof
              emitted
              {gaps > 0 ? (
                <span className="text-gold-300">
                  {" "}
                  · {gaps} proof gap{gaps > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-emerald-300"> · no proof gaps</span>
              )}
              .
            </p>

            {tab === "debug" && debug && (
              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-haze-400">
                    What this mission means
                  </h3>
                  <p className="mt-1.5 text-haze-100">{debug.meaning}</p>
                  {debug.why && (
                    <p className="mt-1 text-haze-400">It matters because {debug.why}.</p>
                  )}
                </div>
                <DebugList title="What must hold" items={debug.mustHold} />
                <DebugList title="What must never happen" items={debug.mustNever} />
                <DebugList
                  title="Trust gaps (declared but unverified)"
                  items={debug.unverified}
                  empty="Everything declared has a verification."
                  tone="warn"
                />
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-haze-400">
                    Proof
                  </h3>
                  <p className="mt-1.5 text-haze-300">{debug.proofLine}</p>
                </div>
                {debug.firstFix && (
                  <div className="rounded-xl border border-gold-300/25 bg-gold-300/[0.06] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300">
                      Fix this first
                    </p>
                    <p className="mt-1.5 text-haze-100">{debug.firstFix.message}</p>
                    {debug.firstFix.fix && (
                      <button
                        type="button"
                        onClick={() => {
                          const c = applyFix(code, debug.firstFix!.fix!);
                          setCode(c);
                          run(c);
                        }}
                        className="mt-3 rounded-md border border-gold-300/40 bg-gold-300/[0.08] px-2.5 py-1 text-[11px] font-medium text-gold-200 hover:bg-gold-300/[0.16]"
                      >
                        Apply suggested fix
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "diagnostics" && (
              <div>
                <div className="mb-3 flex gap-4 text-xs">
                  <span className={errors ? "text-red-300" : "text-haze-400"}>
                    {errors} error{errors === 1 ? "" : "s"}
                  </span>
                  <span className={warnings ? "text-gold-300" : "text-haze-400"}>
                    {warnings} warning{warnings === 1 ? "" : "s"}
                  </span>
                </div>
                {result.diagnostics.length === 0 ? (
                  <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200">
                    Syntax and semantic checks passed.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {result.diagnostics.map((d, i) => {
                      const needle = diagnosticNeedle(d);
                      return (
                      <li
                        key={i}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                d.level === "error" ? "bg-red-400" : "bg-gold-300"
                              }`}
                            />
                            <span className="font-mono text-[11px] uppercase tracking-wide text-haze-400">
                              {d.level} · {d.code}
                            </span>
                          </div>
                          {needle && (
                            <button
                              type="button"
                              onClick={() => highlightSource(needle)}
                              className="shrink-0 text-[11px] text-gold-300 hover:text-gold-200"
                            >
                              Show source
                            </button>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm text-haze-100">
                          {d.message}
                        </p>
                        {d.why && (
                          <p className="mt-2 text-xs leading-relaxed text-haze-300">
                            <span className="font-semibold text-haze-200">
                              Why:
                            </span>{" "}
                            {d.why}
                          </p>
                        )}
                        {d.fix && d.fix.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-haze-200">
                              Fix:
                            </p>
                            <ul className="mt-1 space-y-1.5">
                              {d.fix.map((f, j) => (
                                <li
                                  key={j}
                                  className="flex items-start justify-between gap-3 text-xs text-haze-300"
                                >
                                  <span className="flex items-start gap-2">
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold-300/70" />
                                    <span>{f.label}</span>
                                  </span>
                                  {f.insert && f.block && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const c = applyFix(code, f);
                                        setCode(c);
                                        run(c);
                                      }}
                                      className="shrink-0 rounded-md border border-gold-300/40 bg-gold-300/[0.08] px-2 py-0.5 text-[11px] font-medium text-gold-200 hover:bg-gold-300/[0.16]"
                                    >
                                      Apply
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {tab === "notes" && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-haze-500">Lens:</span>
                  {LENSES.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLens(l)}
                      className={`rounded-full px-2.5 py-0.5 text-xs capitalize transition-colors ${
                        lens === l
                          ? "bg-white/[0.1] text-white"
                          : "text-haze-400 hover:text-haze-200"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <p className="mb-3 text-xs text-haze-500">
                  IntentLens notes are compiled explanation for a specific reader.
                  They improve understanding; they do not prove behavior.
                </p>
                {(() => {
                  const notes = (result.notes ?? []).filter(
                    (n) => lens === "all" || n.lens === lens,
                  );
                  if (notes.length === 0)
                    return (
                      <p className="text-sm text-haze-500">
                        No notes{lens === "all" ? "" : ` for the ${lens} lens`}.
                      </p>
                    );
                  const byLens: Record<string, IntentNote[]> = {};
                  for (const n of notes) (byLens[n.lens] ||= []).push(n);
                  return (
                    <div className="space-y-4">
                      {Object.entries(byLens).map(([l, ns]) => (
                        <div key={l}>
                          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300">
                            {l} notes
                          </h3>
                          <ul className="mt-2 space-y-2">
                            {ns.map((n) => (
                              <li
                                key={n.id}
                                className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[11px] text-haze-400">
                                    {n.targetKind}
                                    {n.targetPath.includes(".")
                                      ? ` · ${n.targetPath.split(".").slice(-1)[0]}`
                                      : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => highlightLine(n.sourceSpan.line)}
                                    className="text-[11px] text-gold-300 hover:text-gold-200"
                                  >
                                    Show source
                                  </button>
                                </div>
                                <p className="mt-1.5 text-sm text-haze-100">
                                  {n.text}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === "docs" && (
              <div>
                <DownloadRow
                  onClick={() =>
                    download(`${result.mission}.md`, result.artifacts.markdown, "text/markdown")
                  }
                  onCopy={() => copy(result.artifacts.markdown)}
                  label="Download docs.md"
                />
                <OutputBlock text={result.artifacts.markdown} />
              </div>
            )}

            {tab === "graph" && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="inline-flex rounded-lg border border-white/10 p-0.5">
                    {(["diagram", "source"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setGraphView(v)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                          graphView === v
                            ? "bg-white/[0.08] text-white"
                            : "text-haze-400 hover:text-haze-200"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => copy(result.artifacts.mermaid)}
                      className="text-xs text-gold-300 hover:text-gold-200"
                    >
                      {copied ? "Copied" : "Copy source"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        download(`${result.mission}.mmd`, result.artifacts.mermaid)
                      }
                      className="text-xs text-gold-300 hover:text-gold-200"
                    >
                      Download .mmd
                    </button>
                  </div>
                </div>
                {graphView === "diagram" ? (
                  <MermaidDiagram code={result.artifacts.mermaid} />
                ) : (
                  <OutputBlock text={result.artifacts.mermaid} />
                )}
                <p className="mt-2 text-xs text-haze-500">
                  A contract map of the mission, its guarantees, never rules, and
                  events. Copy the Mermaid source to paste into any renderer.
                </p>
              </div>
            )}

            {tab === "testplan" && (
              <div>
                <DownloadRow
                  onClick={() =>
                    download(
                      `${result.mission}.testplan.md`,
                      result.artifacts.testplan,
                      "text/markdown",
                    )
                  }
                  onCopy={() => copy(result.artifacts.testplan)}
                  label="Download test plan"
                />
                <OutputBlock text={result.artifacts.testplan} />
              </div>
            )}

            {tab === "proof" && (
              <div>
                <ProofSummary proof={proof} />
                <DownloadRow
                  onClick={() =>
                    download(
                      ".intent-proof.json",
                      JSON.stringify(proof, null, 2),
                      "application/json",
                    )
                  }
                  onCopy={() => copy(JSON.stringify(proof, null, 2))}
                  label="Download proof JSON"
                />
                <OutputBlock text={JSON.stringify(proof, null, 2)} />
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function DebugList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty?: string;
  tone?: "warn";
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-haze-400">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-haze-500">{empty ?? "None."}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2 text-haze-200">
              <span
                className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${
                  tone === "warn" ? "bg-gold-300/80" : "bg-emerald-400/70"
                }`}
              />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrustChip({
  ok,
  warn,
  label,
}: {
  ok?: boolean;
  warn?: boolean;
  label: string;
}) {
  const color = warn ? "bg-gold-300" : ok ? "bg-emerald-400" : "bg-red-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-haze-300">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function DownloadRow({
  onClick,
  label,
  note,
  onCopy,
}: {
  onClick: () => void;
  label: string;
  note?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      {note ? (
        <span className="text-xs text-haze-500">{note}</span>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="text-xs text-gold-300 hover:text-gold-200"
          >
            Copy
          </button>
        )}
        <button
          type="button"
          onClick={onClick}
          className="text-xs text-gold-300 hover:text-gold-200"
        >
          {label}
        </button>
      </div>
    </div>
  );
}

function ProofSummary({ proof }: { proof: any }) {
  if (!proof) return null;
  const g = proof.guarantees ?? [];
  const n = proof.neverRules ?? [];
  const rows: [string, string][] = [
    ["Proof status", String(proof.proofStatus ?? "draft")],
    ["Compiler", String(proof.compilerVersion ?? "")],
    ["Source hash", String(proof.sourceHash ?? "").slice(0, 22) + "…"],
    ["Guarantees", `${g.length} (${g.filter((x: { status: string }) => x.status === "verified").length} verified)`],
    ["Never rules", `${n.length} (${n.filter((x: { status: string }) => x.status !== "verified").length} need verification)`],
    ["AI used", proof.ai?.used ? "true" : "false"],
    ["Human approval", proof.humanApproval?.approved ? "approved" : "required"],
  ];
  return (
    <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-haze-500">{k}</dt>
          <dd className="font-mono text-haze-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
