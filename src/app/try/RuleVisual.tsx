// Read-only pieces of the visual language, shared by the interactive card and the
// Python comparison so both show exactly the same picture. No hooks: safe on the server.
import type { PlainExplanation, PlainModel } from "../../../compiler/src/plain-contract.d.mts";
import { conditionText, formatValue } from "../../../compiler/src/plain-contract.mjs";
import { HighlightedPlainPhrase } from "@/lib/highlight";
import { DecisionGlyph, Outcome } from "./Glyphs";

/** "$100, on time" with each value in its color. */
export function RequestWords({ model, values }: { model: PlainModel; values: Record<string, number | boolean | string> }) {
  return <span>{model.inputs.map((input, i) => <span key={input.id}>{i > 0 && ", "}<span className={input.kind === "yesno" ? "tok-id" : "tok-num"}>{formatValue(input, values[input.id])}</span></span>)}</span>;
}

/** The answer to one request, and the checks that decided it, as readable sentences. */
export function AnswerView({ model, values, explanation, context }: { model: PlainModel; values: Record<string, number | boolean | string>; explanation: PlainExplanation; context: string }) {
  const decided = explanation.ruleIndex >= 0;
  const rules = decided ? [explanation.rules[explanation.ruleIndex]] : explanation.rules;
  return <div>
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg text-white">
      <RequestWords model={model} values={values} /> <span aria-hidden="true" className="text-haze-400">→</span><span className="sr-only">gets</span> <Outcome>{explanation.outcome ?? "No answer"}</Outcome>
    </p>
    <p className="mt-2 text-sm text-haze-300">{decided ? "Because all of these are true:" : "Because a rule above did not fit, so “otherwise” decides:"}</p>
    <ul className="mt-1 space-y-1 text-[15px]">
      {rules.flatMap(r => r.checks.map((c, i) => <li key={`${r.outcome}-${i}`} className="flex gap-2">
        <span aria-hidden="true" className={c.ok ? "text-emerald-300" : "text-red-300"}>{c.ok ? "✓" : "✗"}</span>
        <span className={c.ok ? "" : "font-medium"}>
          <span className="sr-only">{c.ok ? "True:" : "Not true:"}</span>{" "}
          <HighlightedPlainPhrase context={context || renderContext(model)} phrase={c.text} />
          {model.inputs.find(x => x.id === c.input)?.kind !== "yesno" && <span className="text-haze-400"> (it is {c.actual})</span>}
        </span>
      </li>))}
    </ul>
  </div>;
}

/** The rule as a picture with nothing to click: words in their colors, shapes beside them. */
export function RulePictureStatic({ model }: { model: PlainModel }) {
  const context = renderContext(model);
  return <div>
    <p className="flex items-center gap-2 font-semibold"><DecisionGlyph /><span className="tok-fn">{model.question}</span></p>
    <div className="mt-3 space-y-3 border-l border-white/15 pl-5 text-[15px]">
      {model.rules.map((r, ri) => <div key={ri}>
        <p className="flex flex-wrap items-center gap-2"><Outcome>{r.outcome}</Outcome>
          <span className="tok-key">{r.conditions.length > 1 ? `when ${r.join} of these ${r.join === "all" ? "are" : "is"} true` : "when"}</span></p>
        <ul className="mt-2 space-y-1 pl-5">
          {r.conditions.map((c, ci) => <li key={ci}><HighlightedPlainPhrase context={context} phrase={conditionText(model, c)} /></li>)}
        </ul>
      </div>)}
      <p className="flex flex-wrap items-center gap-2"><span className="tok-key">Otherwise,</span> <Outcome>{model.otherwise}</Outcome></p>
    </div>
  </div>;
}

// Vocabulary for coloring phrases (input names, outcomes), without a full render.
function renderContext(model: PlainModel) {
  return ["x", "We need", ...model.inputs.map(i => (i.kind === "yesno" ? `  whether it is ${i.yes} or ${i.no}` : `  ${i.label}, x`)), model.question,
    ...model.rules.map(r => `  ${r.outcome} when x`), `  Otherwise, ${model.otherwise}.`].join("\n");
}
