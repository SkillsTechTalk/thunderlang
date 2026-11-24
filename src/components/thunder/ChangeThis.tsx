"use client";
// "Change this": write in Thunder on the sample. A person picks a change (a limit, or a new Stop), and the Thunder
// compiler writes the code and proves it: the edited step reads exactly as asked, and every other function means the
// same. Computed in the browser by the same compiler the CLI uses (thunderWrite); nothing is saved or sent anywhere.
import { useMemo, useState } from "react";
import { thunderWrite } from "../../../compiler/src/write-steps.mjs";
import type { ThunderWriteResult } from "../../../compiler/src/write-steps.d.mts";
import { readCode } from "../../../compiler/src/read.mjs";
import { focus } from "./ThunderParts";

type Step = { line: number; says?: string; kind?: string; expr?: unknown; children?: Step[]; otherwise?: Step[] };
type Limit = { line: number; says: string; value: number };

/** Every number a question compares with, in reading order: these are the limits a person may want to change. */
function limitsOf(steps: Step[]): Limit[] {
  const out: Limit[] = [];
  const walk = (list: Step[] | undefined) => (list || []).forEach((s) => {
    const e = s.expr as { kind?: string; test?: unknown } | undefined;
    if (e?.kind === "if" && e.test) {
      const nums = JSON.stringify(e.test).match(/"type":"number","value":(-?[\d.]+)/g) || [];
      if (nums.length === 1) out.push({ line: s.line, says: s.says ?? "", value: Number(nums[0].split(":").pop()) });
    }
    walk(s.children); walk(s.otherwise);
  });
  walk(steps);
  return out;
}

export function ChangeThis({ source, file, name, line, onUse }: { source: string; file: string; name: string; line: number; onUse?: (next: string) => void }) {
  const item = useMemo(() => {
    try {
      const r = readCode(source, { file, allSteps: true }) as { items: { name: string; line: number; steps?: Step[]; inputs?: { name: string }[] }[] };
      return r.items.find((i) => i.name === name && i.line === line) ?? null;
    } catch { return null; }
  }, [source, file, name, line]);
  const limits = useMemo(() => limitsOf(item?.steps ?? []), [item]);
  const firstInput = item?.inputs?.find((p) => !/^(self|this|cls)$/.test(p.name))?.name ?? "";
  const [kind, setKind] = useState<"limit" | "stop">(limits.length ? "limit" : "stop");
  const [limitLine, setLimitLine] = useState<number | null>(limits[0]?.line ?? null);
  const chosen = limits.find((l) => l.line === limitLine) ?? limits[0];
  const [value, setValue] = useState<string>(chosen ? String(chosen.value + 3) : "");
  const [when, setWhen] = useState(firstInput ? (file.endsWith(".py") ? `${firstInput} is None` : `${firstInput} == null`) : "");
  const [message, setMessage] = useState("Something is missing");
  const [result, setResult] = useState<ThunderWriteResult | null>(null);
  const [used, setUsed] = useState<string | null>(null);

  if (!item?.steps?.length) return null;
  const member = { file, name, line };
  const firstStep = item.steps[0];
  const edit = kind === "limit"
    ? (chosen && value.trim() !== "" && Number.isFinite(Number(value)) ? { op: "setValue" as const, member, step: `line:${chosen.line}`, from: chosen.value, to: Number(value) } : null)
    : (when.trim() && message.trim() ? { op: "addStop" as const, member, before: `line:${firstStep.line}`, when: when.trim(), message: message.trim() } : null);
  const why = kind === "limit" ? (!chosen ? "This function's questions have no single number to change." : "Type a number.") : "Write a condition and the message the person sees.";

  const write = () => { if (edit) { setResult(thunderWrite([{ path: file, source }], edit) as ThunderWriteResult); setUsed(null); } };
  const ok = result?.status === "written";

  return (
    <section aria-labelledby="change-this" className="rounded-2xl border border-white/10 p-5">
      <h4 id="change-this" className="text-xs font-semibold uppercase tracking-wider text-haze-400">Change this</h4>
      <p className="mt-2 text-sm text-haze-200">Make a change in Thunder. The compiler writes the code, then proves the changed step means exactly what you asked and nothing else changed. Nothing is saved.</p>

      <fieldset className="mt-4">
        <legend className="sr-only">What to change</legend>
        <div className="flex flex-wrap gap-2">
          {([["limit", "Change a limit"], ["stop", "Add a Stop"]] as const).map(([k, label]) => (
            <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${kind === k ? "border-gold-300/60 bg-gold-400/[0.10] text-white" : "border-white/15 text-haze-200"} ${focus}`}>
              <input type="radio" name="change-kind" value={k} checked={kind === k} onChange={() => { setKind(k); setResult(null); }} className="accent-[#FCD34D]" />{label}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "limit" && (limits.length ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm text-haze-300">Question
            <select value={chosen?.line ?? ""} onChange={(e) => { const l = limits.find((x) => x.line === Number(e.target.value)); setLimitLine(l?.line ?? null); setValue(l ? String(l.value + 3) : ""); setResult(null); }} className={`min-h-11 rounded-lg border border-white/15 bg-ink-950 px-3 text-white ${focus}`}>
              {limits.map((l) => <option key={l.line} value={l.line}>{l.says} (line {l.line})</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-haze-300">New number (now {chosen?.value})
            <input type="number" inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setResult(null); }} className={`min-h-11 rounded-lg border border-white/15 bg-ink-950 px-3 font-mono text-white ${focus}`} />
          </label>
        </div>
      ) : <p className="mt-4 text-sm text-haze-300">This function&apos;s questions have no single number to change. Try &ldquo;Add a Stop&rdquo;.</p>)}

      {kind === "stop" && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm text-haze-300">Stop when (code, checked before the first step)
            <input value={when} onChange={(e) => { setWhen(e.target.value); setResult(null); }} spellCheck={false} className={`min-h-11 rounded-lg border border-white/15 bg-ink-950 px-3 font-mono text-white ${focus}`} />
          </label>
          <label className="grid gap-1 text-sm text-haze-300">The person sees
            <input value={message} onChange={(e) => { setMessage(e.target.value); setResult(null); }} className={`min-h-11 rounded-lg border border-white/15 bg-ink-950 px-3 text-white ${focus}`} />
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={write} disabled={!edit} aria-describedby={!edit ? "change-why" : undefined} className={`min-h-11 rounded-xl bg-gold-400 px-4 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}>Write the code and prove it</button>
        {!edit && <span id="change-why" className="text-sm text-haze-400">{why}</span>}
      </div>

      <div aria-live="polite">
        {result && (
          <div className="mt-5 space-y-4">
            <p className="flex items-start gap-2 text-[15px]">
              <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] ${ok ? "border-[#86EFAC]/50 text-[#86EFAC]" : "border-[#FDBA74]/50 text-[#FDBA74]"}`}>{ok ? "✓" : "!"}</span>
              <span className="text-white"><span className="font-semibold">{ok ? "Written and proven." : result.status === "needs-ai" ? "Needs an AI coding agent." : "Not changed."}</span> <span className="text-haze-200">{result.says}</span></span>
            </p>
            {edit && <p className="text-sm text-haze-300"><span className="font-semibold text-haze-200">The Thunder edit:</span> <code className="break-all font-mono text-xs text-haze-200">{JSON.stringify(edit)}</code></p>}
            {ok && result.patch && (
              <figure>
                <figcaption className="mb-1 text-sm text-haze-300">The code change (every other line stays exactly as it was)</figcaption>
                <pre className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[12.5px] leading-relaxed">
                  {result.patch.split("\n").filter((l) => !/^(---|\+\+\+) /.test(l)).map((l, i) => (
                    <div key={i} className={l.startsWith("+") ? "text-[#86EFAC]" : l.startsWith("-") ? "text-[#FDA4AF]" : l.startsWith("@@") ? "text-haze-400" : "text-haze-300"}>{l || " "}</div>
                  ))}
                </pre>
              </figure>
            )}
            {ok && result.proof && (
              <ul aria-label="Proof" className="space-y-1.5 text-sm">
                {result.proof.edited.checks.map((c) => <li key={c.member} className="flex gap-2 text-haze-200"><span aria-hidden="true" className="text-[#86EFAC]">✓</span>Read again: {c.member} now reads exactly as the edit says.</li>)}
                <li className="flex gap-2 text-haze-200"><span aria-hidden="true" className="text-[#86EFAC]">✓</span>{result.proof.unchanged.checked ? `Every other function (${result.proof.unchanged.checked}) means the same, step for step.` : "No other function in the file."}</li>
                <li className="flex gap-2 text-haze-400"><span aria-hidden="true">·</span>Not run here: in your project, <code className="font-mono text-xs">thunder write --test</code> also runs your tests on the change.</li>
              </ul>
            )}
            {result.status === "needs-ai" && result.prompt && (
              <details className="rounded-xl border border-white/10 p-3"><summary className={`cursor-pointer text-sm text-haze-200 ${focus}`}>The instruction an AI coding agent would get</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs text-haze-300">{result.prompt}</pre>
              </details>
            )}
            {ok && onUse && result.files?.[file] && (
              <div className="flex flex-wrap items-center gap-3">
                {used == null
                  ? <button type="button" onClick={() => { setUsed(source); onUse(result.files![file]); }} className={`min-h-11 rounded-xl border border-white/20 px-4 text-sm text-haze-100 hover:text-white ${focus}`}>Use the changed code in this example</button>
                  : <button type="button" onClick={() => { onUse(used); setUsed(null); setResult(null); }} className={`min-h-11 rounded-xl border border-white/20 px-4 text-sm text-haze-100 hover:text-white ${focus}`}>Put the original code back</button>}
                <span className="text-xs text-haze-400">Only this page changes; nothing is saved.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
