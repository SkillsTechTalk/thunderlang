"use client";

import { useMemo, useState } from "react";
import { explainPlain, parsePlainContract, previewPlainContract } from "../../compiler/src/plain-contract.mjs";
import type { PlainCondition, PlainModel } from "../../compiler/src/plain-contract.d.mts";
import { LanguageOutput, type OutputKey } from "@/components/LanguageOutput";
import { compileContract } from "@/lib/thunder-compile";
import { ConditionRow } from "@/app/try/PlainRuleCard";
import { AnswerView } from "@/app/try/RuleVisual";
import { ContractGlyph, DecisionGlyph, ExampleGlyph, Outcome } from "@/app/try/Glyphs";

/** The home page's first impression: a rule read in Thunder, asked one question, then compiled. */
export function HeroThunder({ source }: { source: string }) {
  const initial = useMemo(() => parsePlainContract(source), [source]);
  const [model, setModel] = useState<PlainModel>(initial);
  const [lang, setLang] = useState<OutputKey>("python");
  const preview = useMemo(() => previewPlainContract(model), [model]);
  const compiled = useMemo(() => compileContract(preview.canonicalSource), [preview.canonicalSource]);
  const probe = initial.examples.find(e => e.name === "exactly at the limit")?.values ?? initial.examples[0].values;
  const failing = preview.tests.results.filter(r => !r.pass);
  const edited = JSON.stringify(model) !== JSON.stringify(initial);
  const update = (ri: number, ci: number, c: PlainCondition) => {
    const next: PlainModel = JSON.parse(JSON.stringify(model)); next.rules[ri].conditions[ci] = c; setModel(next);
  };

  return <div className="space-y-3">
    <div className="rounded-xl border border-white/15 bg-ink-900/80 p-5 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-haze-100">You read the rule in Thunder</p>
        {edited && <button type="button" onClick={() => setModel(initial)} className="text-xs text-haze-300 underline-offset-4 hover:underline">Reset</button>}
      </div>
      <h2 className="mt-3 flex items-center gap-2 text-lg font-semibold text-white"><ContractGlyph />{model.title}</h2>
      <p className="mt-3 flex items-center gap-2 font-semibold"><DecisionGlyph /><span className="tok-fn">{model.question}</span></p>
      <div className="mt-2 space-y-2 border-l border-white/15 pl-4 text-[15px] text-haze-100">
        {model.rules.map((r, ri) => <div key={ri}>
          <p className="flex flex-wrap items-center gap-2"><Outcome>{r.outcome}</Outcome><span className="tok-key">when {r.join} of these {r.join === "all" ? "are" : "is"} true</span></p>
          <ul className="mt-2 space-y-1.5 pl-4">{r.conditions.map((c, ci) => <ConditionRow key={ci} model={model} c={c} onChange={n => update(ri, ci, n)} />)}</ul>
        </div>)}
        <p className="flex flex-wrap items-center gap-2"><span className="tok-key">Otherwise,</span> <Outcome>{model.otherwise}</Outcome></p>
      </div>
      <div aria-live="polite" className="mt-4 border-t border-white/10 pt-4">
        <p className="mb-2 flex items-center gap-2 text-sm text-haze-300"><ExampleGlyph />Ask it:</p>
        <AnswerView model={model} values={probe} explanation={explainPlain(model, probe)} context={preview.plainSource} />
      </div>
    </div>
    <p role="status" aria-live="polite" className={`text-sm ${failing.length ? "text-red-200" : "text-emerald-200"}`}>
      {failing.length
        ? `Example "${failing[0].name}" now fails: expected ${String(failing[0].expected)}, the rule gives ${String(failing[0].actual)}.`
        : `All ${preview.tests.total} examples pass. Click a highlighted word to change the rule; every language below follows.`}
    </p>
    <div>
      <p className="mb-2 text-sm font-medium text-haze-100">The Thunder compiler writes it in your language</p>
      <LanguageOutput idPrefix="hero-out" code={compiled.code} active={lang} onActive={setLang} stale={false} maxHeight="max-h-[220px]" />
    </div>
  </div>;
}
