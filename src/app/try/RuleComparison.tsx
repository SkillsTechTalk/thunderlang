import { ContractGlyph, DecisionGlyph, ExampleGlyph, Outcome } from "./Glyphs";
import { AnswerView, RulePictureStatic } from "./RuleVisual";
import { HighlightedCode, HighlightedPlain, HighlightedSource } from "@/lib/highlight";
import { PLAIN_ROLES } from "@/lib/plain-tokens";
import { readCode } from "../../../compiler/src/read.mjs";
import { explainPlain, plainFromReading } from "../../../compiler/src/plain-contract.mjs";
import type { PlainModel } from "../../../compiler/src/plain-contract.d.mts";

const PYTHON = `def Refund(amount: float, withinWindow: bool) -> str:
    if (((amount >= 0) and (amount <= 100)) and withinWindow):
        return "Approve"
    return "Review"`;

const box = "flex min-w-0 flex-col rounded-2xl border p-5";
const pre = "mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[12px] leading-6 text-haze-200";

function Needs({ items }: { items: string[] }) {
  return <><p className="mt-4 text-sm font-medium text-haze-200">To read it, you need to know:</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-haze-300">{items.map(d => <li key={d}>{d}</li>)}</ul></>;
}

/** Python next to the same Python, thundered into the visual language. The visual is the product. */
export function RuleComparison({ compact, plain }: { compact: string; plain: string }) {
  const item = readCode(PYTHON, { language: "python" }).items[0];
  const lifted = plainFromReading(item) as (PlainModel & { needsReview: string[] }) | null;
  const probe = { amount: 100, withinWindow: true };
  return <div>
    <div className="grid gap-4 lg:grid-cols-2">
      <figure className={`${box} border-white/10`}>
        <figcaption><p className="font-semibold text-white">Original Python</p><p className="mt-1 text-sm text-haze-300">What an engineer wrote. This stays the source of truth.</p></figcaption>
        <pre className={`${pre} mt-4`}><code><HighlightedCode source={PYTHON} lang="python" /></code></pre>
        <Needs items={["def, return, -> str", "float, bool", ">=, <=, nested ( )", "withinWindow (camelCase)", "Is exactly $100 approved? Read <= carefully"]} />
      </figure>
      <figure className={`${box} border-gold-300/30`}>
        <figcaption><p className="font-semibold text-white">Thundered Python</p>
          <p className="mt-1 text-sm text-haze-300">Thunder read the code on the left and drew it. Nothing was redrawn by hand.</p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/20 px-2 py-0.5 text-haze-200">Read in Thunder: yes</span><span className="rounded-full border border-dashed border-white/25 px-2 py-0.5 text-haze-300">Update the Python from here: not yet</span></p></figcaption>
        {lifted ? <div className="mt-4 space-y-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <RulePictureStatic model={lifted} />
          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 flex items-center gap-2 text-sm text-haze-300"><ExampleGlyph />Ask it:</p>
            <AnswerView model={lifted} values={probe} explanation={explainPlain(lifted, probe)} context={plain} />
          </div>
        </div> : <p className="mt-4 rounded-xl border border-dashed border-white/25 p-4 text-sm text-haze-300">{item?.says ?? "This code could not be read."}</p>}
        <Needs items={["Rules are checked from the top", "Words like “at least” and “at most”"]} />
        {lifted && <div className="mt-4 rounded-lg border border-dashed border-white/25 p-3 text-sm text-haze-300">
          <p className="font-medium text-haze-100">Read from code, so a person still decides:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{lifted.needsReview.map(n => <li key={n}>{n}</li>)}</ul>
          <p className="mt-2">Thunder shows what the code does today. Only a person can say whether that is what the team wants. The card at the top is this rule after someone answered.</p>
        </div>}
      </figure>
    </div>

    <p aria-label="Code in any language is Thundered into a picture. The picture is stored as Thunder Text and compiled by the Thunder compiler into code in any language." className="mt-6 flex flex-wrap items-center gap-2 text-sm">
      {["Python · C# · Java · Go …", "Thunder", "Thunder Text", "Python · C# · Java · Go …"].map((step, i) => <span key={i} className="flex items-center gap-2">
        {i > 0 && <span aria-hidden="true" className="text-haze-400">→</span>}
        <span className={`rounded-md border px-2 py-1 ${step === "Thunder" ? "border-gold-300/50 font-semibold text-white" : "border-white/15 text-haze-300"}`}>{step}</span>
      </span>)}
    </p>

    <div className="mt-6 rounded-2xl border border-white/10 p-5">
      <p className="font-semibold text-white">Four shapes. Words always sit beside them.</p>
      <ul className="mt-3 grid gap-3 text-sm text-haze-200 sm:grid-cols-2 lg:grid-cols-4">
        <li className="flex items-center gap-2"><ContractGlyph className="h-5 w-5" /><span><strong className="text-white">Square</strong>: a contract you can open</span></li>
        <li className="flex items-center gap-2"><DecisionGlyph className="h-5 w-5" /><span><strong className="text-white">Diamond</strong>: a choice happens here</span></li>
        <li className="flex items-center gap-2"><Outcome>Label</Outcome><span>an outcome</span></li>
        <li className="flex items-center gap-2"><ExampleGlyph className="h-5 w-5" /><span><strong className="text-white">Ticket</strong>: an example you can run</span></li>
      </ul>
      <p className="mt-5 font-semibold text-white">Each color is one kind of word.</p>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(PLAIN_ROLES).map(r => <li key={r.label} className="text-haze-300"><span className={`${r.cls} font-medium`}>{r.sample}</span> · {r.label.toLowerCase()}</li>)}
      </ul>
      <p className="mt-3 text-xs text-haze-400">Green ✓ and red ✗ mean only passes or fails. A dashed outline means “not established yet”.</p>
    </div>

    <details className="mt-6 rounded-2xl border border-white/10 p-5">
      <summary className="cursor-pointer font-medium text-haze-200">How Thunder is stored (for engineers)</summary>
      <p className="mt-2 max-w-3xl text-sm text-haze-300">You never need to read this. It is Thunder saved as text so it can be versioned, reviewed in pull requests, and compiled.</p>
      <pre className={pre}><code><HighlightedPlain source={plain} /></code></pre>
      <p className="mt-4 text-sm text-haze-300">The earlier compact notation, for comparison:</p>
      <pre className={pre}><code><HighlightedSource source={compact} /></code></pre>
    </details>
    <p className="mt-4 text-sm text-haze-400">Whether Thunder is easier for non-programmers than Python is a hypothesis we have not tested yet. The next step is timing real readers on “What happens to exactly $100?”</p>
  </div>;
}
