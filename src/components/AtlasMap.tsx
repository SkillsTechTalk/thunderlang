"use client";

import { useRef, useState } from "react";
import { IntentCode } from "./IntentCode";

type Mission = { mission: string; fn: string; line: number; confidence: string; intent: string };
type Project = {
  name: string; language: string; license: string; what: string;
  source: string; path: string; publicFunctions?: number; missionCount: number; missions: Mission[];
};
type Totals = { projects: number; missions: number; languages: string[] };

type TNode = {
  id: string; kind: "atlas" | "project" | "mission"; label: string;
  conf?: string; project?: Project; mission?: Mission;
  children?: TNode[];
  _x?: number; _y?: number; _w?: number; _display?: string; _depth?: number;
};

const LANG_LABEL: Record<string, string> = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript", go: "Go",
  rust: "Rust", java: "Java", csharp: "C#", cpp: "C++", php: "PHP", ruby: "Ruby", perl: "Perl",
};

// Colors (site dark canvas). Confidence is a separate scale from the violet brand accent.
const C = {
  medium: "#efc05a",   // amber
  low: "#8b93a8",       // muted slate
  info: "#7f93ff",
  accent: "#b49bff",
  fill: "#0d1322",
  fillHover: "#141b2e",
  stroke: "rgba(255,255,255,0.10)",
  strokeStrong: "rgba(255,255,255,0.20)",
  ink: "#eef1f8",
  ink2: "#aeb8cc",
  ink3: "#6d7893",
  panel2: "#0e1322",
};
const confColor = (c?: string) => (c === "medium" ? C.medium : c === "low" ? C.low : C.info);

const NODE_H = 32, XGAP = 268, YGAP = 44, PAD_L = 12, STRIPE = 4, MAXW = 220, MINW = 110;
const LABEL_FONT = '520 12.5px ui-sans-serif, system-ui, sans-serif';

let measurer: CanvasRenderingContext2D | null = null;
function textW(str: string, font = LABEL_FONT) {
  if (typeof document === "undefined") return str.length * 7;
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  if (!measurer) return str.length * 7;
  measurer.font = font;
  return measurer.measureText(str).width;
}
function truncate(str: string, max: number) {
  if (textW(str) <= max) return str;
  let s = str;
  while (s.length > 1 && textW(s + "…") > max) s = s.slice(0, -1);
  return s + "…";
}

function buildTree(projects: Project[], totals: Totals): TNode {
  return {
    id: "atlas", kind: "atlas", label: "Intent Atlas",
    children: projects.map((p) => ({
      id: `${p.name}::${p.path}`, kind: "project", label: p.name, project: p,
      children: p.missions.map((m) => ({
        id: `${p.name}::${m.fn}::${m.line}`, kind: "mission", label: m.mission,
        conf: m.confidence, mission: m, project: p,
      })),
    })),
  };
}

function nodeWidth(n: TNode, widthCache: Map<string, number>) {
  const inner = truncate(n.label, MAXW - PAD_L - STRIPE - 16);
  n._display = inner;
  const cached = widthCache.get(n.id);
  if (cached) return cached;
  let w = STRIPE + PAD_L + textW(inner) + 16;
  if (n.children && n.children.length) w += 22;
  w = Math.max(MINW, Math.min(MAXW, w));
  widthCache.set(n.id, w);
  return w;
}

function confRollup(p: Project) {
  let med = 0, low = 0;
  for (const m of p.missions) { if (m.confidence === "medium") med++; else if (m.confidence === "low") low++; }
  return { med, low, total: p.missions.length };
}

export function AtlasMap({ projects, totals }: { projects: Project[]; totals: Totals }) {
  const root = useRef(buildTree(projects, totals)).current;
  const widthCache = useRef(new Map<string, number>()).current;
  // Start with every project collapsed so the map opens as 13 legible project nodes.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(root.children!.map((c) => c.id))
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const totalsMed = projects.reduce((a, p) => a + p.missions.filter((m) => m.confidence === "medium").length, 0);
  const totalsLow = totals.missions - totalsMed;

  // layout (recomputed each render; ~300 nodes is cheap)
  const nodes: TNode[] = [];
  const links: { a: TNode; b: TNode }[] = [];
  let rowCounter = 0;
  (function walk(n: TNode, depth: number, parent: TNode | null) {
    n._depth = depth;
    n._w = nodeWidth(n, widthCache);
    const kids = n.children && !collapsed.has(n.id) ? n.children : [];
    if (!kids.length) { n._y = rowCounter * YGAP; rowCounter++; }
    else { kids.forEach((k) => walk(k, depth + 1, n)); n._y = (kids[0]._y! + kids[kids.length - 1]._y!) / 2; }
    n._x = depth * XGAP;
    nodes.push(n);
    if (parent) links.push({ a: parent, b: n });
  })(root, 0, null);

  const width = 1 + Math.max(...nodes.map((n) => n._x! + n._w!)) + 44;
  const height = Math.max(rowCounter * YGAP + 20, 200);

  const toggle = (id: string) =>
    setCollapsed((prev) => { const nx = new Set(prev); nx.has(id) ? nx.delete(id) : nx.add(id); return nx; });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(root.children!.map((c) => c.id)));

  const sel = selected ? nodes.find((n) => n.id === selected) || findById(root, selected) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950/60">
      {/* command bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/8 bg-ink-900/50 px-4 py-3">
        <div className="mr-auto flex items-baseline gap-3">
          <span className="font-mono text-[13px] font-semibold text-white">skyline-atlas.thunder</span>
          <span className="font-mono text-[11px] text-haze-400">
            {totals.projects} projects · {totals.missions} missions · {totals.languages.length} languages
          </span>
        </div>
        {/* confidence meter */}
        <div className="min-w-[200px]">
          <div className="mb-1.5 flex items-baseline justify-between font-mono text-[11px] text-haze-300">
            <span>Inference confidence</span>
            <span className="tabular-nums text-haze-200">{totalsMed} med · {totalsLow} low</span>
          </div>
          <div className="flex h-[9px] overflow-hidden rounded-md border border-white/10 bg-ink-800">
            <i style={{ width: `${(totalsMed / totals.missions) * 100}%`, background: C.medium }} />
            <i style={{ width: `${(totalsLow / totals.missions) * 100}%`, background: C.low }} />
          </div>
        </div>
        {/* legend */}
        <div className="flex items-center gap-4 font-mono text-[10.5px] text-haze-300">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.medium }} />Medium</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.low }} />Low</span>
        </div>
        {/* controls */}
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 transition hover:border-white/25 hover:text-white">Expand all</button>
          <button onClick={collapseAll} className="rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 transition hover:border-white/25 hover:text-white">Collapse</button>
          <span className="inline-flex overflow-hidden rounded-lg border border-white/10">
            <button onClick={() => setZoom((z) => Math.max(0.55, z - 0.12))} aria-label="Zoom out" className="bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 hover:text-white">–</button>
            <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.12))} aria-label="Zoom in" className="border-l border-white/10 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 hover:text-white">+</button>
          </span>
        </div>
      </div>

      {/* stage */}
      <div className="relative h-[64vh] min-h-[460px] overflow-auto bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:30px_30px]">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", padding: "24px 40px 60px" }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", display: "block" }}>
            {links.map(({ a, b }, i) => {
              const x1 = a._x! + a._w!, y1 = a._y! + NODE_H / 2 + 8;
              const x2 = b._x!, y2 = b._y! + NODE_H / 2 + 8;
              const mx = (x1 + x2) / 2;
              return <path key={i} d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none"
                stroke={b.kind === "mission" && b.conf === "low" ? "rgba(139,147,168,0.35)" : C.strokeStrong} strokeWidth={1.3} />;
            })}

            {nodes.map((n) => {
              const x = n._x!, y = n._y! + 8, w = n._w!;
              const isRoot = n.kind === "atlas";
              const isProject = n.kind === "project";
              const hasKids = !!(n.children && n.children.length);
              const stripe = isProject ? C.accent : n.kind === "mission" ? confColor(n.conf) : C.info;
              const tx = x + STRIPE + PAD_L;
              const roll = isProject ? confRollup(n.project!) : null;
              const isSel = n.id === selected;
              return (
                <g key={n.id} tabIndex={0} role="button"
                   aria-label={`${n.label}${n.conf ? ", " + n.conf + " confidence" : ""}`}
                   style={{ cursor: "pointer", outline: "none" }}
                   onClick={() => setSelected(n.id)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); }
                     else if (e.key === "ArrowLeft" && hasKids) toggle(n.id);
                     else if (e.key === "ArrowRight" && hasKids) toggle(n.id);
                   }}>
                  <rect x={x} y={y} width={w} height={NODE_H} rx={9}
                    fill={isRoot ? "rgba(139,108,242,0.16)" : C.fill}
                    stroke={isSel ? C.accent : isRoot ? "rgba(139,108,242,0.55)" : C.stroke}
                    strokeWidth={isSel ? 1.9 : 1.2} />
                  <rect x={x + 4} y={y + 7} width={STRIPE} height={NODE_H - 14} rx={2} fill={stripe} />
                  {(isProject || n.kind === "mission") && (
                    <text x={tx} y={y + 12} fontFamily="ui-monospace, monospace" fontSize={8.5}
                      letterSpacing="0.11em" fill={C.ink3}>
                      {isProject ? (LANG_LABEL[n.project!.language] ?? n.project!.language).toUpperCase() : (n.mission!.fn + "()")}
                    </text>
                  )}
                  <text x={tx} y={isProject || n.kind === "mission" ? y + 24 : y + NODE_H / 2 + 4}
                    fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize={isRoot ? 13.5 : 12.5}
                    fontWeight={isRoot ? 680 : 520} fill={C.ink}>
                    {n._display}
                  </text>

                  {roll && roll.total > 0 && (() => {
                    const barW = 46, bx = x + w - barW - (hasKids ? 24 : 10), by = y + NODE_H - 9, seg = barW / roll.total;
                    return (
                      <g>
                        <rect x={bx} y={by} width={barW} height={4} rx={2} fill={C.panel2} />
                        <rect x={bx} y={by} width={seg * roll.med} height={4} rx={1} fill={C.medium} />
                        <rect x={bx + seg * roll.med} y={by} width={seg * roll.low} height={4} rx={1} fill={C.low} />
                      </g>
                    );
                  })()}

                  {hasKids && (() => {
                    const cxp = x + w - 12, cyp = y + NODE_H / 2, open = !collapsed.has(n.id);
                    return (
                      <g onClick={(e) => { e.stopPropagation(); toggle(n.id); }} role="button"
                         aria-label={`${open ? "Collapse" : "Expand"} ${n.label}`}>
                        <circle cx={cxp} cy={cyp} r={9} fill={C.panel2} stroke={C.strokeStrong} strokeWidth={1.2} />
                        <text x={cxp} y={cyp + 3.4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={10} fontWeight={700} fill={C.ink2}>{open ? "−" : "+"}</text>
                        {!open && <text x={cxp} y={cyp + 15} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={8} fill={C.ink3}>{n.children!.length}</text>}
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </svg>
        </div>

        {/* detail drawer */}
        <aside
          className={`absolute right-0 top-0 flex h-full w-[min(90vw,380px)] flex-col border-l border-white/10 bg-ink-900/95 backdrop-blur transition-transform duration-200 ${sel ? "translate-x-0" : "translate-x-full"}`}
          aria-hidden={!sel}
        >
          {sel && (
            <>
              <div className="relative border-b border-white/8 px-5 py-4">
                <button onClick={() => setSelected(null)} aria-label="Close details"
                  className="absolute right-3.5 top-3.5 grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-ink-800 text-haze-300 hover:text-white">✕</button>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-haze-300">{sel.kind}</span>
                  {sel.conf && (
                    <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-950"
                      style={{ background: confColor(sel.conf) }}>{sel.conf} confidence</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold leading-tight text-white">{sel.label}</h3>
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {sel.kind === "mission" && sel.mission && (
                  <>
                    <div className="mb-4 font-mono text-[11px] text-haze-400">
                      {sel.project!.name} · {sel.mission.fn}() · line {sel.mission.line}
                    </div>
                    <IntentCode code={sel.mission.intent} filename={`${sel.mission.mission}.thunder`} />
                    <p className="mt-4 text-xs leading-relaxed text-haze-400">
                      Inferred, unverified draft. This is a lens on the code, not the authors&rsquo; committed intent.
                      Review before trusting it.
                    </p>
                    <a href={sel.project!.source} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-block font-mono text-xs text-gold-300 hover:text-gold-200">View source →</a>
                  </>
                )}
                {sel.kind === "project" && sel.project && (
                  <>
                    <p className="text-sm leading-relaxed text-haze-200">{sel.project.what}.</p>
                    <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px]">
                      <span className="rounded-md border border-white/10 bg-ink-800 px-2.5 py-1 text-haze-200">{LANG_LABEL[sel.project.language] ?? sel.project.language}</span>
                      <span className="rounded-md border border-white/10 bg-ink-800 px-2.5 py-1 text-haze-200">{sel.project.license}</span>
                      <span className="rounded-md border border-white/10 bg-ink-800 px-2.5 py-1 text-haze-200">{sel.project.missionCount} missions</span>
                    </div>
                    <p className="mt-4 text-xs text-haze-400">Lifted from{" "}
                      <a href={sel.project.source} target="_blank" rel="noopener noreferrer" className="text-gold-300 hover:text-gold-200">{sel.project.path}</a>.
                      Click the ○ on the node to expand its missions.</p>
                  </>
                )}
                {sel.kind === "atlas" && (
                  <p className="text-sm leading-relaxed text-haze-200">
                    A map of {totals.missions} missions lifted from {totals.projects} well-known projects across{" "}
                    {totals.languages.length} languages. Expand any project to read what its functions do, as inferred intent.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function findById(n: TNode, id: string): TNode | null {
  if (n.id === id) return n;
  for (const c of n.children || []) { const f = findById(c, id); if (f) return f; }
  return null;
}
