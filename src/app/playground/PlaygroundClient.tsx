"use client";

import { useState } from "react";
import { IntentCode } from "@/components/IntentCode";
import {
  heroExample,
  layerTyped,
  architectureExample,
  apiExample,
  eventExample,
} from "@/lib/content";

const samples = [
  { label: "Mission", code: heroExample },
  { label: "Typed mission", code: layerTyped },
  { label: "Service", code: architectureExample },
  { label: "API", code: apiExample },
  { label: "Event", code: eventExample },
];

export function PlaygroundClient() {
  const [code, setCode] = useState(heroExample);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-haze-400">
            Load a sample
          </span>
          {samples.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setCode(s.code)}
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
          className="h-[520px] w-full resize-none rounded-2xl border border-white/10 bg-ink-900/80 p-5 font-mono text-[13px] leading-relaxed text-haze-100 outline-none focus:border-gold-300/40"
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-haze-400">
            Highlighted preview
          </span>
          <span className="rounded-full border border-gold-300/25 bg-gold-300/[0.06] px-2.5 py-0.5 text-[11px] text-gold-200">
            No execution yet
          </span>
        </div>
        <IntentCode code={code} filename="playground.intent" />
        <p className="mt-3 text-xs leading-relaxed text-haze-500">
          This preview only formats and highlights your draft. There is no
          compiler or runtime behind it yet. Nothing is executed, sent, or
          saved. It stays entirely in your browser.
        </p>
      </div>
    </div>
  );
}
