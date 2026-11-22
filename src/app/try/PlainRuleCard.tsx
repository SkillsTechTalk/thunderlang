"use client";

import { useId, useMemo, useState } from "react";
import {
  COMPARISONS, explainPlain, formatValue, outcomesOf, parsePlainContract, previewPlainContract,
} from "../../../compiler/src/plain-contract.mjs";
import type { PlainCondition, PlainInput, PlainModel } from "../../../compiler/src/plain-contract.d.mts";
import { parseIntent } from "../../../compiler/src/parse.mjs";
import { toPython } from "../../../compiler/src/codegen.mjs";
import { ContractGlyph, DecisionGlyph, ExampleGlyph, Outcome } from "./Glyphs";
import { AnswerView } from "./RuleVisual";
import { ThunderEditor } from "@/components/ThunderEditor";
import { HighlightedCode, HighlightedPlain, HighlightedSource } from "@/lib/highlight";
import type { ReactNode } from "react";

type Gtag = (command: "event", name: string, params: Record<string, string | number | boolean>) => void;
function track(name: string, params: Record<string, string | number | boolean>) {
  (window as unknown as { gtag?: Gtag }).gtag?.("event", name, params);
}

type View = "picture" | "plain" | "source" | "python";
const VIEWS: Array<[View, string]> = [["picture", "Thunder"], ["plain", "Thunder Text"], ["source", "Thunder source"], ["python", "Python"]];
// Editable words keep their syntax color; the box around them says "you can change this".
const control = "rounded-md border border-white/25 bg-white/[0.06] px-2 py-1 font-semibold hover:border-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300";
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = (m: PlainModel): PlainModel => JSON.parse(JSON.stringify(m));
const values = (m: PlainModel, v: Record<string, number | boolean>) => m.inputs.map(i => formatValue(i, v[i.id])).join(", ");

/** A number box that only commits finite numbers, so typing "-" or clearing never corrupts the rule. */
function NumberBox({ value, dollars, label, onCommit }: { value: number; dollars: boolean; label: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) { setSeen(value); setText(String(value)); }
  return <span className={`${control} tok-num inline-flex items-center gap-0.5`}>
    {dollars && <span aria-hidden="true">$</span>}
    <input aria-label={label} inputMode="decimal" value={text} size={Math.max(2, text.length)}
      className="w-auto bg-transparent outline-none"
      onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onCommit(n); }}
      onBlur={() => setText(String(value))} />
  </span>;
}

export function ConditionRow({ model, c, onChange }: { model: PlainModel; c: PlainCondition; onChange: (c: PlainCondition) => void }) {
  const input = model.inputs.find(i => i.id === c.input) as PlainInput;
  if (input.kind === "yesno") {
    return <li className="flex flex-wrap items-center gap-2"><span className="tok-key-soft">it is</span>
      <select aria-label={`Condition on ${input.yes} or ${input.no}`} className={`${control} tok-id`} value={c.value ? "yes" : "no"}
        onChange={e => onChange({ ...c, value: e.target.value === "yes" })}>
        <option value="yes">{input.yes}</option><option value="no">{input.no}</option>
      </select>
    </li>;
  }
  return <li className="flex flex-wrap items-center gap-2"><span className="tok-id">{input.label}</span> <span className="tok-key-soft">is</span>
    <select aria-label={`How ${input.label} compares`} className={`${control} tok-op`} value={c.op} onChange={e => onChange({ ...c, op: e.target.value as PlainCondition["op"] })}>
      {COMPARISONS.map(x => <option key={x.op} value={x.op}>{x.words[0]}</option>)}
    </select>
    <NumberBox value={c.value as number} dollars={input.kind === "dollars"} label={`Limit for ${input.label}`} onCommit={n => onChange({ ...c, value: n })} />
  </li>;
}

export function PlainRuleCard({ initialSource, breadcrumb }: { initialSource: string; breadcrumb: string[] }) {
  const initial = useMemo(() => parsePlainContract(initialSource), [initialSource]);
  const [model, setModel] = useState<PlainModel>(initial);   // applied rule
  const [draft, setDraft] = useState<PlainModel>(initial);   // rule with unapplied edits
  const [view, setView] = useState<View>("picture");
  const [text, setText] = useState(initialSource);
  const [textError, setTextError] = useState("");
  const [probe, setProbe] = useState<Record<string, number | boolean>>(() => ({ ...initial.examples[1]?.values ?? {} }));
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const ids = useId();

  const applied = useMemo(() => previewPlainContract(model), [model]);
  const proposed = useMemo(() => previewPlainContract(draft), [draft]);
  const pending = !same(model, draft);
  const changed = proposed.tests.results.filter((r, i) => applied.tests.results[i] && r.actual !== applied.tests.results[i].actual);
  const failing = proposed.tests.results.filter(r => !r.pass);
  const explanation = useMemo(() => explainPlain(draft, probe), [draft, probe]);
  const python = useMemo(() => toPython(parseIntent(proposed.canonicalSource)), [proposed.canonicalSource]);
  const examplesOpen = open || failing.length > 0;

  function edit(next: PlainModel) { setDraft(next); setText(previewPlainContract(next).plainSource); setTextError(""); setNotice(""); }
  function apply() {
    setModel(draft);
    track("plain_card_apply", { failed: failing.length, changed: changed.length });
    setNotice(failing.length ? `Change applied. ${failing.length} example${failing.length > 1 ? "s" : ""} now fail${failing.length > 1 ? "" : "s"}: fix the rule or update the example on purpose.` : "Change applied. Every example still passes.");
  }
  function undo() { edit(model); setNotice("Change discarded. The rule is back to what it was."); }
  function reset() { setModel(initial); edit(initial); setProbe({ ...initial.examples[1]?.values ?? {} }); setNotice("Reset to the original refund rule."); }
  function onText(next: string) {
    setText(next);
    try { const m = parsePlainContract(next); setDraft(m); setTextError(""); }
    catch (e) { setTextError(e instanceof Error ? e.message : "This text could not be read."); }
  }
  function saveExample() {
    const outcome = explanation.outcome ?? draft.otherwise;
    let name = `tried ${values(draft, probe)}`; let n = 2;
    while (draft.examples.some(e => e.name === name)) name = `tried ${values(draft, probe)} ${n++}`;
    const add = (m: PlainModel) => ({ ...clone(m), examples: [...m.examples, { name, values: { ...probe }, expected: outcome }] });
    const nextDraft = add(draft);
    if (!pending) setModel(add(model));
    edit(nextDraft); setOpen(true);
    setNotice(`Saved "${name}" as an example that expects ${outcome}.`);
  }
  const updateCondition = (ri: number, ci: number, c: PlainCondition) => {
    const next = clone(draft); next.rules[ri].conditions[ci] = c; edit(next);
  };

  return <div className="rounded-2xl border border-white/15 bg-ink-850/60 p-5 sm:p-7">
    <p className="text-sm text-haze-300">{breadcrumb.join(" › ")}</p>
    <h3 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white"><ContractGlyph className="h-5 w-5" />{draft.title}</h3>
    {draft.why && <p className="mt-1 text-haze-300"><span className="text-haze-400">Why: </span>{draft.why.replace(/^./, c => c.toLowerCase())}</p>}


    <section aria-labelledby="{`${ids}-ask`}" className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">1 · Ask the rule</p>
      <h4 id={`${ids}-ask`} className="mt-1 flex items-center gap-2 font-semibold text-white"><ExampleGlyph />What happens to this refund? {pending && <span className="text-xs font-normal text-haze-400">(using your unapplied change)</span>}</h4>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {draft.inputs.map(input => input.kind === "yesno"
          ? <fieldset key={input.id} className="flex rounded-lg border border-white/15 p-0.5">
              <legend className="sr-only">{input.yes} or {input.no}</legend>
              {[true, false].map(v => <label key={String(v)} className={`cursor-pointer rounded-md px-3 py-1 text-sm ${probe[input.id] === v ? "bg-white/15 text-white" : "text-haze-300"}`}>
                <input type="radio" className="sr-only" name={`${ids}-${input.id}`} checked={probe[input.id] === v} onChange={() => setProbe({ ...probe, [input.id]: v })} />
                {v ? input.yes : input.no}
              </label>)}
            </fieldset>
          : <NumberBox key={input.id} value={probe[input.id] as number} dollars={input.kind === "dollars"} label={`Try ${input.label}`} onCommit={n => setProbe({ ...probe, [input.id]: n })} />)}
      </div>
      <div aria-live="polite" className="mt-4">
        <AnswerView model={draft} values={probe} explanation={explanation} context={proposed.plainSource} />
        <button type="button" className={`${button} mt-4`} onClick={saveExample}>Save as an example</button>
      </div>
    </section>

    <section aria-labelledby={`${ids}-change`} className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">2 · Change the rule</p>
          <p id={`${ids}-change`} className="mt-1 text-sm text-haze-300">Click a highlighted word to change it. Nothing applies until you confirm.</p>
        </div>
      <div role="tablist" aria-label="How to show this rule" className="flex flex-wrap gap-1 rounded-lg border border-white/10 p-1">
        {VIEWS.map(([key, label]) => <button key={key} role="tab" type="button" aria-selected={view === key} aria-controls={`${ids}-panel`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${view === key ? "bg-white/15 text-white" : "text-haze-300 hover:text-white"}`}
          onClick={() => { setView(key); track("plain_card_view", { view: key }); }}>{label}</button>)}
      </div>
      </div>
    <div id={`${ids}-panel`} role="tabpanel" className="mt-4">
      {view === "picture" && <>
        <h4 className="flex items-center gap-2 font-semibold"><DecisionGlyph /><span className="tok-fn">{draft.question}</span></h4>
        <div className="mt-3 space-y-4 border-l border-white/15 pl-5 text-haze-100">
          {draft.rules.map((r, ri) => <div key={ri}>
            <p className="flex flex-wrap items-center gap-2"><Outcome>{r.outcome}</Outcome> <span className="tok-key">when</span>
              {r.conditions.length > 1
                ? <select aria-label="Do all conditions need to be true, or any one?" className={`${control} tok-key`} value={r.join}
                    onChange={e => { const next = clone(draft); next.rules[ri].join = e.target.value as "all" | "any"; edit(next); }}>
                    <option value="all">all of these are true</option><option value="any">any of these is true</option>
                  </select>
                : <span className="tok-key">this is true</span>}
            </p>
            <ul className="mt-2 space-y-2 pl-5">
              {r.conditions.map((c, ci) => <ConditionRow key={ci} model={draft} c={c} onChange={next => updateCondition(ri, ci, next)} />)}
            </ul>
          </div>)}
          <p className="flex flex-wrap items-center gap-2"><span className="tok-key">Otherwise,</span> <Outcome>{draft.otherwise}</Outcome></p>
        </div>
        <p className="mt-3 text-xs text-haze-400">Rules are checked from the top. The first one that fits decides; “otherwise” catches everything else.</p>
      </>}
      {view === "plain" && <div>
        <label htmlFor={`${ids}-text`} className="text-sm text-haze-200">Thunder Text: the same rule in readable words, saved for versioning and review. You never need it, but editing it updates the picture.</label>
        <div className="mt-2 overflow-hidden rounded-xl border border-white/15 bg-black/30">
          <ThunderEditor id={`${ids}-text`} value={text} onChange={onText} invalid={!!textError} describedBy={textError ? `${ids}-text-error` : undefined}
            minRows={10} highlight={src => <HighlightedPlain source={src} />} />
        </div>
        {textError && <p id={`${ids}-text-error`} role="alert" className="mt-2 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200">{textError} The picture keeps the last version that could be read.</p>}
      </div>}
      {view === "source" && <Code label="Thunder source (.thunder), generated from the Thunder Text. Engineers and tools use this."><HighlightedSource source={proposed.canonicalSource} /></Code>}
      {view === "python" && <Code label="Python generated from the same rule. Deterministic, no AI."><HighlightedCode source={python} lang="python" /></Code>}
    </div>

    </section>

    {pending && <div role="status" className="mt-6 rounded-xl border border-gold-300/40 bg-gold-300/[0.07] p-4 text-sm text-haze-100">
      <p className="font-semibold text-white">You changed the rule. Here is what it would do:</p>
      {changed.length === 0
        ? <p className="mt-2">No example changes its answer.</p>
        : <ul className="mt-2 space-y-1">{changed.map(r => {
            const before = applied.tests.results.find(a => a.name === r.name);
            return <li key={r.name}>{values(draft, r.values)} would get <strong>{String(r.actual)}</strong> instead of {String(before?.actual)} <span className="text-haze-300">({r.name})</span></li>;
          })}</ul>}
      <p className="mt-2">{failing.length ? <span className="text-red-200">{failing.length} of {proposed.tests.total} examples would fail.</span> : <span className="text-emerald-200">All {proposed.tests.total} examples would still pass.</span>}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={`${button} bg-gold-400 text-ink-950 hover:bg-gold-300`} onClick={apply}>Apply change</button>
        <button type="button" className={button} onClick={undo}>Discard change</button>
      </div>
    </div>}
    <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-haze-200">{notice}</p>

    <details className="mt-6 border-t border-white/10 pt-5" open={examplesOpen} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-white"><ExampleGlyph />Examples ·{" "}
        <span className={failing.length ? "text-red-300" : "text-emerald-300"}>{proposed.tests.passed} of {proposed.tests.total} pass</span>
      </summary>
      <table className="mt-3 w-full text-left text-sm" aria-label="Examples">
        <thead className="text-haze-400"><tr><th scope="col" className="py-2 pr-3 font-medium">Example</th><th scope="col" className="py-2 pr-3 font-medium">Request</th><th scope="col" className="py-2 pr-3 font-medium">Expected</th><th scope="col" className="py-2 pr-3 font-medium">Rule gives</th><th scope="col" className="py-2 font-medium">Result</th></tr></thead>
        <tbody>{proposed.tests.results.map(r => <tr key={r.name} className={`border-t border-white/10 ${r.pass ? "" : "bg-red-400/[0.07]"}`}>
          <th scope="row" className="py-2 pr-3 font-medium text-white">{r.name}</th>
          <td className="py-2 pr-3 text-haze-200">{values(draft, r.values)}</td>
          <td className="py-2 pr-3 text-haze-200">{String(r.expected)}</td>
          <td className="py-2 pr-3 text-haze-200">{String(r.actual)}</td>
          <td className={`py-2 font-medium ${r.pass ? "text-emerald-300" : "text-red-300"}`}>{r.pass ? "Passes" : `Fails: expected ${r.expected}`}</td>
        </tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-haze-400">Examples check this rule only, on these inputs. They do not show what your application does. Outcomes: {outcomesOf(draft).join(", ")}.</p>
    </details>
    <div className="mt-4 flex justify-end"><button type="button" className={`${button} text-haze-300`} onClick={reset}>Reset</button></div>
  </div>;
}

function Code({ label, children }: { label: string; children: ReactNode }) {
  return <div>
    <p className="text-sm text-haze-200">{label}</p>
    <pre className="mt-2 overflow-x-auto rounded-xl border border-white/15 bg-black/30 p-4 font-mono text-sm leading-6 text-haze-100"><code>{children}</code></pre>
  </div>;
}

