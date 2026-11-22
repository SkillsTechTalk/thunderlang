"use client";

import { useMemo, useState } from "react";
import type { Integration, MapItem, ThunderMap as TMap } from "@/lib/thunder-map";
import { explainPlain, formatValue } from "../../../compiler/src/plain-contract.mjs";
import { HighlightedCode } from "@/lib/highlight";
import { AnswerView, RulePictureStatic } from "@/app/try/RuleVisual";
import {
  ActionGlyph, CloudGlyph, ContractGlyph, CylinderGlyph, DecisionGlyph, EnvelopeGlyph, ExampleGlyph, FolderGlyph, ServiceGlyph,
} from "@/app/try/Glyphs";

type Lens = { type: "fact" | "outcome"; key: string } | null;
type Zoom = { service?: string; item?: string };
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300";
const KIND_LABEL = { disagreement: "Disagreement", money: "Moves money", "personal-data": "Personal data", unconfirmed: "Unconfirmed rule", unreadable: "Read the code" } as const;

function IntegrationChip({ i }: { i: Integration }) {
  const [Icon, label] = i.kind === "external" ? [CloudGlyph, `calls ${i.target}`] : i.kind === "database" ? [CylinderGlyph, `writes ${i.target}`]
    : i.kind === "event-out" ? [EnvelopeGlyph, `announces ${i.target}`] : i.kind === "event-in" ? [EnvelopeGlyph, `reacts to ${i.target}`] : [CloudGlyph, `calls ${i.target}`];
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2 py-0.5 text-xs text-haze-200"><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function ItemButton({ item, lit, dim, onOpen }: { item: MapItem; lit: boolean; dim: boolean; onOpen: () => void }) {
  const drawable = !!item.card;
  const Icon = drawable ? DecisionGlyph : ActionGlyph;
  return <button type="button" onClick={onOpen}
    className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition hover:bg-white/[0.06] ${focusRing}
      ${drawable ? "border-white/15" : "border-dashed border-white/25"} ${lit ? "border-gold-300/70 bg-gold-300/10" : ""} ${dim ? "opacity-35" : ""}`}>
    <Icon className={drawable ? "text-[#7FB2FF]" : ""} />
    <span className={drawable ? "text-white" : "text-haze-300"}>{item.readable}</span>
    {!drawable && <span className="ml-auto text-[11px] text-haze-400">can&apos;t fully read</span>}
  </button>;
}

export function ThunderMap({ map }: { map: TMap }) {
  const [zoom, setZoom] = useState<Zoom>({});
  const [lens, setLens] = useState<Lens>(null);
  const litIds = useMemo(() => new Set(lens ? (lens.type === "fact" ? map.lenses.facts : map.lenses.outcomes)[lens.key] ?? [] : []), [lens, map]);
  const focusFor = (id: string) => map.focus.filter(f => f.itemId === id);
  const item = zoom.item ? map.items[zoom.item] : null;
  const service = zoom.service ? map.services.find(s => s.name === zoom.service) : null;
  const open = (id: string) => setZoom({ service: map.items[id].service, item: id });

  return <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
    <div className="min-w-0 space-y-5">
      {/* Breadcrumb: where you are, from the big picture down. */}
      <nav aria-label="Where you are in the map" className="flex flex-wrap items-center gap-1.5 text-sm">
        <button type="button" onClick={() => setZoom({})} className={`rounded px-1.5 py-0.5 ${zoom.service ? "text-gold-300 hover:underline" : "font-semibold text-white"} ${focusRing}`}>{map.app}</button>
        {zoom.service && <><span aria-hidden="true" className="text-haze-500">›</span>
          <button type="button" onClick={() => setZoom({ service: zoom.service })} className={`rounded px-1.5 py-0.5 ${item ? "text-gold-300 hover:underline" : "font-semibold text-white"} ${focusRing}`}>{zoom.service}</button></>}
        {item && <><span aria-hidden="true" className="text-haze-500">›</span><span className="px-1.5 font-mono text-haze-200">{item.file}</span>
          <span aria-hidden="true" className="text-haze-500">›</span><span className="px-1.5 font-semibold text-white">{item.readable}</span></>}
      </nav>

      {/* Lenses: color that navigates. */}
      <div className="rounded-xl border border-white/10 p-3 text-sm">
        <p className="text-haze-300">Light up everything that reads a <span className="tok-id">fact</span> or can answer an <span className="tok-type">outcome</span>:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.keys(map.lenses.facts).sort().map(f => <button key={f} type="button" aria-pressed={lens?.key === f}
            onClick={() => setLens(lens?.key === f ? null : { type: "fact", key: f })}
            className={`rounded-full border px-2.5 py-0.5 tok-id ${lens?.key === f ? "border-[#FCD34D] bg-[#FCD34D]/15" : "border-[#FCD34D]/35"} ${focusRing}`}>{f}</button>)}
          <span aria-hidden="true" className="mx-1 text-haze-500">·</span>
          {Object.keys(map.lenses.outcomes).sort().map(o => <button key={o} type="button" aria-pressed={lens?.key === o}
            onClick={() => setLens(lens?.key === o ? null : { type: "outcome", key: o })}
            className={`rounded-full border px-2.5 py-0.5 tok-type ${lens?.key === o ? "border-[#67E8F9] bg-[#67E8F9]/15" : "border-[#67E8F9]/35"} ${focusRing}`}>{o}</button>)}
        </div>
        {lens && <p role="status" className="mt-2 text-xs text-haze-300">{litIds.size} {litIds.size === 1 ? "rule uses" : "rules use"} “{lens.key}”. <button type="button" className="text-gold-300 hover:underline" onClick={() => setLens(null)}>Clear</button></p>}
      </div>

      {!zoom.service && <section aria-labelledby="app-level">
        <h2 id="app-level" className="text-lg font-semibold text-white">Thunder Brief <span className="font-normal text-haze-400">· your app on a page</span></h2>
        <p className="mt-1 text-haze-300">{map.summary}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {map.services.map(s => {
            const ids = s.modules.flatMap(m => m.items);
            const any = ids.some(id => litIds.has(id));
            return <div key={s.name} className={`flex flex-col rounded-3xl border p-4 transition ${any ? "border-gold-300/60" : "border-white/15"} ${lens && !any ? "opacity-40" : ""}`}>
              <button type="button" onClick={() => setZoom({ service: s.name })} className={`flex items-center gap-2 text-left text-base font-semibold text-white hover:underline ${focusRing}`}>
                <ServiceGlyph className="h-5 w-5" />{s.name}<span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-normal text-haze-300">{s.languages.join(", ")}</span>
              </button>
              <p className="mt-2 text-xs leading-relaxed text-haze-300">{s.summary.replace(/^./, c => c.toUpperCase())}.</p>
              <div className="mt-3 space-y-1.5">{ids.map(id => <ItemButton key={id} item={map.items[id]} lit={litIds.has(id)} dim={!!lens && !litIds.has(id)} onOpen={() => open(id)} />)}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">{[...new Map(s.integrations.filter(i => i.kind !== "http").map(i => [`${i.kind}${i.target}`, i])).values()].map(i => <IntegrationChip key={`${i.kind}${i.target}`} i={i} />)}</div>
            </div>;
          })}
        </div>
        <h3 className="mt-6 text-sm font-semibold text-white">Thunder Map <span className="font-normal text-haze-400">· how the services connect</span></h3>
        <ul className="mt-2 space-y-1 text-sm text-haze-200">{map.edges.map(e => <li key={e.label} className="flex items-center gap-2">
          {e.kind === "event" ? <EnvelopeGlyph /> : <CloudGlyph />}<span className="font-medium text-white">{e.from}</span><span aria-hidden="true" className="text-haze-400">→</span><span className="font-medium text-white">{e.to}</span><span className="text-haze-400">({e.label})</span></li>)}</ul>
      </section>}

      {service && !item && <section aria-labelledby="service-level">
        <h2 id="service-level" className="flex items-center gap-2 text-lg font-semibold text-white"><ServiceGlyph className="h-5 w-5" />{service.name}</h2>
        <p className="mt-1 text-haze-300">{service.summary.replace(/^./, c => c.toUpperCase())}.</p>
        <div className="mt-4 space-y-4">{service.modules.map(m => <div key={m.file} className="rounded-2xl border border-white/10 p-4">
          <p className="flex items-center gap-2 font-mono text-sm text-haze-100"><FolderGlyph />{m.file}<span className="ml-auto font-sans text-xs text-haze-400">{m.language}</span></p>
          <p className="mt-1 text-xs text-haze-300">{m.summary.replace(/^./, c => c.toUpperCase())}.</p>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">{m.items.map(id => <ItemButton key={id} item={map.items[id]} lit={litIds.has(id)} dim={!!lens && !litIds.has(id)} onOpen={() => open(id)} />)}</div>
          {m.integrations.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{m.integrations.map(i => <IntegrationChip key={`${i.kind}${i.target}${i.line}`} i={i} />)}</div>}
        </div>)}</div>
      </section>}

      {item && <ItemView map={map} item={item} onOpen={open} />}
    </div>

    {/* Focus: where a person should look first. */}
    <aside aria-labelledby="focus" className="h-fit rounded-2xl border border-white/10 p-4 lg:sticky lg:top-20">
      <h2 id="focus" className="font-semibold text-white">Thunder Focus <span className="font-normal text-haze-400">· look here first</span></h2>
      <p className="mt-1 text-xs text-haze-400">Ranked: disagreements, money, personal data, unconfirmed rules, code Thunder can&apos;t read.</p>
      <ol className="mt-3 space-y-2">{map.focus.map(f => <li key={`${f.rank}`}>
        <button type="button" onClick={() => open(f.itemId)} className={`w-full rounded-lg border border-white/10 p-2.5 text-left text-sm hover:bg-white/[0.05] ${zoom.item === f.itemId ? "border-gold-300/60" : ""} ${focusRing}`}>
          <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-haze-400"><span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-white">{f.rank}</span>{KIND_LABEL[f.kind]}</span>
          <span className="mt-1 block font-medium text-white">{f.title}</span>
          <span className="mt-0.5 block text-xs text-haze-300">{f.reason}</span>
        </button>
      </li>)}</ol>
    </aside>
  </div>;
}

function ItemView({ map, item, onOpen }: { map: TMap; item: MapItem; onOpen: (id: string) => void }) {
  const [showSource, setShowSource] = useState(false);
  const card = item.card;
  const disagreement = map.disagreements.find(d => d.items.includes(item.id));
  const other = disagreement ? map.items[disagreement.items.find(id => id !== item.id) as string] : null;
  const initial = useMemo(() => card ? Object.fromEntries(card.inputs.map(i => {
    const lits = card.rules.flatMap(r => r.conditions).filter(c => c.input === i.id && typeof c.value === "number").map(c => c.value as number);
    return [i.id, i.kind === "yesno" ? true : (lits.length ? Math.max(...lits) : 0)];
  })) : {}, [card]);
  const [values, setValues] = useState<Record<string, number | boolean>>(initial);
  const source = map.sources[item.file] ?? "";
  const lines = source.split("\n");
  const end = (() => { const next = Object.values(map.items).filter(i => i.file === item.file && i.line > item.line).map(i => i.line).sort((a, b) => a - b)[0]; return (next ?? lines.length + 1) - 1; })();
  const snippet = lines.slice(item.line - 1, end).join("\n").trimEnd();

  return <section aria-labelledby="item-level" className="space-y-4">
    <div className={`rounded-2xl border p-5 ${card ? "border-white/15 bg-ink-850/60" : "border-dashed border-white/30"}`}>
      <p className="flex flex-wrap items-center gap-2 text-xs text-haze-400">
        <span className="rounded-full border border-white/20 px-2 py-0.5">Thunder Code · Thundered {item.file.endsWith(".py") ? "Python" : "TypeScript"}</span>
        <span className="rounded-full border border-dashed border-white/25 px-2 py-0.5">Read from code: no person has confirmed this rule</span>
      </p>
      <h2 id="item-level" className="mt-3 flex items-center gap-2 text-xl font-semibold text-white"><ContractGlyph className="h-5 w-5" />{item.readable.replace(/^./, c => c.toUpperCase())}</h2>
      {card ? <div className="mt-4 space-y-5">
        <RulePictureStatic model={card} />
        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 flex items-center gap-2 text-sm text-haze-300"><ExampleGlyph />Ask it:</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {card.inputs.map(i => i.kind === "yesno"
              ? <button key={i.id} type="button" aria-pressed={values[i.id] === true} onClick={() => setValues({ ...values, [i.id]: !values[i.id] })}
                  className={`rounded-lg border border-white/15 px-3 py-1 text-sm tok-id ${focusRing}`}>{formatValue(i, values[i.id] as boolean)}</button>
              : <label key={i.id} className="flex items-center gap-1.5 text-sm"><span className="tok-id">{i.label.replace(/^the /, "")}</span>
                  <input type="number" value={String(values[i.id])} onChange={e => e.target.value !== "" && Number.isFinite(Number(e.target.value)) && setValues({ ...values, [i.id]: Number(e.target.value) })}
                    className={`w-24 rounded-md border border-white/25 bg-white/[0.06] px-2 py-1 tok-num ${focusRing}`} /></label>)}
          </div>
          <AnswerView model={card} values={values} explanation={explainPlain(card, values)} context={""} />
        </div>
      </div> : <div className="mt-3 text-sm text-haze-200">
        <p>{item.says}</p>
        <p className="mt-2 text-haze-300">Thunder can&apos;t draw this function yet. The original code below is the source of truth.</p>
        {item.unread.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-haze-400">{item.unread.map(u => <li key={u.line}>Line {u.line}: {u.reason}</li>)}</ul>}
      </div>}
      {disagreement && other && <div role="note" className="mt-5 rounded-xl border border-red-400/40 bg-red-400/[0.07] p-3 text-sm text-haze-100">
        <p className="font-semibold text-white">✗ Disagrees with {other.service}</p>
        <p className="mt-1">For {disagreement.values}: {map.items[disagreement.items[0]].service} says <strong>{disagreement.answers[0]}</strong>, {map.items[disagreement.items[1]].service} says <strong>{disagreement.answers[1]}</strong>. Here is what the code does today. Which one does the business want?</p>
        <button type="button" onClick={() => onOpen(other.id)} className={`mt-2 text-gold-300 hover:underline ${focusRing}`}>Open {other.service}&apos;s version →</button>
      </div>}
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <button type="button" aria-expanded={showSource} onClick={() => setShowSource(!showSource)} className={`rounded-lg border border-white/20 px-3 py-1.5 font-semibold hover:bg-white/10 ${focusRing}`}>{showSource ? "Hide original" : "View original"}</button>
        <span className="rounded-lg border border-dashed border-white/25 px-3 py-1.5 text-haze-300">Propose rule change · Update code: not yet</span>
      </div>
    </div>
    {showSource && <figure className="rounded-2xl border border-white/10 p-4">
      <figcaption className="font-mono text-xs text-haze-400">{item.file} · from line {item.line}</figcaption>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-4 font-mono text-[12px] leading-6 text-haze-200"><code><HighlightedCode source={snippet} lang={item.file.endsWith(".py") ? "python" : "typescript"} /></code></pre>
    </figure>}
  </section>;
}
