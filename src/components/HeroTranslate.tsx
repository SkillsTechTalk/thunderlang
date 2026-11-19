"use client";

import { useMemo, useRef, useState } from "react";
import { ThunderEditor } from "@/components/ThunderEditor";
import { LanguageOutput, type OutputKey } from "@/components/LanguageOutput";
import { compileContract, type Compiled } from "@/lib/thunder-compile";

const START = `contract RefundReview
purpose Approve refunds up to $100 inside the refund window.

decision Refund(amount: number, withinWindow: boolean)
  when amount >= 0 and amount <= 100 and withinWindow -> Approve
  otherwise -> Review

examples Refund
  case "at the limit": (amount: 100, withinWindow: true) -> Approve
  case "too late": (amount: 40, withinWindow: false) -> Review
`;

/** One rule, written once, shown in six languages. Edits recompile as you type. */
export function HeroTranslate() {
  const [source, setSource] = useState(START);
  const [lang, setLang] = useState<OutputKey>("python");
  const last = useRef<Compiled | null>(null);
  const { compiled, error } = useMemo(() => {
    try {
      last.current = compileContract(source);
      return { compiled: last.current, error: "" };
    } catch (e) {
      return { compiled: last.current, error: e instanceof Error ? e.message : "This contract could not be read." };
    }
  }, [source]);
  const tests = compiled?.report.tests;
  const failing = tests ? tests.results.filter((r) => !r.pass) : [];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/15 bg-ink-900/80 shadow-panel">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <label htmlFor="hero-source" className="text-sm font-medium text-haze-100">
            You write the rule
          </label>
          <span className="font-mono text-xs text-haze-400">RefundReview.thunder</span>
        </div>
        <ThunderEditor id="hero-source" value={source} onChange={setSource} minRows={10} maxRows={14} invalid={!!error} describedBy="hero-status" />
      </div>
      <p id="hero-status" role="status" aria-live="polite" className={`text-sm ${error || failing.length ? "text-red-200" : "text-emerald-200"}`}>
        {error
          ? error
          : failing.length
            ? `Example "${failing[0].case}" fails: expected ${String(failing[0].expected)}, got ${String(failing[0].actual)}.`
            : `Both examples pass. Edit the rule and every language below follows.`}
      </p>
      <div>
        <p className="mb-2 text-sm font-medium text-haze-100">The compiler writes it in your language</p>
        {compiled && <LanguageOutput idPrefix="hero-out" code={compiled.code} active={lang} onActive={setLang} stale={!!error} maxHeight="max-h-[240px]" />}
      </div>
    </div>
  );
}
