"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildReviewAtlas, renderReviewBrief, type ReviewFile, type ReviewStatus } from "../../compiler/src/review-atlas.mjs";

const LABEL: Record<ReviewStatus, string> = { checked: "Cases checked", failed: "Failed cases", invalid: "Invalid contract", "needs-evidence": "Needs evidence" };
const COLOR: Record<ReviewStatus, string> = { checked: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20", failed: "text-rose-300 bg-rose-400/10 border-rose-400/20", invalid: "text-rose-300 bg-rose-400/10 border-rose-400/20", "needs-evidence": "text-amber-200 bg-amber-400/10 border-amber-400/20" };
const BUTTON = "rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-haze-200 transition hover:border-white/30 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40";
const MAX_BYTES = 1000000;

function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReviewAtlas({ initialFiles }: { initialFiles: ReviewFile[] }) {
  const [files, setFiles] = useState(initialFiles);
  const [evidence, setEvidence] = useState<unknown>(undefined);
  const [evidenceName, setEvidenceName] = useState("");
  const [selected, setSelected] = useState(initialFiles[0]?.path || "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const evidenceInput = useRef<HTMLInputElement>(null);
  const atlas = useMemo(() => buildReviewAtlas(files, { evidence }), [files, evidence]);
  const visible = atlas.files.filter((f) => (filter === "all" || (filter === "attention" ? f.status !== "checked" : f.status === filter)) && `${f.mission} ${f.file} ${f.goal} ${f.claims.map((c) => c.text).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const active = visible.find((f) => f.file === selected) || visible[0];
  const source = files.find((f) => f.path === active?.file)?.source || "";
  const s = atlas.summary;

  async function importFiles(picked: FileList | null, isEvidence = false) {
    if (!picked?.length) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const list = Array.from(picked);
      if (list.length > 100 || list.reduce((n, f) => n + f.size, 0) > MAX_BYTES) throw new Error("Choose up to 100 files with a combined size under 1 MB.");
      if (isEvidence) {
        const report: unknown = JSON.parse(await list[0].text());
        buildReviewAtlas(files, { evidence: report });
        setEvidence(report); setEvidenceName(list[0].name);
        setMessage("OpenThunder snapshot imported. Source and compiler matches appear per contract.");
      } else {
        if (list.some((f) => !/\.(thunder|tl|intent)$/i.test(f.name))) throw new Error("Choose .thunder, .tl, or .intent contracts.");
        const next = await Promise.all(list.map(async (f) => ({ path: f.webkitRelativePath || f.name, source: await f.text() })));
        if (new Set(next.map((f) => f.path)).size !== next.length) throw new Error("Two files have the same name. Import unique file names to keep results distinct.");
        setFiles(next); setSelected(next[0].path); setDraft(null); setQuery(""); setFilter("all");
        setMessage(`${next.length} contracts opened and evaluated locally.`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read these files."); }
    finally { setBusy(false); }
  }

  function breakBoundary() {
    const file = initialFiles.find((f) => f.path === "AgentSpendBudget.thunder");
    if (!file) return;
    const broken = { ...file, source: file.source.replace("reservedCents <= remainingCents", "reservedCents < remainingCents") };
    setFiles(initialFiles.map((f) => f.path === file.path ? broken : f));
    setSelected(file.path); setDraft(null); setFilter("all"); setQuery(""); setError("");
    setMessage("The budget comparison now excludes the exact limit. Inspect the failing case below.");
  }

  return (
    <div id="review-atlas" className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/15 bg-ink-900 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-violet-400/5 px-5 py-4 sm:px-7">
        <div><p className="text-sm font-semibold text-white">Agent contract workspace</p><p className="mt-1 text-xs text-haze-400">Evaluated in your browser · contract contents stay on this device</p></div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept=".thunder,.tl,.intent" multiple className="hidden" aria-label="Choose contract files" onChange={(e) => { void importFiles(e.target.files); e.target.value = ""; }} />
          <input ref={evidenceInput} type="file" accept=".json,application/json" className="hidden" aria-label="Choose OpenThunder evidence report" onChange={(e) => { void importFiles(e.target.files, true); e.target.value = ""; }} />
          <button className={BUTTON} disabled={busy} onClick={() => fileInput.current?.click()}>Open contracts</button>
          <button className={BUTTON} disabled={busy} onClick={() => evidenceInput.current?.click()}>Import OpenThunder report</button>
          <button className={BUTTON} onClick={() => download("intent-review-atlas.json", JSON.stringify(atlas, null, 2), "application/json")}>Export Atlas</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-white/10 bg-white/10 sm:grid-cols-4">
        {[["Contracts", s.files, "text-white"], ["Cases passed", `${s.testsPassed}/${s.tests}`, s.testsFailed ? "text-rose-300" : "text-emerald-300"], ["Claims with named evidence", `${s.verifiedClaims}/${s.claims}`, "text-violet-200"], ["Contracts to review", s.files - s.checked, "text-amber-200"]].map(([label, value, color]) => (
          <div key={label} className="bg-ink-900 px-5 py-5 sm:px-7"><p className={`font-mono text-3xl tracking-tight ${color}`}>{value}</p><p className="mt-2 text-xs text-haze-400">{label}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4 text-xs sm:px-7">
        <span className="mr-auto text-haze-300">Try an AI-era failure: a one-character budget regression.</span>
        <button className={BUTTON} onClick={breakBoundary}>Break budget boundary</button>
        <button className={BUTTON} onClick={() => { setFiles(initialFiles); setEvidence(undefined); setEvidenceName(""); setSelected(initialFiles[0].path); setDraft(null); setFilter("all"); setQuery(""); setError(""); setMessage("Examples restored. Results recalculated."); }}>Reset examples</button>
      </div>
      {error && <p role="alert" className="border-b border-rose-400/20 bg-rose-400/10 px-7 py-3 text-sm text-rose-200">{error}</p>}
      <p role="status" className={message ? "border-b border-white/10 px-7 py-3 text-xs text-haze-300" : "sr-only"}>{busy ? "Reading files…" : message}</p>

      <div className="grid lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-white/10 lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-5">
            <label className="block text-xs font-medium text-haze-300" htmlFor="atlas-search">Find a contract or claim</label>
            <input id="atlas-search" value={query} onChange={(e) => { setQuery(e.target.value); setDraft(null); }} placeholder="Search permissions, budget…" className="w-full rounded-lg border border-white/15 bg-ink-950 p-2.5 text-sm text-white outline-none focus:border-violet-300" />
            <select aria-label="Filter contracts by evidence status" value={filter} onChange={(e) => { setFilter(e.target.value); setDraft(null); }} className="w-full rounded-lg border border-white/15 bg-ink-950 p-2.5 text-xs text-haze-200">
              <option value="all">All contracts · review order</option><option value="attention">Needs attention</option><option value="failed">Failed cases</option><option value="checked">Cases checked</option><option value="needs-evidence">Needs evidence</option><option value="invalid">Invalid contracts</option>
            </select>
          </div>
          <div className="max-h-[560px] overflow-y-auto px-3 pb-4">
            {visible.length === 0 && <p className="p-3 text-sm text-haze-400">No contracts match these filters.</p>}
            {visible.map((f) => <button key={f.file} aria-pressed={active?.file === f.file} onClick={() => { setSelected(f.file); setDraft(null); }} className={`mb-2 w-full rounded-xl border p-4 text-left transition ${active?.file === f.file ? "border-violet-300/40 bg-violet-300/10" : "border-transparent hover:bg-white/5"}`}>
              <span className="block break-words text-sm font-medium text-white">{f.mission}</span>
              <span className="mt-1 block truncate font-mono text-[10px] text-haze-400" title={f.file}>{f.file}</span>
              <span className={`mt-3 inline-block rounded-md border px-2 py-1 text-[10px] ${COLOR[f.status]}`}>{LABEL[f.status]}</span>
              <span className="ml-2 text-[10px] text-haze-400">{f.tests.passed}/{f.tests.total} cases</span>
            </button>)}
          </div>
          <div className="border-t border-white/10 p-5 text-xs leading-relaxed text-haze-400">Queue order: compiler errors, failing cases, then evidence gaps. Risk is a heuristic used to break ties.</div>
        </aside>

        {!active && <p className="p-7 text-sm text-haze-400">Adjust your search or status filter to review a contract.</p>}
        {active && <div className="min-w-0 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Contract review</p><h3 className="mt-2 break-words text-2xl font-semibold text-white">{active.mission}</h3></div><span className={`rounded-lg border px-3 py-1.5 text-xs ${COLOR[active.status]}`}>{LABEL[active.status]}</span></div>
          <p className="mt-3 text-sm leading-relaxed text-haze-300">{active.goal || "This contract has no goal yet."}</p>
          <div className="mt-5 rounded-xl border border-white/10 bg-ink-950/60 p-4">
            <p className="text-xs font-semibold text-violet-200">Next review step</p>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-haze-200">{active.nextActions.map((action) => <li key={action}>{action}</li>)}</ul>
          </div>

          <div className="mt-7 flex items-center justify-between"><h4 className="text-sm font-semibold text-white">Claims → named checks</h4><span className="text-xs text-haze-400">{active.claims.length} claims</span></div>
          <div className="mt-3 space-y-2">
            {!active.claims.length && <p className="text-sm text-haze-400">No guarantees or prohibitions declared.</p>}
            {active.claims.map((c, i) => <div key={`${c.id}-${i}`} className="rounded-xl border border-white/10 p-4">
              <div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.status === "verified" ? "bg-emerald-400" : c.status === "failed" ? "bg-rose-400" : "bg-amber-300"}`} /><p className="text-sm text-haze-100">{c.text}</p></div>
              <p className="mt-2 pl-5 text-xs text-haze-400">{c.status === "verified" ? "Verified by named cases" : c.status === "unverified" ? "No verification named" : c.status === "failed" ? "Referenced cases failed" : "Verification unresolved"}</p>
              <div className="mt-2 flex flex-wrap gap-2 pl-5">{c.evidence.map((e) => e.pass === null
                ? <span key={e.name} className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-amber-200">{e.name} · unresolved</span>
                : <button key={e.name} onClick={() => { const cases = document.getElementById("atlas-cases") as HTMLDetailsElement | null; if (cases) { cases.open = true; cases.scrollIntoView({ behavior: "smooth", block: "nearest" }); } }} className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-haze-300">{e.name} · {e.cases} cases · {e.pass ? "all passed" : "contains failures"}</button>)}</div>
            </div>)}
          </div>

          <details id="atlas-cases" className="mt-5 rounded-xl border border-white/10" open={active.tests.failed > 0} key={`${active.file}-${active.tests.failed}`}>
            <summary className="cursor-pointer p-4 text-sm font-medium text-white">Executed cases <span className="ml-2 text-xs text-haze-400">{active.tests.passed}/{active.tests.total} passed</span></summary>
            <div className="space-y-2 border-t border-white/10 p-4">
              {!active.tests.total && <p className="text-sm text-amber-200">No behavior was exercised.</p>}
              {active.tests.results.map((t, i) => <div key={i} className="rounded-lg bg-white/[0.025] p-3 text-xs"><p className={t.pass ? "text-emerald-300" : "text-rose-300"}>{t.pass ? "PASS" : "FAIL"} · {t.target} / {t.case}</p><p className="mt-1 break-words font-mono text-haze-400">{t.error || `expected ${JSON.stringify(t.expected) ?? "—"} → actual ${JSON.stringify(t.actual) ?? "—"}`}</p></div>)}
            </div>
          </details>

          {!!active.diagnostics.length && <details className="mt-3 rounded-xl border border-white/10" open={active.status === "invalid"}><summary className="cursor-pointer p-4 text-sm text-white">Compiler diagnostics · {active.diagnostics.length}</summary><div className="space-y-2 px-4 pb-4">{active.diagnostics.map((d, i) => <p key={i} className={`text-xs ${d.level === "error" ? "text-rose-300" : "text-amber-200"}`}>{d.code} · {d.message}</p>)}</div></details>}

          <details className="mt-3 rounded-xl border border-white/10"><summary className="cursor-pointer p-4 text-sm text-white">Read & edit the contract</summary><div className="border-t border-white/10 p-4">
            <label htmlFor="atlas-source" className="mb-2 block text-xs text-haze-400">{active.file}</label>
            <textarea id="atlas-source" spellCheck={false} value={draft ?? source} onChange={(e) => setDraft(e.target.value)} maxLength={200000} className="h-80 w-full rounded-lg border border-white/15 bg-ink-950 p-3 font-mono text-xs leading-6 text-haze-200" />
            <div className="mt-3 flex flex-wrap items-center gap-3"><button className={BUTTON} disabled={draft === null || draft === source} onClick={() => { if (draft !== null) { setFiles(files.map((f) => f.path === active.file ? { ...f, source: draft } : f)); setDraft(null); setMessage("Edited contract evaluated. The source hash and evidence comparison have been refreshed."); } }}>Run edited contract</button><button className={BUTTON} onClick={() => download(active.file.split("/").pop() || "contract.thunder", draft ?? source)}>Download contract</button>{draft !== null && draft !== source && <span className="text-xs text-amber-200">Unrun edits · results describe the previous source</span>}</div>
          </div></details>

          <div className="mt-6 rounded-xl border border-violet-300/20 bg-violet-300/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium text-violet-200">OpenThunder snapshot</h4><span className="font-mono text-xs text-haze-300">{active.snapshot.status}</span></div>
            <p className="mt-2 text-xs leading-relaxed text-haze-300">{active.snapshot.reason}</p>
            <p className="mt-3 break-all font-mono text-[10px] text-haze-400">Source {active.sourceHash}</p>
            {evidenceName && <div className="mt-2 flex items-center gap-3 text-xs text-haze-400"><span className="break-all">{evidenceName}</span><button className="shrink-0 underline" onClick={() => { setEvidence(undefined); setEvidenceName(""); }}>Remove report</button></div>}
          </div>
        </div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-ink-950/40 p-5 sm:px-7">
        <div className="max-w-xl"><p className="text-sm font-medium text-white">Give your coding agent the evidence, not just a prompt.</p><p className="mt-1 text-xs leading-relaxed text-haze-400">The brief includes hashes, failed cases, unresolved claims, and next steps. Passing cases cover declared inputs; application behavior needs its own tests.</p></div>
        <button className="btn-primary text-sm" onClick={() => download("thunderlang-agent-brief.md", renderReviewBrief(atlas))}>Download agent brief ↗</button>
      </div>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-haze-400 sm:px-7">Compiler {atlas.compilerVersion} · <Link className="text-violet-200 underline decoration-violet-300/30 underline-offset-4" href="/docs/atlas-review">Use this workflow in your repo, CI, or MCP client</Link></div>
    </div>
  );
}
