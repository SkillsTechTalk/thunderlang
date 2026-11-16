"use client";

import { useState } from "react";
import Link from "next/link";
import { previewHumanContract } from "../../../compiler/src/human-contract.mjs";

const button = "rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300 disabled:opacity-40";

export function RefundDemo({ initialSource }: { initialSource: string }) {
  const [source, setSource] = useState(initialSource);
  const [report, setReport] = useState(() => previewHumanContract(initialSource));
  const [testedSource, setTestedSource] = useState(initialSource);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Five examples are ready. Run them to check the contract.");
  const [ran, setRan] = useState(false);
  const dirty = source !== testedSource;

  function run(next = source) {
    try {
      const result = previewHumanContract(next);
      setReport(result); setTestedSource(next); setError(""); setRan(true);
      setNotice(`${result.tests.passed} of ${result.tests.total} contract examples passed. ${result.tests.failed ? "Inspect the failed example below." : "The real application has not been checked yet."}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this contract.");
      setRan(false); setNotice("Fix the contract and run the examples again.");
    }
  }
  function download(text: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-8">
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-white/10 bg-ink-850/60 p-5 sm:p-7">
        <p className="text-sm font-semibold text-gold-300">1 · Express the rule</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">A rule the whole team can read.</h2>
        <p className="mt-3 text-haze-300">Approve a non-negative refund up to $100, within the refund window. Otherwise, send it for review.</p>
        <label htmlFor="refund-source" className="mb-2 mt-6 block text-sm text-haze-300">Edit the contract and its examples</label>
        <textarea id="refund-source" value={source} onChange={e => setSource(e.target.value)} maxLength={20000}
          spellCheck={false} className="min-h-[390px] w-full rounded-lg border border-white/20 bg-black/30 p-3 font-mono text-sm leading-6 text-haze-100 focus:outline-gold-300" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={`${button} bg-gold-400 text-ink-950 hover:bg-gold-300`} onClick={() => run()}>Run examples</button>
          <button type="button" className={button} onClick={() => { const next = initialSource.replace("amount <= 100", "amount < 100"); setSource(next); run(next); }}>Break the $100 rule</button>
          <button type="button" className={button} onClick={() => { setSource(initialSource); run(initialSource); }}>Reset</button>
        </div>
        <p className="mt-3 text-xs text-haze-400">Runs in your browser. No account, API key, or upload.</p>
      </div>
      <div className="min-w-0 rounded-2xl border border-white/10 p-5 sm:p-7">
        <p className="text-sm font-semibold text-gold-300">2 · Check the examples</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">The boundary makes the difference.</h2>
        <p role="status" aria-live="polite" className="my-4 text-haze-200">{dirty ? "Edited since the last run. Run examples to update these results." : notice}</p>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-red-200">{error}</p>}
        <ul className="space-y-3" aria-label="Contract examples">
          {report.tests.results.map((r: { case: string; pass: boolean; expected: unknown; actual: unknown }, i: number) => <li key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-white">{r.case}</span>
              <span className={!ran || dirty ? "text-haze-400" : r.pass ? "text-emerald-300" : "text-red-300"}>{!ran ? "Ready" : dirty ? "Needs rerun" : r.pass ? "Passed" : "Failed"}</span></div>
            <p className="mt-1 text-sm text-haze-300">Expected {String(r.expected)}{ran && !dirty && !error ? ` · Got ${String(r.actual)}` : ""}</p>
          </li>)}
        </ul>
        <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-haze-200"><strong className="text-amber-200">Application: not checked.</strong> These results execute the contract only. They do not establish what your service does, or cover every possible input.</div>
      </div>
    </div>
    <div className="rounded-2xl border border-gold-300/20 p-6 sm:p-8">
      <p className="text-sm font-semibold text-gold-300">3 · Test the real application</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Same rule. Independent code. Real evidence.</h2>
      <p className="mt-3 max-w-3xl text-haze-300">OpenThunder calls a small refund service using these five cases. Break only the service, and the $100 case fails while the contract still passes. Restore the service and run again.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a className={`${button} bg-gold-400 text-ink-950 hover:bg-gold-300`} href="https://openthunder.dev/docs/refund-contract.html">Try the application walkthrough →</a>
        <Link className={button} href="/docs/human-quickstart">Use the simpler language locally</Link>
      </div>
    </div>
    <details className="rounded-xl border border-white/10 p-5">
      <summary className="cursor-pointer font-medium text-white">Keep the source or explore the full language</summary>
      <p className="mt-3 text-sm text-haze-300">The shorthand lowers to ordinary ThunderLang. Existing contracts, runtime, code generators, Atlas, and Playground remain available.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={button} onClick={() => download(source, "RefundReview.thunder-human")}>Download edited source</button>
        <button type="button" className={button} disabled={dirty || !!error} onClick={() => download(report.canonicalSource, "RefundReview.thunder")}>Download compiled contract</button>
        <Link className={button} href="/playground">Open full Playground</Link>
      </div>
    </details>
  </div>;
}
