"use client";
// The Thunder drawing parts, shared by every page that draws Thunder (Semantic Zoom, Learn Thunder): the symbols, a
// Thing card, a Data card, and the flow with its Yes and No sides. Everything they draw comes from the compiler's
// model (thunder-model-v1) and grammar (thunder-visual-v1); nothing here decides meaning.
import type { ReactNode } from "react";
import type { ThunderModel, Member, Thing, Flow, FlowNode, FlowBlock, Permission, Setting } from "../../../compiler/src/model.d.mts";
import { THUNDER_VISUAL } from "../../../compiler/src/visual.mjs";
import type { NodeRun } from "../../../compiler/src/running.d.mts";

export type SymbolId = keyof typeof THUNDER_VISUAL.symbols;

export const HEX = Object.fromEntries(Object.entries(THUNDER_VISUAL.colors).map(([k, v]) => [k, v.hex])) as Record<string, string>;
export const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300";

/** A Thunder symbol, drawn from the grammar's own path data. */
export function Symbol({ id, size = 28, label }: { id: SymbolId; size?: number; label?: string }) {
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

export const memberSymbol = (m: Member): SymbolId => (m.kind === "action" || m.kind === "pipeline" ? "action" : m.kind === "rule" ? "rule" : m.kind === "setup" ? "setup" : m.kind === "not-read" ? "not-read" : "steps");
export const thingSymbol = (t: Thing): SymbolId => (t.kind === "resource" ? "resource" : t.kind === "thing" ? "thing" : t.kind === "record" ? "record" : "choices");

// ── The flow, drawn as a path you can follow ─────────────────────────────────────────────────────────

export type Block = FlowBlock;

const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** What a run showed at one node, in words: "asked 201×", "happened 117× (58%)", "failed 1×: AttributeError". */
export function runWords(r: NodeRun | undefined, calls?: number): string | null {
  if (!r) return null;
  const parts: string[] = [];
  const share = (x: number) => (calls ? ` (${x / calls < 0.01 ? "<1" : Math.round((x / calls) * 100)}%)` : "");
  if (r.kind === "decision" && r.sides && r.ran) parts.push(`asked ${count(r.ran)}×`);
  else if (r.kind === "loop" && r.sides) parts.push(Object.entries(r.sides).map(([k, v]) => `${k === "For each" ? "went round" : "left"} ${count(v)}×`).join(", "));
  else if (r.kind === "stop" && r.ran) parts.push(`happened ${count(r.ran)}×${share(r.ran)}`);
  else if (r.kind === "end" && r.ran) parts.push(`reached ${count(r.ran)}×${share(r.ran)}`);
  else if (r.ran) parts.push(`${r.levels ? "logged" : "ran"} ${count(r.ran)}×`);
  for (const f of r.failed ?? []) parts.push(`failed ${count(f.count)}×: ${f.error}`);
  return parts.length ? parts.join("; ") : null;
}

/** The run's count beside a node: words in a quiet chip, never color alone. */
function RunChip({ text, failed }: { text: string | null; failed?: boolean }) {
  if (!text) return null;
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-xs ${failed ? "border-[#FDBA74]/60 text-[#FDBA74]" : "border-white/25 text-haze-200"}`}><span className="sr-only">When it ran: </span>{text}</span>;
}

export function FlowNodeCard({ n, onOpen, onLine, model, run, calls }: { n: FlowNode; onOpen: (id: string) => void; onLine: (l: number) => void; model: ThunderModel; run?: NodeRun; calls?: number }) {
  const d = THUNDER_VISUAL.does[n.does] ?? THUNDER_VISUAL.does.do;
  const target = n.uses ? model.members.find((m) => m.id === n.uses) : undefined;
  const chip = <RunChip text={runWords(run, calls)} failed={!!run?.failed?.length} />;
  const line = n.line ? <><span className="ml-auto" />{chip}<button type="button" onClick={() => onLine(n.line!)} className={`shrink-0 rounded font-mono text-xs text-haze-400 hover:text-white ${focus}`} aria-label={`Show line ${n.line} in the original code`}>{n.line}</button></> : chip;
  if (n.kind === "start") return <div className="flex items-center gap-3 rounded-full border border-[#FCD34D]/40 bg-[#FCD34D]/[0.06] px-4 py-2 text-[15px] text-white"><span aria-hidden="true" className="text-[#FCD34D]">{d.mark}</span>{n.does === "when" && <span className="sr-only">Runs when: </span>}{n.text}</div>;
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

/**
 * The flow tree from the model: questions with their Yes and No sides, loops, error handlers, and "always".
 * `runs` (optional, from the running system's overlay) adds what a run showed: counts beside nodes and on each side.
 */
export function FlowBlocks({ blocks, flow, runs, calls, ...p }: { blocks: Block[]; flow: Flow; onOpen: (id: string) => void; onLine: (l: number) => void; model: ThunderModel; runs?: Record<string, NodeRun>; calls?: number }): ReactNode {
  const node = (id: string) => flow.nodes.find((n) => n.id === id)!;
  const taken = (id: string, label: string) => { const v = runs?.[id]?.sides?.[label]; return v != null ? <span className="ml-2 font-mono text-xs font-normal text-haze-200">taken {count(v)}×</span> : null; };
  const Side = ({ label, items, of }: { label: string; items: Block[]; of?: string }) => (
    <div className="ml-6 mt-2 border-l-2 border-white/15 pl-5">
      <p className="mb-2 text-sm font-semibold text-haze-300">{label}{of && taken(of, label)}</p>
      <FlowBlocks blocks={items} flow={flow} runs={runs} calls={calls} {...p} />
    </div>
  );
  return (
    <ol className="space-y-2">
      {blocks.map((b) => {
        const n = node(b.id);
        const yesEmpty = "yes" in b && !b.yes!.length, noEmpty = "no" in b && !b.no!.length;
        return (
          <li key={b.id}>
            <FlowNodeCard n={n} {...p} run={runs?.[b.id]} calls={calls} />
            {b.yes && b.yes.length > 0 && <Side label="Yes" items={b.yes} of={b.id} />}
            {b.no && b.no.length > 0 && <Side label="No" items={b.no} of={b.id} />}
            {(b.cases ?? []).map((c, i) => c.blocks.length ? <Side key={i} label={c.label} items={c.blocks} of={b.id} /> : <p key={i} className="ml-6 mt-2 border-l-2 border-white/15 pl-5 text-sm font-semibold text-haze-300">{c.label}: <span className="font-normal text-haze-400">nothing</span>{taken(b.id, c.label)}</p>)}
            {b.cases && !b.cases.some((c) => /^(Otherwise|If none is ready yet|Default)\b/i.test(c.label)) && <p className="ml-6 mt-2 text-sm font-semibold text-haze-300">None of these <span aria-hidden="true">↓</span> continue</p>}
            {b.each && <Side label="For each" items={b.each} of={b.id} />}
            {b.body && b.body.length > 0 && <div className={`ml-6 mt-2 border-l-2 pl-5 ${b.nested ? "border-dashed border-[#C4B5FD]/40" : "border-white/10"}`}>{b.nested && <p className="mb-2 text-xs text-haze-400">Runs on its own; a stop in here ends only these steps.</p>}<FlowBlocks blocks={b.body} flow={flow} runs={runs} calls={calls} {...p} /></div>}
            {(b.handlers ?? []).map((h) => <Side key={h.id} label={node(h.id).text.replace(/\?$/, "")} items={h.blocks} />)}
            {b.always && <Side label="Always, at the end" items={b.always.blocks} />}
            {(yesEmpty || noEmpty) && <p className="ml-6 mt-2 text-sm font-semibold text-haze-300">{yesEmpty ? "Yes" : "No"} <span aria-hidden="true">↓</span> continue{taken(b.id, yesEmpty ? "Yes" : "No")}</p>}
            {b.each && <p className="ml-6 mt-2 text-sm font-semibold text-haze-300">When done <span aria-hidden="true">↓</span></p>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Try a rule (runs the rule the compiler read; nothing simulated) ───────────────────────────────────

/** A Thing (a class): what it knows and what it can do. `onOpen` makes each ability a button. */
export function ThingCard({ t, model, onOpen, selected = false }: { t: Thing; model: ThunderModel; onOpen?: (id: string) => void; selected?: boolean }) {
  const can = t.can.map((id) => model.members.find((m) => m.id === id)!).filter(Boolean);
  const setup = can.find((m) => m.kind === "setup");
  const cls = "flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-850/60 px-3 py-2.5 text-left";
  const ability = (m: Member) => (
    <>
      <Symbol id={memberSymbol(m)} size={24} />
      <span className="text-[15px] font-medium text-white">{m.label}{m.yesNo ? "?" : ""}</span>
      {onOpen && <span aria-hidden="true" className="ml-auto text-haze-400">→</span>}
    </>
  );
  return (
    <section aria-labelledby={`t-${t.id}`} className={`rounded-3xl border-2 bg-[#67E8F9]/[0.04] p-6 ${selected ? "border-[#67E8F9]" : "border-[#67E8F9]/50"}`}>
      <div className="flex items-center gap-4"><Symbol id="thing" size={44} label="Thing" /><div><p className="text-xs font-semibold uppercase tracking-wider text-[#67E8F9]">A Thing</p><h2 id={`t-${t.id}`} className="text-2xl font-bold text-white">{t.label}</h2></div></div>
      {t.doc && <p className="mt-3 text-[17px] text-haze-100">{t.doc}</p>}
      {t.knows.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-haze-400">It knows</h3>
          <ul className="mt-2 space-y-1">{t.knows.map((k) => <li key={k.name} className="text-[16px]"><span className="text-[#FCD34D]">{k.label}</span><span className="text-haze-300">{[k.kind, k.start].filter(Boolean).length ? `: ${[k.kind, k.start].filter(Boolean).join(", ")}` : ""}</span></li>)}</ul>
        </>
      )}
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-haze-400">It can</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {can.filter((m) => m.kind !== "setup").map((m) => (
          <li key={m.id}>{onOpen ? <button type="button" onClick={() => onOpen(m.id)} className={`${cls} hover:border-white/30 ${focus}`}>{ability(m)}</button> : <div className={cls}>{ability(m)}</div>}</li>
        ))}
      </ul>
      {setup && (onOpen
        ? <button type="button" onClick={() => onOpen(setup.id)} className={`mt-3 flex items-center gap-2 rounded text-sm text-haze-300 hover:text-white ${focus}`}><Symbol id="setup" size={18} />How a new {t.label} starts</button>
        : <p className="mt-3 flex items-center gap-2 text-sm text-haze-300"><Symbol id="setup" size={18} />A new {t.label} starts with what it knows above</p>)}
    </section>
  );
}

/** Data: a record (facts, like an ID card) or choices (one allowed value). */
export function DataCard({ t }: { t: Thing }) {
  return (
    <section className="rounded-2xl border border-white/12 bg-ink-850/40 p-5">
      <div className="flex items-center gap-3"><Symbol id={thingSymbol(t)} size={30} label={t.kind === "record" ? "Record" : "Choices"} /><div><p className="text-xs text-haze-400">{t.kind === "record" ? "Data: a record" : "Data: choices"}</p><h3 className="text-lg font-semibold text-white">{t.label}</h3></div></div>
      {t.doc && <p className="mt-2 text-sm text-haze-300">{t.doc}</p>}
      {t.choices.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{t.choices.map((c) => <span key={c} className="rounded-full border border-[#67E8F9]/50 px-3 py-1 text-sm text-[#67E8F9]">{c}</span>)}</div>}
      {t.knows.length > 0 && <ul className="mt-3 space-y-1 text-sm">{t.knows.map((k) => <li key={k.name}><span className="text-[#FCD34D]">{k.label}</span><span className="text-haze-300">{[k.kind, k.start].filter(Boolean).length ? `: ${[k.kind, k.start].filter(Boolean).join(", ")}` : ""}</span></li>)}</ul>}
    </section>
  );
}

const Chip = ({ children, dashed = false }: { children: ReactNode; dashed?: boolean }) => (
  <span className={`rounded-full border px-2 py-0.5 text-xs text-haze-300 ${dashed ? "border-dashed border-white/30" : "border-white/25"}`}>{children}</span>
);

/** A Resource (spec section 12): something that exists when the app runs, and what it knows (its settings). */
export function ResourceCard({ t, model, onLine }: { t: Thing; model: ThunderModel; onLine?: (line: number) => void }) {
  const label = (id: string) => model.members.find((m) => m.id === id)?.label ?? model.things.find((x) => x.id === id)?.label ?? id;
  const links = model.links.filter((l) => l.from === t.id || l.to === t.id);
  return (
    <section aria-labelledby={`r-${t.id}`} className="rounded-3xl border-2 border-[#FCD34D]/45 bg-[#FCD34D]/[0.03] p-6">
      <div className="flex items-center gap-4">
        <Symbol id="resource" size={44} label="Resource" />
        <div><p className="text-xs font-semibold uppercase tracking-wider text-[#FCD34D]">{t.existing ? "Looked up, not made here" : "A Resource"}{t.resourceType ? <span className="ml-2 font-mono normal-case tracking-normal text-haze-300">{t.resourceType}</span> : null}</p><h2 id={`r-${t.id}`} className="text-2xl font-bold text-white">{t.label}</h2></div>
      </div>
      <p className="mt-3 text-sm text-haze-300">Read from {t.file}, not from what is running now.</p>
      {t.knows.length > 0 && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-haze-400">It knows</h3>
          <ul className="mt-2 space-y-1.5">{t.knows.map((k, i) => (
            <li key={`${k.name}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[16px]">
              <span className="text-[#FCD34D]">{k.label}</span>
              <span className="text-haze-200">{k.kind}</span>
              {k.computed && !/worked out/.test(k.kind ?? "") && <Chip dashed>worked out when it runs</Chip>}
              {k.secret && <Chip>secret, name only</Chip>}
              {k.line != null && onLine && <button type="button" onClick={() => onLine(k.line!)} aria-label={`Show line ${k.line} in the original`} className={`ml-auto rounded font-mono text-xs text-haze-400 hover:text-white ${focus}`}>{k.line}</button>}
            </li>
          ))}</ul>
        </>
      )}
      {links.length > 0 && <p className="mt-4 text-sm text-haze-300">{links.map((l, i) => <span key={i}>{i ? "; " : ""}{label(l.from)} {l.kind.replace(/-/g, " ")} {label(l.to)}</span>)}</p>}
    </section>
  );
}

/** Permissions as keys: who can do what. A wide one says so in words, not only in color. */
export function PermissionList({ permissions, onLine }: { permissions: Permission[]; onLine?: (line: number) => void }) {
  return (
    <section aria-labelledby="perm-h" className="rounded-2xl border border-white/12 p-5">
      <h3 id="perm-h" className="flex items-center gap-2 text-lg font-semibold text-white"><Symbol id="permission" size={26} />Who can do what</h3>
      <ul className="mt-3 space-y-2">{permissions.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start gap-2 text-[15px]">
          <span className={p.wide ? "text-white" : "text-haze-100"}>{p.says ?? `${p.who} can ${p.can} ${p.on}`}</span>
          {p.wide && <span className="rounded-full border border-[#F472B6]/70 px-2 py-0.5 text-xs font-semibold text-[#F472B6]">Wide{p.why ? `: ${p.why}` : ""}</span>}
          {onLine && <button type="button" onClick={() => onLine(p.line)} aria-label={`Show line ${p.line} in the original`} className={`ml-auto rounded font-mono text-xs text-haze-400 hover:text-white ${focus}`}>{p.line}</button>}
        </li>
      ))}</ul>
    </section>
  );
}

const SOURCE_WORDS: Record<Setting["source"], string> = { parameter: "given when it starts or is built", variable: "a variable kept outside the file", secret: "a secret: only its name is shown", literal: "written in the file", computed: "worked out when it runs" };

/** Settings: each value's name and where it comes from. A secret is only ever named. */
export function SettingList({ settings }: { settings: Setting[] }) {
  return (
    <section aria-labelledby="set-h" className="rounded-2xl border border-white/12 p-5">
      <h3 id="set-h" className="text-lg font-semibold text-white">Settings it is given</h3>
      <ul className="mt-3 space-y-1.5">{settings.map((x) => (
        <li key={`${x.file}-${x.name}-${x.source}-${x.line}`} className="text-[15px]"><span className="font-mono text-[#FCD34D]">{x.name}</span> <span className="text-haze-300">{x.output ? "given back once it is applied" : SOURCE_WORDS[x.source]}</span>{x.default != null && !x.secret && <span className="text-haze-300"> ({x.default} unless told otherwise)</span>}{x.secret && <> <Chip>secret, name only</Chip></>}</li>
      ))}</ul>
    </section>
  );
}
