"use client";

import { useState } from "react";
import type { PlainModel } from "../../compiler/src/plain-contract.d.mts";
import { HighlightedCode } from "@/lib/highlight";
import { RulePictureStatic } from "@/app/try/RuleVisual";
import type { CodeLang } from "@/lib/code-tokens";

export type ThunderedSample = { key: string; label: string; lang: string; source: string; model: PlainModel | null; inferred: boolean };

const HIGHLIGHT: Record<string, CodeLang> = { python: "python", typescript: "typescript", javascript: "typescript", java: "java", csharp: "csharp", go: "go", rust: "rust", kotlin: "java", php: "typescript", ruby: "python" };

/** One refund rule in every language Thunder reads. Pick a language; the Thunder picture stays the same. */
export function ThunderedTabs({ samples }: { samples: ThunderedSample[] }) {
  const [active, setActive] = useState(samples[0].key);
  const s = samples.find((x) => x.key === active) ?? samples[0];
  return (
    <div>
      <div role="tablist" aria-label="Choose a language" className="flex flex-wrap gap-1.5">
        {samples.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={x.key === active} aria-controls="thundered-panel" onClick={() => setActive(x.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 ${x.key === active ? "border-gold-300/60 bg-gold-300/15 text-white" : "border-white/15 text-haze-300 hover:border-white/30 hover:text-white"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div id="thundered-panel" role="tabpanel" className="mt-5 grid gap-4 lg:grid-cols-2">
        <figure className="min-w-0 rounded-2xl border border-white/10 bg-ink-850/40 p-6">
          <figcaption className="text-sm font-semibold text-white">Original {s.label}</figcaption>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-4 font-mono text-[12px] leading-6 text-haze-200"><code><HighlightedCode source={s.source} lang={HIGHLIGHT[s.key] ?? "typescript"} /></code></pre>
          <p className="mt-3 text-xs text-haze-400">Your code stays the source of truth.</p>
        </figure>
        <figure className="min-w-0 rounded-2xl border border-gold-300/40 bg-gradient-to-b from-gold-400/[0.07] to-transparent p-6 shadow-[0_30px_100px_-50px_rgba(167,139,250,0.6)]">
          <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-white">Thundered {s.label}
            <span className="flex flex-wrap gap-2 text-xs font-normal">
              <span className="rounded-full border border-white/20 px-2 py-0.5 text-haze-200">Read in Thunder: yes</span>
              <span className="rounded-full border border-dashed border-white/25 px-2 py-0.5 text-haze-300">Update the code from here: not yet</span>
            </span>
          </figcaption>
          <div className="mt-4">{s.model ? <RulePictureStatic model={s.model} /> : <p className="text-sm text-haze-300">Thunder could not draw this one.</p>}</div>
          <p className="mt-4 text-xs text-haze-400">
            Drawn live by the Thunder code reader. Read from code: a person still confirms what it should mean.
            {s.inferred && ` ${s.label} doesn't declare types, so Thunder inferred them from how the rule uses each input.`}
          </p>
        </figure>
      </div>
    </div>
  );
}
