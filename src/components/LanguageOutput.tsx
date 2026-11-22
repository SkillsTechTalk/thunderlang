"use client";

import { useState } from "react";
import { HighlightedCode, HighlightedSource } from "@/lib/highlight";
import type { CodeLang } from "@/lib/code-tokens";

export const OUTPUT_TABS: { key: CodeLang | "thunder"; label: string }[] = [
  { key: "typescript", label: "TypeScript" },
  { key: "python", label: "Python" },
  { key: "go", label: "Go" },
  { key: "rust", label: "Rust" },
  { key: "csharp", label: "C#" },
  { key: "java", label: "Java" },
  { key: "thunder", label: "Thunder source" },
];

export type OutputKey = (typeof OUTPUT_TABS)[number]["key"];

/**
 * Generated code for one contract, one language at a time. `code` maps each tab to its source.
 * When `stale` is set, the editor's latest text did not compile and this is the last good version.
 */
export function LanguageOutput({
  idPrefix,
  code,
  active,
  onActive,
  stale,
  maxHeight = "max-h-[460px]",
}: {
  idPrefix: string;
  code: Record<OutputKey, string>;
  active: OutputKey;
  onActive: (key: OutputKey) => void;
  stale?: boolean;
  maxHeight?: string;
}) {
  const [copied, setCopied] = useState(false);
  const label = OUTPUT_TABS.find((t) => t.key === active)?.label ?? "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(code[active]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function onKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = OUTPUT_TABS[(i + dir + OUTPUT_TABS.length) % OUTPUT_TABS.length];
    onActive(next.key);
    document.getElementById(`${idPrefix}-tab-${next.key}`)?.focus();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-ink-900/80">
      <div className="flex items-center gap-2 border-b border-white/10 pr-2">
        <div role="tablist" aria-label="Generated language" className="flex min-w-0 flex-1 overflow-x-auto">
          {OUTPUT_TABS.map((t, i) => (
            <button
              key={t.key}
              id={`${idPrefix}-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={active === t.key}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={active === t.key ? 0 : -1}
              onClick={() => onActive(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-300 ${
                active === t.key ? "border-gold-300 text-white" : "border-transparent text-haze-300 hover:text-haze-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-haze-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
        >
          <span aria-live="polite">{copied ? `Copied ${label}` : "Copy"}</span>
        </button>
      </div>
      {stale && (
        <p className="border-b border-amber-300/20 bg-amber-300/5 px-4 py-2 text-xs text-amber-200">
          Showing the last version that compiled. Fix the error under the editor to update it.
        </p>
      )}
      <pre
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${active}`}
        tabIndex={0}
        className={`${maxHeight} overflow-auto p-4 font-mono text-[12.5px] leading-6 text-haze-200 sm:text-[13px] ${stale ? "opacity-60" : ""}`}
      >
        {active === "thunder" ? <HighlightedSource source={code.thunder} /> : <HighlightedCode source={code[active]} lang={active} />}
      </pre>
    </div>
  );
}
