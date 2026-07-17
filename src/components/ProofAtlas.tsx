"use client";

import { useRef, useState } from "react";

/**
 * Proof-painted Intent Atlas: a defined ThunderLang product rendered as a tree,
 * every guarantee / prohibition / check colored by whether it is actually proven.
 * This is the layer OpenThunder supplies (verification status on the Intent Graph).
 */

type Status = "proven" | "partial" | "drift" | "planned" | "info";
type PNode = {
  id: string;
  kind: "product" | "system" | "goal" | "group" | "input" | "output" | "guarantee" | "prohibition" | "event" | "verify" | "target";
  label: string;
  status: Status;
  intent?: string;
  provenBy?: string[];
  provesRef?: string; // id of the verify node that proves this claim (traceability edge)
  children?: PNode[];
  _x?: number; _y?: number; _w?: number; _display?: string;
};

const KIND_LABEL: Record<string, string> = {
  product: "product", system: "system", goal: "goal", group: "", input: "input",
  output: "output", guarantee: "guarantee", prohibition: "never", event: "event",
  verify: "verify", target: "target",
};
const CLAIM = new Set(["guarantee", "prohibition", "verify"]);

const C = {
  proven: "#35d39a", partial: "#efc05a", drift: "#fb6f84", planned: "#77839c", info: "#7f93ff",
  accent: "#b49bff", fill: "#0d1322", stroke: "rgba(255,255,255,0.10)", strokeStrong: "rgba(255,255,255,0.20)",
  ink: "#eef1f8", ink2: "#aeb8cc", ink3: "#6d7893", panel2: "#0e1322",
};
const stColor = (s: Status) => C[s];
const ST_NAME: Record<Status, string> = { proven: "Proven", partial: "Partial", drift: "Drifting", planned: "Planned", info: "Declared" };

const G = (label: string, status: Status, intent: string, provenBy: string[] = [], provesRef?: string): PNode =>
  ({ id: label.replace(/\W+/g, "-").toLowerCase(), kind: "guarantee", label, status, intent, provenBy, provesRef });

const MODEL: PNode = {
  id: "root", kind: "product", label: "Skyline Billing", status: "info",
  intent: "A billing platform defined in ThunderLang. Every system states what it must do, what must never happen, and how it is proven.",
  children: [
    {
      id: "createinvoice", kind: "system", label: "CreateInvoice", status: "partial",
      intent: "Generate an invoice from approved orders, exactly once, with a full audit trail.",
      children: [
        { id: "ci-goal", kind: "goal", label: "Generate invoice from approved orders", status: "info", intent: "The outcome this system exists to achieve." },
        { id: "ci-data", kind: "group", label: "Data contract", status: "info", children: [
          { id: "ci-in1", kind: "input", label: "customer: Customer", status: "info", intent: "Typed input." },
          { id: "ci-in2", kind: "input", label: "orders: List<Order>", status: "info", intent: "Typed input." },
          { id: "ci-in3", kind: "input", label: "idempotencyKey: IdempotencyKey", status: "info", intent: "A retry key. The same key returns the same invoice instead of creating another." },
          { id: "ci-out", kind: "output", label: "invoice: Invoice", status: "info", intent: "Typed output." },
        ] },
        { id: "ci-guar", kind: "group", label: "Guarantees", status: "partial", children: [
          G("duplicate invoices are not created", "proven", "Even if checkout retries, one placed order becomes one invoice.", ["duplicate-prevention test", "idempotency-key contract"], "v1"),
          G("invoice.total is never negative", "proven", "A structural property of every generated invoice.", ["property test: total >= 0"]),
          G("every invoice is auditable", "partial", "An audit record exists for each invoice.", ["audit-trail test (passes)", "runtime evidence: pending"], "v2"),
        ] },
        { id: "ci-never", kind: "group", label: "Prohibitions", status: "drift", children: [
          { id: "p1", kind: "prohibition", label: "never expose payment token in logs", status: "proven", intent: "Payment tokens must not appear in logs, events, debug output, or proof.", provenBy: ["security scan (0 findings)"], provesRef: "v3" },
          { id: "p2", kind: "prohibition", label: "never invoice an unapproved order", status: "drift", intent: "An order must be approved before it can be invoiced.", provenBy: [] },
        ] },
        { id: "ci-events", kind: "group", label: "Events", status: "partial", children: [
          { id: "e1", kind: "event", label: "publishes InvoiceCreated", status: "proven", intent: "Downstream billing services consume this.", provenBy: ["event-contract test"] },
          { id: "e2", kind: "event", label: "consumes ApprovedOrders", status: "partial", intent: "Upstream approval signal.", provenBy: ["schema bound", "end-to-end trace: pending"] },
        ] },
        { id: "ci-verify", kind: "group", label: "Verification", status: "proven", children: [
          { id: "v1", kind: "verify", label: "duplicate prevention test", status: "proven", intent: "Same idempotencyKey twice, one invoice.", provenBy: ["PASS"] },
          { id: "v2", kind: "verify", label: "audit trail test", status: "proven", intent: "An invoice implies an audit record.", provenBy: ["PASS"] },
          { id: "v3", kind: "verify", label: "security scan", status: "proven", intent: "No payment token in any output.", provenBy: ["PASS"] },
        ] },
        { id: "ci-targets", kind: "group", label: "Targets", status: "info", children: [
          { id: "t1", kind: "target", label: "TypeScript", status: "info" },
          { id: "t2", kind: "target", label: "Python", status: "info" },
          { id: "t3", kind: "target", label: "OpenAPI", status: "info" },
          { id: "t4", kind: "target", label: "Terraform", status: "info" },
        ] },
      ],
    },
    {
      id: "resetpassword", kind: "system", label: "ResetPassword", status: "drift",
      intent: "Let a user securely reset their password. A weak reset flow is a common path to account takeover.",
      children: [
        { id: "rp-goal", kind: "goal", label: "Securely reset a password", status: "info" },
        { id: "rp-guar", kind: "group", label: "Guarantees", status: "drift", children: [
          { id: "rg1", kind: "guarantee", label: "reset links expire in 15 minutes", status: "proven", intent: "An expired link cannot reset a password.", provenBy: ["token-expiry test"] },
          { id: "rg2", kind: "guarantee", label: "a used token cannot be reused", status: "drift", intent: "Single-use tokens prevent replay.", provenBy: [] },
        ] },
        { id: "rp-never", kind: "group", label: "Prohibitions", status: "partial", children: [
          { id: "rp1", kind: "prohibition", label: "never reveal whether an email exists", status: "partial", intent: "Response is identical for known and unknown emails.", provenBy: ["manual review", "test: missing"] },
        ] },
        { id: "rp-targets", kind: "group", label: "Targets", status: "info", children: [
          { id: "rt1", kind: "target", label: "TypeScript", status: "info" },
          { id: "rt2", kind: "target", label: "Tests", status: "info" },
        ] },
      ],
    },
    {
      id: "placeorder", kind: "system", label: "PlaceOrder", status: "partial",
      intent: "Place an order and reserve inventory without overselling.",
      children: [
        { id: "po-goal", kind: "goal", label: "Place order & reserve inventory", status: "info" },
        { id: "po-guar", kind: "group", label: "Guarantees", status: "partial", children: [
          { id: "pg1", kind: "guarantee", label: "inventory is never oversold", status: "partial", intent: "Reservations cannot exceed stock.", provenBy: ["property test (passes)", "load test: pending"] },
        ] },
        { id: "po-events", kind: "group", label: "Events", status: "proven", children: [
          { id: "pe1", kind: "event", label: "publishes OrderPlaced", status: "proven", intent: "Fulfilment consumes this.", provenBy: ["event-contract test"] },
        ] },
        { id: "po-targets", kind: "group", label: "Targets", status: "info", children: [
          { id: "pt1", kind: "target", label: "TypeScript", status: "info" },
          { id: "pt2", kind: "target", label: "Go", status: "info" },
          { id: "pt3", kind: "target", label: "OpenAPI", status: "info" },
        ] },
      ],
    },
  ],
};

// Traceability: claim id -> verify id, and the reverse.
const TRACE: Record<string, string> = {};
(function collect(n: PNode) { if (n.provesRef) TRACE[n.id] = n.provesRef; (n.children || []).forEach(collect); })(MODEL);
const RTRACE: Record<string, string[]> = {};
Object.entries(TRACE).forEach(([c, v]) => { (RTRACE[v] = RTRACE[v] || []).push(c); });
function labelOf(id: string) { return findById(MODEL, id)?.label ?? id; }

const NODE_H = 32, XGAP = 234, YGAP = 44, PAD_L = 12, STRIPE = 4, MAXW = 200, MINW = 100;
const LABEL_FONT = '520 12.5px ui-sans-serif, system-ui, sans-serif';
let measurer: CanvasRenderingContext2D | null = null;
function textW(str: string) {
  if (typeof document === "undefined") return str.length * 7;
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  if (!measurer) return str.length * 7;
  measurer.font = LABEL_FONT;
  return measurer.measureText(str).width;
}
function truncate(str: string, max: number) {
  if (textW(str) <= max) return str;
  let s = str;
  while (s.length > 1 && textW(s + "…") > max) s = s.slice(0, -1);
  return s + "…";
}
function rollup(n: PNode) {
  let p = 0, q = 0, d = 0, total = 0;
  (function walk(x: PNode) {
    if (CLAIM.has(x.kind)) { total++; if (x.status === "proven") p++; else if (x.status === "partial") q++; else if (x.status === "drift") d++; }
    (x.children || []).forEach(walk);
  })(n);
  return { p, q, d, planned: total - p - q - d, total };
}
function findById(n: PNode, id: string): PNode | null {
  if (n.id === id) return n;
  for (const c of n.children || []) { const f = findById(c, id); if (f) return f; }
  return null;
}

export function ProofAtlas() {
  const widthCache = useRef(new Map<string, number>()).current;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(["resetpassword", "placeorder"]));
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const cover = rollup(MODEL);

  function nodeWidth(n: PNode) {
    const inner = truncate(n.label, MAXW - PAD_L - STRIPE - 16);
    n._display = inner;
    const cached = widthCache.get(n.id + inner);
    if (cached) return cached;
    let w = STRIPE + PAD_L + textW(inner) + 16;
    if (n.children && n.children.length) w += 22;
    w = Math.max(MINW, Math.min(MAXW, w));
    widthCache.set(n.id + inner, w);
    return w;
  }

  const nodes: PNode[] = [];
  const links: { a: PNode; b: PNode }[] = [];
  let row = 0;
  (function walk(n: PNode, depth: number, parent: PNode | null) {
    n._w = nodeWidth(n);
    const kids = n.children && !collapsed.has(n.id) ? n.children : [];
    if (!kids.length) { n._y = row * YGAP; row++; }
    else { kids.forEach((k) => walk(k, depth + 1, n)); n._y = (kids[0]._y! + kids[kids.length - 1]._y!) / 2; }
    n._x = depth * XGAP;
    nodes.push(n);
    if (parent) links.push({ a: parent, b: n });
  })(MODEL, 0, null);

  const width = 1 + Math.max(...nodes.map((n) => n._x! + n._w!)) + 44;
  const height = Math.max(row * YGAP + 20, 200);

  const toggle = (id: string) => setCollapsed((p) => { const nx = new Set(p); nx.has(id) ? nx.delete(id) : nx.add(id); return nx; });
  const sel = selected ? findById(MODEL, selected) : null;
  const seg = (n: number) => `${(n / cover.total) * 100}%`;

  // traceability edges for the selected node (claim <-> the check that proves it)
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const traceEdges: { a: PNode; b: PNode }[] = [];
  if (sel) {
    const partners: string[] = [];
    if (sel.provesRef) partners.push(sel.provesRef);
    (RTRACE[sel.id] || []).forEach((id) => partners.push(id));
    for (const pid of partners) { const pn = nodeById.get(pid); if (pn && pn !== sel) traceEdges.push({ a: sel, b: pn }); }
  }
  const partnerIds = new Set(traceEdges.map((e) => e.b.id));

  const jumpTo = (id: string) => setSelected(id);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-950/60">
      <style>{`.tl-trace{animation:tl-dash 1s linear infinite}@keyframes tl-dash{to{stroke-dashoffset:-18}}@media (prefers-reduced-motion:reduce){.tl-trace{animation:none}}`}</style>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/8 bg-ink-900/50 px-4 py-3">
        <div className="mr-auto flex items-baseline gap-3">
          <span className="font-mono text-[13px] font-semibold text-white">skyline-billing.thunder</span>
          <span className="font-mono text-[11px] text-haze-400">3 systems · {cover.total} claims · deterministic</span>
        </div>
        <div className="min-w-[200px]">
          <div className="mb-1.5 flex items-baseline justify-between font-mono text-[11px] text-haze-300">
            <span>Proof coverage</span>
            <span className="tabular-nums text-haze-200">{cover.p}/{cover.total} proven</span>
          </div>
          <div className="flex h-[9px] overflow-hidden rounded-md border border-white/10 bg-ink-800">
            <i style={{ width: seg(cover.p), background: C.proven }} />
            <i style={{ width: seg(cover.q), background: C.partial }} />
            <i style={{ width: seg(cover.d), background: C.drift }} />
            <i style={{ width: seg(cover.planned), background: C.planned }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-haze-300">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.proven }} />Proven</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.partial }} />Partial</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.drift }} />Drifting</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C.planned }} />Planned</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCollapsed(new Set())} className="rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 transition hover:border-white/25 hover:text-white">Expand all</button>
          <button onClick={() => setCollapsed(new Set(["resetpassword", "placeorder"]))} className="rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 transition hover:border-white/25 hover:text-white">Reset</button>
          <span className="inline-flex overflow-hidden rounded-lg border border-white/10">
            <button onClick={() => setZoom((z) => Math.max(0.55, z - 0.12))} aria-label="Zoom out" className="bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 hover:text-white">–</button>
            <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.12))} aria-label="Zoom in" className="border-l border-white/10 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-haze-200 hover:text-white">+</button>
          </span>
        </div>
      </div>

      <div className="relative h-[62vh] min-h-[440px] overflow-auto bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:30px_30px]">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", padding: "24px 40px 60px" }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", display: "block" }}>
            {links.map(({ a, b }, i) => {
              const x1 = a._x! + a._w!, y1 = a._y! + NODE_H / 2 + 8, x2 = b._x!, y2 = b._y! + NODE_H / 2 + 8, mx = (x1 + x2) / 2;
              return <path key={i} d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none"
                stroke={b.status === "drift" ? "rgba(251,111,132,0.45)" : C.strokeStrong} strokeWidth={1.3} />;
            })}
            {nodes.map((n) => {
              const x = n._x!, y = n._y! + 8, w = n._w!, isRoot = n.kind === "product";
              const hasKids = !!(n.children && n.children.length);
              const kindTxt = KIND_LABEL[n.kind] || "";
              const roll = n.kind === "system" ? rollup(n) : null;
              const isSel = n.id === selected;
              const isPartner = partnerIds.has(n.id);
              const tx = x + STRIPE + PAD_L;
              return (
                <g key={n.id} tabIndex={0} role="button" aria-label={`${n.label}, ${ST_NAME[n.status]}`} style={{ cursor: "pointer", outline: "none" }}
                   onClick={() => setSelected(n.id)}
                   onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && hasKids) toggle(n.id); }}>
                  <rect x={x} y={y} width={w} height={NODE_H} rx={9}
                    fill={isRoot ? "rgba(139,108,242,0.16)" : isPartner ? "rgba(139,108,242,0.10)" : C.fill}
                    stroke={isSel || isPartner ? C.accent : isRoot ? "rgba(139,108,242,0.55)" : C.stroke} strokeWidth={isSel || isPartner ? 1.9 : 1.2} />
                  <rect x={x + 4} y={y + 7} width={STRIPE} height={NODE_H - 14} rx={2} fill={stColor(n.status)} />
                  {kindTxt ? <text x={tx} y={y + 12} fontFamily="ui-monospace, monospace" fontSize={8.5} letterSpacing="0.11em" fill={C.ink3}>{kindTxt.toUpperCase()}</text> : null}
                  <text x={tx} y={kindTxt ? y + 24 : y + NODE_H / 2 + 4} fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize={isRoot ? 13.5 : 12.5} fontWeight={isRoot ? 680 : 520} fill={C.ink}>{n._display}</text>
                  {roll && roll.total ? (() => {
                    const barW = 46, bx = x + w - barW - (hasKids ? 24 : 10), by = y + NODE_H - 9, s = barW / roll.total;
                    let cx = bx;
                    const parts: JSX.Element[] = [];
                    ([["p", C.proven], ["q", C.partial], ["d", C.drift]] as const).forEach(([k, col], idx) => {
                      const val = roll[k as "p" | "q" | "d"];
                      if (val) { parts.push(<rect key={idx} x={cx} y={by} width={s * val} height={4} rx={1} fill={col} />); cx += s * val; }
                    });
                    return <g><rect x={bx} y={by} width={barW} height={4} rx={2} fill={C.panel2} />{parts}</g>;
                  })() : null}
                  {hasKids ? (() => {
                    const cxp = x + w - 12, cyp = y + NODE_H / 2, open = !collapsed.has(n.id);
                    return (
                      <g onClick={(e) => { e.stopPropagation(); toggle(n.id); }} role="button" aria-label={`${open ? "Collapse" : "Expand"} ${n.label}`}>
                        <circle cx={cxp} cy={cyp} r={9} fill={C.panel2} stroke={C.strokeStrong} strokeWidth={1.2} />
                        <text x={cxp} y={cyp + 3.4} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={10} fontWeight={700} fill={C.ink2}>{open ? "−" : "+"}</text>
                        {!open ? <text x={cxp} y={cyp + 15} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={8} fill={C.ink3}>{n.children!.length}</text> : null}
                      </g>
                    );
                  })() : null}
                </g>
              );
            })}

            {/* traceability edges: selected claim <-> the check that proves it */}
            {traceEdges.map(({ a, b }, i) => {
              const ax = a._x! + a._w!, ay = a._y! + NODE_H / 2 + 8;
              const bx = b._x! + b._w!, by = b._y! + NODE_H / 2 + 8;
              const cx = Math.max(ax, bx) + 58 + Math.abs(ay - by) * 0.12;
              return (
                <g key={`trace-${i}`}>
                  <path d={`M${ax} ${ay} C ${cx} ${ay}, ${cx} ${by}, ${bx} ${by}`} fill="none"
                    stroke={C.accent} strokeWidth={2} strokeDasharray="5 4" className="tl-trace" opacity={0.9} />
                  <circle cx={ax} cy={ay} r={3.5} fill={C.accent} />
                  <circle cx={bx} cy={by} r={3.5} fill={C.accent} />
                </g>
              );
            })}
          </svg>
        </div>

        <aside className={`absolute right-0 top-0 flex h-full w-[min(90vw,380px)] flex-col border-l border-white/10 bg-ink-900/95 backdrop-blur transition-transform duration-200 ${sel ? "translate-x-0" : "translate-x-full"}`} aria-hidden={!sel}>
          {sel && (
            <>
              <div className="relative border-b border-white/8 px-5 py-4">
                <button onClick={() => setSelected(null)} aria-label="Close details" className="absolute right-3.5 top-3.5 grid h-7 w-7 place-items-center rounded-lg border border-white/10 bg-ink-800 text-haze-300 hover:text-white">✕</button>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-haze-300">{KIND_LABEL[sel.kind] || sel.kind}</span>
                  {(CLAIM.has(sel.kind) || sel.kind === "system" || sel.kind === "event") && (
                    <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: stColor(sel.status), color: sel.status === "drift" || sel.status === "planned" ? "#fff" : "#06121a" }}>{ST_NAME[sel.status]}</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold leading-tight text-white">{sel.label}</h3>
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {sel.intent && (
                  <div className="mb-5">
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">Intent</div>
                    <p className="text-sm leading-relaxed text-haze-100">{sel.intent}</p>
                  </div>
                )}
                {sel.kind === "system" && (() => {
                  const r = rollup(sel);
                  return (
                    <div className="mb-5">
                      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">Proof rollup</div>
                      <p className="text-sm text-haze-200">
                        <b className="text-white">{r.p}/{r.total}</b> claims proven
                        {r.d ? <>, <b style={{ color: C.drift }}>{r.d} drifting</b></> : null}
                        {r.q ? <>, {r.q} partial</> : null}.
                      </p>
                    </div>
                  );
                })()}
                {Array.isArray(sel.provenBy) && sel.provenBy.length > 0 && (
                  <div className="mb-5">
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">{sel.status === "proven" ? "Proven by" : "Evidence"}</div>
                    {sel.provenBy.map((p, i) => {
                      const gap = /pending|missing/i.test(p);
                      return <div key={i} className="flex items-start gap-2 py-1 text-[13px] text-haze-200"><span className="font-mono font-bold" style={{ color: gap ? C.drift : C.proven }}>{gap ? "○" : "✓"}</span><span>{p}</span></div>;
                    })}
                  </div>
                )}
                {Array.isArray(sel.provenBy) && sel.provenBy.length === 0 && sel.status === "drift" && (
                  <div className="mb-5">
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">Gap</div>
                    <div className="flex items-start gap-2 text-[13px]" style={{ color: C.drift }}><span className="font-mono font-bold">!</span><span>Nothing proves this claim. This is where intent and reality can silently disagree, and where drift lives.</span></div>
                  </div>
                )}
                {(sel.provesRef || (RTRACE[sel.id] || []).length > 0) && (
                  <div className="mb-5">
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">Traceability</div>
                    {sel.provesRef && (
                      <button onClick={() => jumpTo(sel.provesRef!)} className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-ink-800 px-3 py-2 text-left text-[13px] text-haze-200 transition hover:border-gold-300/60 hover:text-white">
                        <span className="font-mono text-[11px] text-gold-300">check →</span>{labelOf(sel.provesRef)}
                      </button>
                    )}
                    {(RTRACE[sel.id] || []).map((cid) => (
                      <button key={cid} onClick={() => jumpTo(cid)} className="mt-2 flex w-full items-center gap-2 rounded-md border border-white/10 bg-ink-800 px-3 py-2 text-left text-[13px] text-haze-200 transition hover:border-gold-300/60 hover:text-white">
                        <span className="font-mono text-[11px] text-gold-300">proves →</span>{labelOf(cid)}
                      </button>
                    ))}
                  </div>
                )}
                {sel.kind === "system" && (() => {
                  const tg = (sel.children?.find((c) => c.id.endsWith("targets"))?.children) || [];
                  return tg.length ? (
                    <div className="mb-2">
                      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">Compiles to</div>
                      <div className="flex flex-wrap gap-2">{tg.map((t) => <span key={t.id} className="rounded-md border border-white/10 bg-ink-800 px-2.5 py-1 font-mono text-[11px] text-haze-200">{t.label}</span>)}</div>
                    </div>
                  ) : null;
                })()}
                {sel.kind === "product" && (
                  <div>
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-haze-500">Systems</div>
                    <div className="flex flex-wrap gap-2">{sel.children!.map((c) => <span key={c.id} className="rounded-md border border-white/10 bg-ink-800 px-2.5 py-1 font-mono text-[11px] text-haze-200">{c.label}</span>)}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
