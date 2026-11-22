"use client";

import { useMemo, useState } from "react";
import type { PlainModel } from "../../compiler/src/plain-contract.d.mts";
import { explainPlain, formatValue } from "../../compiler/src/plain-contract.mjs";
import { AnswerView } from "@/app/try/RuleVisual";
import { ExampleGlyph } from "@/app/try/Glyphs";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300";

/** Ask a Thunder card about one case: set each fact, see the answer and the reason for every condition. */
export function AskIt({ model }: { model: PlainModel }) {
  const initial = useMemo(() => Object.fromEntries(model.inputs.map((i) => {
    const lits = model.rules.flatMap((r) => r.conditions).filter((c) => c.input === i.id);
    if (i.kind === "yesno") return [i.id, true];
    if (i.kind === "number" || i.kind === "dollars") { const n = lits.map((c) => c.value).filter((v): v is number => typeof v === "number"); return [i.id, n.length ? Math.max(...n) : 0]; }
    const t = lits.map((c) => c.value).find((v) => typeof v === "string");
    return [i.id, typeof t === "string" ? t : ""];
  })), [model]);
  const [values, setValues] = useState<Record<string, number | boolean | string>>(initial);
  const askable = model.inputs.filter((i) => i.kind !== "other");
  let explanation: ReturnType<typeof explainPlain> | null = null;
  try { explanation = explainPlain(model, values); } catch { explanation = null; }
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm text-haze-300"><ExampleGlyph />Ask it:</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {askable.map((i) => i.kind === "yesno"
          ? <button key={i.id} type="button" aria-pressed={values[i.id] === true} onClick={() => setValues({ ...values, [i.id]: !values[i.id] })}
              className={`rounded-lg border border-white/15 px-3 py-1 text-sm tok-id ${ring}`}>{formatValue(i, values[i.id] as boolean)}</button>
          : <label key={i.id} className="flex items-center gap-1.5 text-sm"><span className="tok-id">{i.label.replace(/^the /, "")}</span>
              <input value={String(values[i.id])} inputMode={i.kind === "text" ? "text" : "decimal"}
                onChange={(e) => { const raw = e.target.value; if (i.kind === "text") setValues({ ...values, [i.id]: raw }); else if (raw !== "" && Number.isFinite(Number(raw))) setValues({ ...values, [i.id]: Number(raw) }); }}
                className={`w-24 rounded-md border border-white/25 bg-white/[0.06] px-2 py-1 ${i.kind === "text" ? "tok-str" : "tok-num"} ${ring}`} /></label>)}
      </div>
      {explanation ? <AnswerView model={model} values={values} explanation={explanation} context="" />
        : <p className="text-sm text-haze-400">Thunder can draw this rule but can&apos;t run it with these values.</p>}
    </div>
  );
}
