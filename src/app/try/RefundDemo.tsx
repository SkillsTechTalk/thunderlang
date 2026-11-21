"use client";

import { useState } from "react";
import Link from "next/link";
import { ThunderEditor } from "@/components/ThunderEditor";
import { previewHumanContract } from "../../../compiler/src/human-contract.mjs";

type Gtag = (command: "event", name: string, params: Record<string, string | number | boolean>) => void;
/** Record a demo run in GA4 (mark refund_demo_run as a key event: a visitor who ran the demo engaged, not bounced). */
function track(name: string, params: Record<string, string | number | boolean>) {
  (window as unknown as { gtag?: Gtag }).gtag?.("event", name, params);
}

const button = "rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300 disabled:opacity-40";

export function RefundDemo({ initialSource }: { initialSource: string }) {
  const [source, setSource] = useState(initialSource);
  const [report, setReport] = useState(() => previewHumanContract(initialSource));
  const [testedSource, setTestedSource] = useState(initialSource);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Five examples are ready. Run them to check the contract.");
  const [ran, setRan] = useState(false);
  const dirty = source !== testedSource;

  function run(next = source, how: "run" | "break" | "reset" = "run") {
    try {
      const result = previewHumanContract(next);
      setReport(result); setTestedSource(next); setError(""); setRan(true);
      track("refund_demo_run", { how, passed: result.tests.passed, failed: result.tests.failed, edited: next !== initialSource });
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
    <div className="grid min-w-0 gap-6">
      <div className="min-w-0 rounded-2xl border border-white/10 bg-ink-850/60 p-5 sm:p-7">
        <p className="text-sm font-semibold text-gold-300">1 · Express the rule</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">A rule the whole team can read.</h2>
        <p className="mt-3 text-haze-300">Approve a non-negative refund up to $100, within the refund window. Otherwise, send it for review.</p>
        <div className="mt-6 overflow-hidden rounded-xl border border-white/20 bg-black/30">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <label htmlFor="refund-source" className="text-sm font-medium text-haze-100">Edit the contract and its examples</label>
            <span className="font-mono text-xs text-haze-300">RefundReview.thunder-human</span>
          </div>
          <ThunderEditor id="refund-source" value={source} onChange={setSource} invalid={!!error}
            describedBy={error ? "refund-editor-help refund-editor-error" : "refund-editor-help"} minRows={9} />
        </div>
        <p id="refund-editor-help" className="mt-2 text-xs text-haze-300">Name each input and use -&gt; for the outcome. Long cases can wrap inside parentheses. <span className="sm:hidden">Swipe sideways to read long lines. </span>Run examples to generate the table below.</p>
        {error && <p id="refund-editor-error" role="alert" className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-red-200">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={`${button} bg-gold-400 text-ink-950 hover:bg-gold-300`} onClick={() => run()}>Run examples</button>
          <button type="button" className={button} onClick={() => { const next = initialSource.replace("amount <= 100", "amount < 100"); setSource(next); run(next, "break"); }}>Break the $100 rule</button>
          <button type="button" className={button} onClick={() => { setSource(initialSource); run(initialSource, "reset"); }}>Reset</button>
        </div>
        <p className="mt-3 text-xs text-haze-400">Runs in your browser. No account, API key, or upload.</p>
      </div>
      <div className="min-w-0 rounded-2xl border border-white/10 p-5 sm:p-7">
        <p className="text-sm font-semibold text-gold-300">2 · Check the examples</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">The boundary makes the difference.</h2>
        <p role="status" aria-live="polite" className="my-4 text-haze-200">{error ? notice : dirty ? "Edited since the last run. Run examples to update these results." : notice}</p>
        {!error && <table className="block w-full text-left text-sm sm:table" aria-label="Contract examples">
          <thead className="hidden border-b border-white/15 text-haze-300 sm:table-header-group">
            <tr>{["Example", "Inputs", "Expected", "Actual", "Result"].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody className="block space-y-3 sm:table-row-group sm:space-y-0">
            {report.tests.results.map((r, i) => <tr key={i} className={`block rounded-xl border border-white/10 p-4 sm:table-row sm:rounded-none sm:border-x-0 sm:border-t-0 sm:p-0 ${ran && !dirty && !r.pass ? "bg-red-400/[0.06]" : "bg-white/[0.02]"}`}>
              <th scope="row" className="block pb-3 font-medium text-white sm:table-cell sm:w-[27%] sm:px-3 sm:py-4">{r.case}</th>
              <td className="block pb-3 text-haze-200 sm:table-cell sm:px-3 sm:py-4">
                {Object.entries(r.given).map(([key, value]) => <span key={key} className="block break-words">
                  <span className="text-haze-300">{key.replace(/([a-z])([A-Z])/g, "$1 $2")}:</span> {value}
                </span>)}
              </td>
              <td className="block py-1 text-haze-200 sm:table-cell sm:px-3 sm:py-4"><span className="mr-2 text-haze-300 sm:hidden">Expected</span>{String(r.expected)}</td>
              <td className="block py-1 text-haze-200 sm:table-cell sm:px-3 sm:py-4"><span className="mr-2 text-haze-300 sm:hidden">Actual</span>{ran && !dirty && !error ? String(r.actual) : "Not run"}</td>
              <td className="block pt-2 font-medium sm:table-cell sm:px-3 sm:py-4">
                <span className={!ran || dirty ? "text-haze-300" : r.pass ? "text-emerald-300" : "text-red-300"}>{!ran ? "Ready" : dirty ? "Needs rerun" : r.pass ? "Passed" : "Failed"}</span>
              </td>
            </tr>)}
          </tbody>
        </table>}
        {ran && !dirty && !error && report.tests.failed > 0 && <div className="mt-5 rounded-lg border border-gold-300/30 bg-gold-300/5 p-4 text-sm text-haze-200" data-placement="try:caught-failure">
          <strong className="text-gold-200">That is the mistake that slips through review.</strong> A one-character change broke a rule nobody re-read.
          <span className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <a className="font-medium text-gold-300 underline-offset-4 hover:underline" href="https://openthunder.dev">Catch it on every pull request with OpenThunder ↗</a>
            <a className="font-medium text-gold-300 underline-offset-4 hover:underline" href="https://skillstechtalk.com">Practice explaining this decision in an interview ↗</a>
          </span>
        </div>}
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
      {(dirty || error) && <p className="mt-2 text-sm text-haze-300">Run the examples successfully to enable the compiled contract download.</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={button} onClick={() => download(source, "RefundReview.thunder-human")}>Download edited source</button>
        <button type="button" className={button} disabled={dirty || !!error} onClick={() => download(report.canonicalSource, "RefundReview.thunder")}>Download compiled contract</button>
        <Link className={button} href="/playground">Open full Playground</Link>
      </div>
    </details>
  </div>;
}
