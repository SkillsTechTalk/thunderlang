"use client";

import { useState } from "react";
import {
  heroExample,
  resetPasswordFull,
  architectureExample,
  apiExample,
  eventExample,
} from "@/lib/content";
import { MermaidDiagram } from "@/components/MermaidDiagram";

type Diagnostic = {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  why?: string;
  fix?: string[];
};
type CompileResult = {
  mission: string;
  aiUsed: boolean;
  diagnostics: Diagnostic[];
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
  { label: "CreateInvoice", code: heroExample },
  { label: "ResetPassword", code: resetPasswordFull },
  { label: "BillingService", code: architectureExample },
  { label: "CreateInvoice API", code: apiExample },
  { label: "InvoiceCreated event", code: eventExample },
];

type Tab = "diagnostics" | "docs" | "graph" | "testplan" | "proof";
const TABS: { id: Tab; label: string }[] = [
  { id: "diagnostics", label: "Diagnostics" },
  { id: "docs", label: "Docs" },
  { id: "graph", label: "Graph" },
  { id: "testplan", label: "Test Plan" },
  { id: "proof", label: "Proof" },
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
  const [code, setCode] = useState(heroExample);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [status, setStatus] = useState<"idle" | "compiling" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState<Tab>("diagnostics");
  const [graphView, setGraphView] = useState<"diagram" | "source">("diagram");
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function run() {
    setStatus("compiling");
    setErrorMsg("");
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus("error");
        setErrorMsg(data.error ?? "Compile failed.");
        setResult(null);
        return;
      }
      setResult(data as CompileResult);
      setStatus("idle");
      setTab("diagnostics");
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

  return (
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
        <label htmlFor="editor" className="sr-only">
          IntentLang editor
        </label>
        <textarea
          id="editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="h-[460px] w-full resize-none rounded-2xl border border-white/10 bg-ink-900/80 p-5 font-mono text-[13px] leading-relaxed text-haze-100 outline-none focus:border-gold-300/40"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
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
                    {result.diagnostics.map((d, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
                      >
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
                            <ul className="mt-1 space-y-1">
                              {d.fix.map((f, j) => (
                                <li
                                  key={j}
                                  className="flex items-start gap-2 text-xs text-haze-300"
                                >
                                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold-300/70" />
                                  <span className="font-mono">{f}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
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
