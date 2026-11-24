"use client";
// Semantic Zoom: read software from the big picture down to one decision, as a picture you can follow, as Thunder
// Text, or as the original code. Everything shown comes from one compiler model (thunder-model-v1); this component
// only lays it out. Nothing is drawn that the model does not contain.
import { useMemo, useState, type ReactNode } from "react";
import { thunderModel, modelText } from "../../../compiler/src/model.mjs";
import type { ThunderModel, Member, Thing, Flow, FlowNode } from "../../../compiler/src/model.d.mts";
import { THUNDER_VISUAL } from "../../../compiler/src/visual.mjs";
import { explainPlain } from "../../../compiler/src/plain-contract.mjs";
import { ZOOM_SAMPLES } from "./samples";

type Depth = "big" | "flow" | "details";
type View = "picture" | "text" | "original";
type SymbolId = keyof typeof THUNDER_VISUAL.symbols;

const HEX = Object.fromEntries(Object.entries(THUNDER_VISUAL.colors).map(([k, v]) => [k, v.hex])) as Record<string, string>;
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300";

/** A Thunder symbol, drawn from the grammar's own path data. */
function Symbol({ id, size = 28, label }: { id: SymbolId; size?: number; label?: string }) {
  const s = THUNDER_VISUAL.symbols[id];
  const c = HEX[s.color] ?? "#E5E7EB";
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" stroke={c} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round"
      strokeDasharray={s.dashed ? "4 4" : undefined} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0">
      {s.paths.map((d, i) => <path key={i} d={d} />)}
      {(s.circles ?? []).map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={s.fill ? c : "none"} />)}
    </svg>
  );
}

const memberSymbol = (m: Member): SymbolId => (m.kind === "action" ? "action" : m.kind === "rule" ? "rule" : m.kind === "setup" ? "setup" : m.kind === "not-read" ? "not-read" : "steps");
const thingSymbol = (t: Thing): SymbolId => (t.kind === "thing" ? "thing" : t.kind === "record" ? "record" : "choices");

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 rounded-xl border border-white/10 bg-ink-850/60 p-1">
      <span className="px-2 text-xs text-haze-400">{label}</span>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-sm ${focus} ${value === v ? "bg-white/[0.12] font-medium text-white" : "text-haze-300 hover:text-white"}`}>{text}</button>
      ))}
    </div>
  );
}

// ── The flow, drawn as a path you can follow ─────────────────────────────────────────────────────────

type Block = { node: FlowNode; side?: { label: string; blocks: Block[] }; next?: string };

/** Follow the flow from its start: the main path down, each question's other side to the right. */
function toBlocks(flow: Flow): Block[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const outs = (id: string) => flow.edges.filter((e) => e.from === id);
  const seen = new Set<string>();
  const walk = (id: string | undefined, lane: number): Block[] => {
    const out: Block[] = [];
    while (id && !seen.has(id)) {
      const n = byId.get(id)!;
      seen.add(id);
      if (n.kind === "end" && n.text === "Done") { out.push({ node: n }); break; }
      if (n.kind === "decision" || n.kind === "loop") {
        const es = outs(id);
        const sideEdge = n.kind === "loop" ? es.find((e) => e.label === "each") : es.find((e) => (byId.get(e.to)?.lane ?? 0) > n.lane);
        const mainEdge = es.find((e) => e !== sideEdge && e.label !== "next");
        out.push({ node: n, side: sideEdge ? { label: sideEdge.label ?? "", blocks: walk(sideEdge.to, lane + 1) } : undefined, next: mainEdge?.label });
        id = mainEdge?.to;
        continue;
      }
      out.push({ node: n });
      if (n.kind === "stop" || n.kind === "end") break;
      id = outs(id).find((e) => e.label !== "next")?.to;
    }
    return out;
  };
  return walk(flow.nodes[0]?.id, 0);
}

const EDGE_WORDS: Record<string, string> = { yes: "Yes", no: "No", each: "For each", done: "When done" };

function FlowNodeCard({ n, onOpen, onLine, model }: { n: FlowNode; onOpen: (id: string) => void; onLine: (l: number) => void; model: ThunderModel }) {
  const d = THUNDER_VISUAL.does[n.does] ?? THUNDER_VISUAL.does.do;
  const target = n.uses ? model.members.find((m) => m.id === n.uses) : undefined;
  const line = n.line ? <button type="button" onClick={() => onLine(n.line!)} className={`ml-auto shrink-0 rounded font-mono text-xs text-haze-400 hover:text-white ${focus}`} aria-label={`Show line ${n.line} in the original code`}>{n.line}</button> : null;
  if (n.kind === "start") return <div className="flex items-center gap-3 rounded-full border border-[#FCD34D]/40 bg-[#FCD34D]/[0.06] px-4 py-2 text-[15px] text-white"><span aria-hidden="true" className="text-[#FCD34D]">▶</span>{n.text}</div>;
  if (n.kind === "decision") return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-[#7FB2FF]/70 bg-[#7FB2FF]/[0.07] px-4 py-3">
      <Symbol id="rule" size={26} />
      <span className="text-[17px] font-semibold text-white">{n.text}</span>
      {target && <button type="button" onClick={() => onOpen(target.id)} className={`rounded-lg border border-[#7FB2FF]/50 px-2.5 py-1 text-sm text-[#A9C9FF] hover:bg-[#7FB2FF]/10 ${focus}`}>Open the rule →</button>}
      {line}
    </div>
  );
  if (n.kind === "stop") return <div className="flex items-center gap-3 rounded-2xl border-2 border-[#FDBA74]/70 bg-[#FDBA74]/[0.07] px-4 py-3"><Symbol id="stop" size={26} /><span className="text-[16px] text-white">{n.text}</span>{line}</div>;
  if (n.kind === "end") return <div className="flex items-center gap-3 px-1 py-1"><span className="rounded-full border border-[#67E8F9]/60 px-3 py-1 text-[15px] text-[#67E8F9]">{n.answer ? n.text : n.text === "Done" ? "Done" : n.text}</span>{n.otherwise && <span className="text-sm text-haze-400">otherwise</span>}{line}</div>;
  if (n.kind === "code") return <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/25 px-4 py-2.5"><Symbol id="not-read" size={22} label="Not read yet" /><code className="font-mono text-[13px] text-haze-300">{n.text}</code>{line}</div>;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-850/50 px-4 py-2.5">
      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-sm font-semibold" style={{ color: HEX[d.color], borderColor: `${HEX[d.color]}66` }}>{d.mark}</span>
      <span className="sr-only">{d.label}: </span>
      <span className="text-[16px] text-haze-100">{n.text}</span>
      {target && <button type="button" onClick={() => onOpen(target.id)} className={`rounded-lg border border-white/20 px-2.5 py-1 text-sm text-haze-200 hover:text-white ${focus}`}>Open →</button>}
      {line}
    </div>
  );
}

function FlowBlocks({ blocks, ...p }: { blocks: Block[]; onOpen: (id: string) => void; onLine: (l: number) => void; model: ThunderModel }): ReactNode {
  return (
    <ol className="space-y-2">
      {blocks.map((b) => (
        <li key={b.node.id}>
          <FlowNodeCard n={b.node} {...p} />
          {b.side && (
            <div className="ml-6 mt-2 border-l-2 border-white/15 pl-5">
              <p className="mb-2 text-sm font-semibold text-haze-300">{EDGE_WORDS[b.side.label] ?? b.side.label}</p>
              <FlowBlocks blocks={b.side.blocks} {...p} />
            </div>
          )}
          {b.next && <p className="ml-6 mt-2 text-sm font-semibold text-haze-300">{EDGE_WORDS[b.next] ?? b.next} <span aria-hidden="true">↓</span></p>}
        </li>
      ))}
    </ol>
  );
}

// ── Try a rule (runs the rule the compiler read; nothing simulated) ───────────────────────────────────

/** The same answer words the flow uses: BigFee -> Big fee, true -> Yes. */
const answerWords = (r: string) => (/^true$/i.test(r) ? "Yes" : /^false$/i.test(r) ? "No" : ((w) => w.charAt(0).toUpperCase() + w.slice(1))(String(r).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase()));

type PlainInput = { id: string; kind: "number" | "yesno"; label: string; yes?: string; no?: string };
function TryRule({ rule }: { rule: { inputs: PlainInput[] } }) {
  const [values, setValues] = useState<Record<string, number | boolean>>(() => Object.fromEntries(rule.inputs.map((i) => [i.id, i.kind === "yesno" ? true : 0])));
  const run = useMemo(() => { try { return explainPlain(rule as never, values) as { outcome: string; ruleIndex: number }; } catch { return null; } }, [rule, values]);
  return (
    <div className="rounded-2xl border border-[#7FB2FF]/40 bg-[#7FB2FF]/[0.05] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#A9C9FF]">Try the rule</h3>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {rule.inputs.map((i) => i.kind === "number" ? (
          <label key={i.id} className="flex flex-col gap-1 text-sm text-haze-300">{i.label}
            <input type="number" value={Number(values[i.id])} onChange={(e) => setValues((v) => ({ ...v, [i.id]: Number(e.target.value) }))} className={`w-28 rounded-lg border border-white/15 bg-ink-950 px-3 py-2 font-mono text-white ${focus}`} />
          </label>
        ) : (
          <div key={i.id} role="group" aria-label={i.label} className="flex gap-1">
            {[true, false].map((b) => <button key={String(b)} type="button" aria-pressed={values[i.id] === b} onClick={() => setValues((v) => ({ ...v, [i.id]: b }))} className={`rounded-lg border px-3 py-2 text-sm ${focus} ${values[i.id] === b ? "border-[#FCD34D]/60 text-[#FCD34D]" : "border-white/15 text-haze-300"}`}>{b ? i.yes : i.no}</button>)}
          </div>
        ))}
      </div>
      {run && <p className="mt-4 text-[17px] text-white">The rule answers <span className="rounded-full border border-[#67E8F9]/60 px-3 py-1 text-[#67E8F9]">{answerWords(run.outcome)}</span> <span className="text-sm text-haze-400">({run.ruleIndex < 0 ? "no rule matched, so the otherwise answer" : `rule ${run.ruleIndex + 1} matched`})</span></p>}
      <p className="mt-2 text-xs text-haze-400">This runs the rule exactly as the Thunder compiler read it from the code.</p>
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────────────────────────────────────

export function ZoomClient() {
  const [sampleKey, setSampleKey] = useState(ZOOM_SAMPLES[0].key);
  const sample = ZOOM_SAMPLES.find((s) => s.key === sampleKey)!;
  const [source, setSource] = useState(sample.code);
  const [depth, setDepth] = useState<Depth>("big");
  const [view, setView] = useState<View>("picture");
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<[number, number] | null>(null);

  const model = useMemo<ThunderModel | null>(() => { try { return thunderModel([{ path: sample.file, source }], { name: sample.file }) as ThunderModel; } catch { return null; } }, [source, sample.file]);
  const member = model?.members.find((m) => m.id === selected) ?? null;
  const thing = model?.things.find((t) => t.id === selected) ?? (member?.owner ? model?.things.find((t) => t.id === member.owner) : null) ?? null;
  const usedBy = member ? model!.links.filter((l) => l.to === member.id).map((l) => model!.members.find((m) => m.id === l.from)!).filter(Boolean) : [];

  const chooseSample = (key: string) => { const s = ZOOM_SAMPLES.find((x) => x.key === key)!; setSampleKey(key); setSource(s.code); setSelected(null); setDepth("big"); setHighlight(null); };
  const open = (id: string) => { setSelected(id); setDepth("flow"); setHighlight(null); };
  const showLine = (l: number) => { setHighlight([l, l]); setView("original"); };
  const goBig = () => { setSelected(null); setDepth("big"); };

  if (!model) return <p className="text-haze-300">Thunder could not read this code. Check that it is complete, or pick a sample.</p>;
  const loose = model.members.filter((m) => !m.owner);
  const lines = source.split("\n");
  const focusLines: [number, number] | null = highlight ?? (member ? member.lines : thing ? thing.lines : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-haze-300">Example
          <select value={sampleKey} onChange={(e) => chooseSample(e.target.value)} className={`rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-white ${focus}`}>
            {ZOOM_SAMPLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap gap-3">
          <Segmented label="How deep" value={depth} onChange={(d) => { setDepth(d); if (d !== "big" && !member) { const first = model.members.find((m) => m.kind !== "setup"); if (first) setSelected(first.id); } }} options={[["big", "Big picture"], ["flow", "Flow"], ["details", "Details"]]} />
          <Segmented label="Show as" value={view} onChange={setView} options={[["picture", "Thunder"], ["text", "Thunder Text"], ["original", "Original"]]} />
        </div>
      </div>

      <nav aria-label="Where you are" className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={goBig} className={`rounded text-haze-300 hover:text-white ${focus}`}>{sample.file}</button>
        {thing && <><span aria-hidden="true" className="text-haze-500">›</span><button type="button" onClick={() => { setSelected(thing.id); setDepth("big"); }} className={`rounded text-haze-300 hover:text-white ${focus}`}>{thing.label}</button></>}
        {member && <><span aria-hidden="true" className="text-haze-500">›</span><span className="font-medium text-white">{member.label}</span></>}
      </nav>

      {view === "original" && (
        <figure>
          <figcaption className="mb-2 flex items-center gap-3 text-sm text-haze-300">The original code{focusLines && <span className="text-haze-400">· lines {focusLines[0]}–{focusLines[1]} highlighted</span>}</figcaption>
          <pre className="max-h-[640px] overflow-auto rounded-2xl border border-white/10 bg-black/40 py-3 font-mono text-[13px] leading-relaxed">
            {lines.map((l, i) => {
              const on = focusLines && i + 1 >= focusLines[0] && i + 1 <= focusLines[1];
              return <div key={i} className={`flex gap-4 px-4 ${on ? "bg-gold-400/[0.12]" : ""}`}><span className="w-8 shrink-0 select-none text-right text-haze-500">{i + 1}</span><code className={on ? "text-white" : "text-haze-300"}>{l || " "}</code></div>;
            })}
          </pre>
          <details className="mt-3"><summary className="cursor-pointer text-sm text-haze-300">Edit the code</summary>
            <textarea aria-label="Code" value={source} onChange={(e) => { setSource(e.target.value); setSelected(null); setDepth("big"); }} spellCheck={false} rows={16} className={`mt-2 w-full rounded-xl border border-white/15 bg-ink-950 p-3 font-mono text-[13px] text-haze-100 ${focus}`} />
          </details>
        </figure>
      )}

      {view === "text" && (
        <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-5 font-mono text-[13.5px] leading-relaxed text-haze-100"><code>{
          depth === "big" && !member
            ? [...model.things.map((t) => modelText(model, t.id)), ...loose.map((m) => modelText(model, m.id))].join("\n")
            : member ? modelText(model, member.id) : thing ? modelText(model, thing.id) : ""
        }</code></pre>
      )}

      {view === "picture" && depth === "big" && (
        <div className="space-y-5">
          {model.files[0]?.purpose && <p className="text-lg text-haze-200"><span className="mr-2 rounded-full border border-white/25 px-2 py-0.5 text-xs text-haze-300">Author&apos;s note</span>{model.files[0].purpose}</p>}
          <div className="grid gap-5 lg:grid-cols-2">
            {model.things.filter((t) => t.kind === "thing").map((t) => (
              <section key={t.id} aria-labelledby={`t-${t.id}`} className={`rounded-3xl border-2 p-6 ${selected === t.id ? "border-[#67E8F9]" : "border-[#67E8F9]/50"} bg-[#67E8F9]/[0.04]`}>
                <div className="flex items-center gap-4"><Symbol id="thing" size={44} label="Thing" /><div><p className="text-xs font-semibold uppercase tracking-wider text-[#67E8F9]">A Thing</p><h2 id={`t-${t.id}`} className="text-2xl font-bold text-white">{t.label}</h2></div></div>
                {t.doc && <p className="mt-3 text-[17px] text-haze-100">{t.doc}</p>}
                {t.knows.length > 0 && <><h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-haze-400">It knows</h3>
                  <ul className="mt-2 space-y-1">{t.knows.map((k) => <li key={k.name} className="text-[16px]"><span className="text-[#FCD34D]">{k.label}</span><span className="text-haze-300">{[k.kind, k.start].filter(Boolean).length ? `: ${[k.kind, k.start].filter(Boolean).join(", ")}` : ""}</span></li>)}</ul></>}
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-haze-400">It can</h3>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {t.can.map((id) => model.members.find((m) => m.id === id)!).filter((m) => m && m.kind !== "setup").map((m) => (
                    <li key={m.id}><button type="button" onClick={() => open(m.id)} className={`flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-850/60 px-3 py-2.5 text-left hover:border-white/30 ${focus}`}>
                      <Symbol id={memberSymbol(m)} size={24} /><span className="text-[15px] font-medium text-white">{m.label}{m.yesNo ? "?" : ""}</span><span aria-hidden="true" className="ml-auto text-haze-400">→</span></button></li>
                  ))}
                </ul>
                {t.can.some((id) => model.members.find((m) => m.id === id)?.kind === "setup") && <button type="button" onClick={() => open(t.can.find((id) => model.members.find((m) => m.id === id)?.kind === "setup")!)} className={`mt-3 flex items-center gap-2 rounded text-sm text-haze-300 hover:text-white ${focus}`}><Symbol id="setup" size={18} />How a new {t.label} starts</button>}
              </section>
            ))}
            {loose.length > 0 && (
              <section aria-labelledby="loose" className="rounded-3xl border border-white/12 p-6">
                <h2 id="loose" className="text-lg font-semibold text-white">What this file can do</h2>
                <ul className="mt-3 grid gap-2">{loose.map((m) => <li key={m.id}><button type="button" onClick={() => open(m.id)} className={`flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-850/60 px-3 py-2.5 text-left hover:border-white/30 ${focus}`}><Symbol id={memberSymbol(m)} size={24} /><span className="text-[15px] font-medium text-white">{m.label}{m.yesNo ? "?" : ""}</span>{m.route && <span className="font-mono text-xs text-[#FCD34D]">{m.route}</span>}<span aria-hidden="true" className="ml-auto text-haze-400">→</span></button></li>)}</ul>
              </section>
            )}
          </div>
          {model.things.some((t) => t.kind !== "thing") && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {model.things.filter((t) => t.kind !== "thing").map((t) => (
                <section key={t.id} className="rounded-2xl border border-white/12 bg-ink-850/40 p-5">
                  <div className="flex items-center gap-3"><Symbol id={thingSymbol(t)} size={30} label={t.kind === "record" ? "Record" : "Choices"} /><div><p className="text-xs text-haze-400">{t.kind === "record" ? "Data: a record" : "Data: choices"}</p><h3 className="text-lg font-semibold text-white">{t.label}</h3></div></div>
                  {t.doc && <p className="mt-2 text-sm text-haze-300">{t.doc}</p>}
                  {t.choices.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{t.choices.map((c) => <span key={c} className="rounded-full border border-[#67E8F9]/50 px-3 py-1 text-sm text-[#67E8F9]">{c}</span>)}</div>}
                  {t.knows.length > 0 && <ul className="mt-3 space-y-1 text-sm">{t.knows.map((k) => <li key={k.name}><span className="text-[#FCD34D]">{k.label}</span><span className="text-haze-300">{[k.kind, k.start].filter(Boolean).length ? `: ${[k.kind, k.start].filter(Boolean).join(", ")}` : ""}</span></li>)}</ul>}
                </section>
              ))}
            </div>
          )}
          {model.unknowns.length > 0 && <ul className="rounded-2xl border border-dashed border-white/25 p-4 text-sm text-haze-300">{model.unknowns.map((u, i) => <li key={i}>Not read yet, line {u.line}: {u.why}</li>)}</ul>}
        </div>
      )}

      {view === "picture" && depth !== "big" && member && (
        <article aria-labelledby="m-title" className="rounded-3xl border border-white/12 bg-ink-900/40 p-6">
          <header className="flex flex-wrap items-center gap-4">
            <Symbol id={memberSymbol(member)} size={40} label={memberSymbol(member)} />
            <div><p className="text-xs text-haze-400">{thing ? `${thing.label} ${member.kind === "rule" ? "has a rule" : "can"}` : member.kind === "action" ? "An action" : "In this file"}</p>
              <h2 id="m-title" className="text-2xl font-bold text-white">{member.label}{member.yesNo ? "?" : ""}</h2></div>
            {member.route && <span className="rounded-lg border border-[#FCD34D]/40 px-2 py-1 font-mono text-sm text-[#FCD34D]">{member.route}</span>}
            <span className="ml-auto font-mono text-xs text-haze-400">lines {member.lines[0]}–{member.lines[1]}</span>
          </header>
          {member.doc && <p className="mt-3 text-[17px] text-haze-100"><span className="mr-2 rounded-full border border-white/25 px-2 py-0.5 text-xs text-haze-300">Author&apos;s note</span>{member.doc}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            {member.youGive.length > 0 && <div className="rounded-xl bg-white/[0.04] px-4 py-2.5"><span className="mr-2 text-xs font-semibold uppercase tracking-wider text-haze-400">You give it</span><span className="text-[#FCD34D]">{member.youGive.join(", ")}</span></div>}
            {member.youGetBack && <div className="rounded-xl bg-white/[0.04] px-4 py-2.5"><span className="mr-2 text-xs font-semibold uppercase tracking-wider text-haze-400">You get back</span><span className="text-[#67E8F9]">{member.youGetBack}</span></div>}
          </div>

          {depth === "flow" && <div className="mt-6"><FlowBlocks blocks={toBlocks(member.flow).filter((b) => b.node.kind !== "start")} onOpen={open} onLine={showLine} model={model} /></div>}

          {depth === "details" && (
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                {member.rule ? <TryRule rule={member.rule as { inputs: PlainInput[] }} /> : member.kind === "rule" && <p className="rounded-2xl border border-dashed border-white/25 p-4 text-sm text-haze-300">This rule can&apos;t be tried yet: it uses facts the {thing?.label ?? "code"} keeps for itself, which Thunder doesn&apos;t feed in yet. Its picture above is still exact.</p>}
                <div className="rounded-2xl border border-white/10 p-5 text-sm text-haze-200">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-haze-400">How it connects</h3>
                  <ul className="mt-2 space-y-1.5">
                    {model.links.filter((l) => l.from === member.id).map((l) => { const t = model.members.find((m) => m.id === l.to)!; return <li key={l.node}>Uses <button type="button" onClick={() => open(t.id)} className={`rounded text-[#A9C9FF] hover:underline ${focus}`}>{t.label}</button></li>; })}
                    {usedBy.map((m) => <li key={m.id}>Used by <button type="button" onClick={() => open(m.id)} className={`rounded text-[#A9C9FF] hover:underline ${focus}`}>{m.label}</button></li>)}
                    {!usedBy.length && !model.links.some((l) => l.from === member.id) && <li className="text-haze-400">Nothing else in this file uses it, and it uses nothing else here.</li>}
                  </ul>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 p-5 text-sm text-haze-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-haze-400">Where it came from</h3>
                <p className="mt-2">Read from code by the Thunder compiler, with no AI. {sample.file}, lines {member.lines[0]}–{member.lines[1]}.</p>
                <p className="mt-2">{member.flow.nodes.filter((n) => n.kind === "code").length ? `${member.flow.nodes.filter((n) => n.kind === "code").length} step(s) are shown as code because Thunder can't explain them yet.` : "Every step was explained; nothing is shown as raw code."}</p>
                <button type="button" onClick={() => { setHighlight(member.lines); setView("original"); }} className={`mt-3 rounded-lg border border-white/20 px-3 py-1.5 text-haze-100 hover:text-white ${focus}`}>Show the original lines</button>
              </div>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
