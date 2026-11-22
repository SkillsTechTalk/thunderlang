"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseIntent } from "../../compiler/src/parse.mjs";
import { resolveObligations } from "../../compiler/src/obligations.mjs";
import { starterContract } from "@/lib/starter-contract";

export function ContractLab() {
  const [broken, setBroken] = useState(false);
  const [explored, setExplored] = useState(false);
  const source = starterContract(broken);
  const { tests } = useMemo(
    () => resolveObligations(parseIntent(source)),
    [source],
  );
  const download = () => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "RefundReview.thunder";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div
      id="contract-lab"
      className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/15 bg-ink-900 shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-6 py-4">
        <span className="font-mono text-xs text-haze-300">
          RefundReview.thunder
        </span>
        <span className="flex items-center gap-2 text-xs text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Running
          in your browser · no AI
        </span>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-300">
          An easy mistake to miss
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Does “up to $100” include $100?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-haze-300">
          Change one character. See which customer would get the wrong decision.
        </p>
        <div className="my-5 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-sm leading-7 text-haze-200">
          <div>rule eligible</div>
          <div className="pl-4">
            when amount{" "}
            <mark
              className={`rounded px-1.5 py-0.5 font-bold ${broken ? "bg-red-400/15 text-red-200" : "bg-emerald-400/15 text-emerald-200"}`}
            >
              {broken ? "<" : "<="}
            </mark>{" "}
            100
          </div>
          <div className="pl-4 text-haze-400">
            and amount &gt;= 0 and withinWindow == true
          </div>
          <div className="pl-4">return Approve</div>
        </div>
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => {
            setBroken(!broken);
            setExplored(true);
          }}
        >
          {broken
            ? "Fix the boundary →"
            : explored
              ? "Break it again: use < instead of ≤"
              : "Break the rule: change ≤ to <"}
        </button>
        <div
          aria-live="polite"
          aria-atomic="true"
          className={`mt-5 rounded-xl border p-4 ${tests.ok ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-red-400/30 bg-red-400/[0.06]"}`}
        >
          <p
            className={`font-semibold ${tests.ok ? "text-emerald-300" : "text-red-300"}`}
          >
            {tests.ok
              ? `✓ ${tests.passed} of ${tests.total} cases pass${explored ? " · boundary repaired" : ""}`
              : `✕ ${tests.failed} case fails · exactly $100`}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-haze-200">
            {tests.ok
              ? "Eligible refunds include the limit. Larger, negative, or late requests go to review."
              : "Expected Approve. Got Review. The strict < condition excludes $100, so the default rule takes over."}
          </p>
        </div>
        <details className="mt-4 text-sm text-haze-300">
          <summary className="cursor-pointer py-2 font-medium text-haze-200">
            Inspect all {tests.total} results and the source
          </summary>
          <ul className="mt-2 space-y-2">
            {tests.results.map((r) => (
              <li
                key={r.case}
                className="flex items-start justify-between gap-3 border-b border-white/[0.06] py-2"
              >
                <span>
                  {r.pass ? "✓" : "✕"} {r.case}
                </span>
                <span className={r.pass ? "text-emerald-300" : "text-red-300"}>
                  {String(r.actual)}
                </span>
              </li>
            ))}
          </ul>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-black/25 p-3 text-xs leading-relaxed">
            {source}
          </pre>
        </details>
        <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
          <button
            type="button"
            onClick={download}
            className="font-medium text-gold-300 underline underline-offset-4"
          >
            Download this contract
          </button>
          <Link
            href="/docs/using-with-openthunder"
            className="font-medium text-haze-100 hover:text-gold-300"
          >
            Use in OpenThunder →
          </Link>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-haze-400">
          These tests exercise the declared policy, not your application code.
          They cover five inputs, not every possible refund.
        </p>
      </div>
    </div>
  );
}
