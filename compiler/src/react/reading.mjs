// @skillstech/thunderlang/react: the Thunder drawing kit. One set of components that OpenThunder, thunderlang.dev,
// and the Skills Tech Talk course all use, so a reading looks and reads the same everywhere. Every word and its
// order come from readingLayout (../reading-layout.mjs); these components only turn that data into elements.
// Styling: plain `tl-` class names and one stylesheet (@skillstech/thunderlang/react/reading.css) whose colors are
// CSS variables, so each app sets its own (STT's --language-accent is honored). No JSX, no build step, no Tailwind:
// React is the only dependency, and it is the app's own (a peer dependency).
import { createElement as h, Fragment, useLayoutEffect, useRef, useState } from 'react';
import { THUNDER_VISUAL } from '../visual.mjs';
import { readingLayout, thingCard, dataCard, ioBoxes, detailsLayout, flowEdgeLabel, READING_LABELS } from '../reading-layout.mjs';

export { readingLayout, thingCard, dataCard, ioBoxes, detailsLayout, flowEdgeLabel, READING_LABELS };

/** A Thunder symbol, from the grammar's own path data. Its color is the CSS variable for its grammar color. */
export function ThunderSymbol({ id, size = 28, label }) {
  const s = THUNDER_VISUAL.symbols[id];
  if (!s) return null;
  return h('svg', {
    width: size, height: size, viewBox: '0 0 44 44', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinejoin: 'round', strokeLinecap: 'round',
    strokeDasharray: s.dashed ? '4 4' : undefined, className: `tl-symbol tl-c-${s.color}`,
    role: label ? 'img' : undefined, 'aria-label': label, 'aria-hidden': label ? undefined : true, focusable: 'false',
  },
  ...s.paths.map((d, i) => h('path', { key: `p${i}`, d })),
  ...(s.circles ?? []).map(([cx, cy, r], i) => h('circle', { key: `c${i}`, cx, cy, r, fill: s.fill ? 'currentColor' : 'none' })));
}

const knowsItem = (k) => h('li', { key: k.name, className: 'tl-knows-item' },
  h('span', { className: 'tl-knows-name' }, k.label),
  k.detail ? h('span', { className: 'tl-knows-detail' }, `: ${k.detail}`) : null);

/**
 * A Thing (a class): what it knows and what it can do. With `onOpen`, each ability and "How a new … starts" is a
 * button that calls onOpen(memberId); without it they are plain text.
 *   card: thingCard(model, thing), or pass `model` and `thing` and it is worked out here.
 */
export function ThingCard({ card, model, thing, onOpen, selected = false, headingLevel = 2 }) {
  const c = card ?? thingCard(model, thing);
  const hid = `tl-thing-${c.id}`;
  const ability = (m) => h(Fragment, null,
    h(ThunderSymbol, { id: m.symbol, size: 24 }),
    h('span', { className: 'tl-ability-label' }, m.label),
    onOpen ? h('span', { className: 'tl-ability-go', 'aria-hidden': true }, '→') : null);
  return h('section', { 'aria-labelledby': hid, className: `tl-card tl-thing${selected ? ' tl-selected' : ''}` },
    h('div', { className: 'tl-card-head' },
      h(ThunderSymbol, { id: 'thing', size: 44, label: 'Thing' }),
      h('div', null,
        h('p', { className: 'tl-kicker' }, c.heading),
        h(`h${headingLevel}`, { id: hid, className: 'tl-card-title' }, c.label))),
    c.doc ? h('p', { className: 'tl-doc' }, c.doc) : null,
    c.knows.items.length ? h(Fragment, null,
      h(`h${headingLevel + 1}`, { className: 'tl-section-label' }, c.knows.heading),
      h('ul', { className: 'tl-knows' }, c.knows.items.map(knowsItem))) : null,
    c.can.items.length ? h(Fragment, null,
      h(`h${headingLevel + 1}`, { className: 'tl-section-label' }, c.can.heading),
      h('ul', { className: 'tl-abilities' }, c.can.items.map((m) => h('li', { key: m.id },
        onOpen
          ? h('button', { type: 'button', className: 'tl-ability tl-ability-button', onClick: () => onOpen(m.id) }, ability(m))
          : h('div', { className: 'tl-ability' }, ability(m)))))) : null,
    c.starts.id && onOpen
      ? h('button', { type: 'button', className: 'tl-starts tl-starts-button', onClick: () => onOpen(c.starts.id) }, h(ThunderSymbol, { id: 'setup', size: 18 }), c.starts.text)
      : h('p', { className: 'tl-starts' }, h(ThunderSymbol, { id: 'setup', size: 18 }), c.starts.text));
}

/** Data: a record (facts, like an ID card) or choices (one allowed value). */
export function DataCard({ card, thing, headingLevel = 3 }) {
  const c = card ?? dataCard(thing);
  return h('section', { className: `tl-card tl-data tl-data-${c.kind}` },
    h('div', { className: 'tl-card-head' },
      h(ThunderSymbol, { id: c.symbol, size: 30, label: c.symbolLabel }),
      h('div', null,
        h('p', { className: 'tl-kicker tl-kicker-quiet' }, c.heading),
        h(`h${headingLevel}`, { className: 'tl-card-title tl-card-title-small' }, c.label))),
    c.doc ? h('p', { className: 'tl-doc tl-doc-small' }, c.doc) : null,
    c.choices.length ? h('ul', { className: 'tl-choices' }, c.choices.map((x) => h('li', { key: x, className: 'tl-choice' }, x))) : null,
    c.knows.length ? h('ul', { className: 'tl-knows tl-knows-small' }, c.knows.map(knowsItem)) : null);
}

/** A "line N" button that opens the original code there, or nothing without onLine or a line. */
const LineButton = ({ line, onLine, className = 'tl-line' }) => (line == null || !onLine ? null
  : h('button', { type: 'button', className, onClick: () => onLine(line), title: 'See the original code at this line' }, READING_LABELS.openLine(line)));

/**
 * What goes in and out of one action or rule: You give it, You get back, It can stop with, and "Part of <Thing>".
 *   card: ioBoxes(model, member), or pass `model` and `member`.
 *   onLine(line) makes each stop's line a button; onThing(thingId) makes "Part of …" a button back to its card.
 *   children: anything the app adds under the boxes (an AI summary, nearby rules).
 */
export function IOBoxes({ card, model, member, onLine, onThing, headingLevel = 3, children }) {
  const c = card ?? ioBoxes(model, member);
  const H = `h${headingLevel}`;
  return h('section', { className: 'tl-card tl-io-card', 'aria-label': READING_LABELS.io },
    c.doc ? h('p', { className: 'tl-doc tl-io-doc' }, c.doc) : null,
    h('div', { className: 'tl-io' },
      h('section', { className: 'tl-io-box tl-io-give' },
        h(H, { className: 'tl-io-label' }, h('span', { 'aria-hidden': true }, '→ '), c.give.heading),
        c.give.items.length
          ? h('ul', { className: 'tl-pills' }, c.give.items.map((g) => h('li', { key: g.label, className: 'tl-pill tl-pill-fact' }, g.label, g.kind ? h('span', { className: 'tl-pill-kind' }, `: ${g.kind}`) : null)))
          : h('p', { className: 'tl-quiet' }, c.give.empty)),
      h('section', { className: 'tl-io-box tl-io-back' },
        h(H, { className: 'tl-io-label' }, h('span', { 'aria-hidden': true }, '⇥ '), c.getBack.heading),
        c.getBack.items.length ? h('ul', { className: 'tl-pills' }, c.getBack.items.map((t) => h('li', { key: t, className: 'tl-pill tl-pill-outcome' }, t))) : h('p', { className: 'tl-quiet' }, c.getBack.empty))),
    c.stops.items.length ? h('section', { className: 'tl-io-box tl-io-stops' },
      h(H, { className: 'tl-io-label' }, h(ThunderSymbol, { id: 'stop', size: 14 }), ' ', c.stops.heading),
      h('ul', { className: 'tl-stop-list' }, c.stops.items.map((x, i) => h('li', { key: i, className: 'tl-stop-row' },
        h(ThunderSymbol, { id: 'stop', size: 14 }), h('span', { className: 'tl-stop-text' }, x.text), h(LineButton, { line: x.line, onLine }))))) : null,
    children ?? null,
    c.partOf ? (onThing
      ? h('button', { type: 'button', className: 'tl-part-of tl-part-of-button', onClick: () => onThing(c.partOf.id) }, h(ThunderSymbol, { id: 'thing', size: 18 }), c.partOf.text)
      : h('p', { className: 'tl-part-of' }, h(ThunderSymbol, { id: 'thing', size: 18 }), c.partOf.text)) : null);
}

/**
 * The Big Picture, zoomed by `focus` (see readingLayout): Things and Data, or, for an action or rule, its IO boxes.
 */
export function BigPicture({ model, layout, focus = null, onOpen, onLine, onThing, selectedId, headingLevel = 2, children }) {
  const l = layout ?? readingLayout(model, { focus });
  return h('div', { className: 'tl-reading tl-big-picture' }, l.sections.map((s) => h('section', { key: s.id, className: `tl-bp-section tl-bp-${s.id}`, 'aria-label': s.heading },
    s.id === 'io'
      ? s.cards.map((c) => h(IOBoxes, { key: c.id, card: c, onLine, onThing, headingLevel: headingLevel + 1 }, children))
      : h('div', { className: s.id === 'things' ? 'tl-bp-things' : 'tl-bp-data' }, s.cards.map((c) => (c.kind === 'thing'
        ? h(ThingCard, { key: c.id, card: c, onOpen, selected: c.id === selectedId, headingLevel })
        : h(DataCard, { key: c.id, card: c, headingLevel: headingLevel + 1 })))))));
}

const doesOf = (does) => THUNDER_VISUAL.does[does ?? ''] ?? { mark: '·', label: 'Does', color: 'structure' };

/**
 * Flow: one action or rule, step by step. Every node sits at the lane and row the compiler gives it, every edge is
 * the compiler's (Yes / No / For each / Done / If it fails), each node's mark and color come from DOES. Steps Thunder
 * could only show as code are dashed. The app adds only the interaction:
 *   flow: member.flow (or readLevel(model, 'flow', id).flow)
 *   onLine(line): each node's line opens the original code.  onUse(memberId): a step that uses a rule opens it.
 *   marks + markAs: Thunder Diff highlights nodes as 'added' (New) or 'removed' (Gone).
 * Edges are measured from the drawn nodes, so they appear after the first paint (none in server rendering).
 */
export function Flow({ flow, onLine, onUse, useLabel, marks, markAs }) {
  const box = useRef(null);
  const refs = useRef(new Map());
  const [pos, setPos] = useState(() => new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const lanes = Math.max(1, ...flow.nodes.map((n) => n.lane + 1));
  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current?.getBoundingClientRect();
      if (!root) return;
      const next = new Map();
      for (const [id, el] of refs.current) { const r = el.getBoundingClientRect(); next.set(id, { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height }); }
      setPos(next);
      setSize({ w: box.current.clientWidth, h: box.current.scrollHeight });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && box.current) ro.observe(box.current);
    return () => ro?.disconnect();
  }, [flow]);
  const edges = flow.edges.map((e, i) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return null;
    const same = Math.abs(a.x - b.x) < 4;
    const x1 = same ? a.x + a.w / 2 : a.x + a.w, y1 = same ? a.y + a.h : a.y + a.h / 2;
    const x2 = same ? b.x + b.w / 2 : b.x + (b.x > a.x ? 0 : b.w), y2 = same ? b.y : b.y + b.h / 2;
    const d = same ? `M${x1} ${y1} L${x2} ${y2 - 2}` : `M${x1} ${y1} C${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2 + (b.x > a.x ? -2 : 2)} ${y2}`;
    const label = flowEdgeLabel(e);
    const lx = same ? x1 + 8 : (x1 + x2) / 2, ly = same ? (y1 + y2) / 2 + 4 : Math.min(y1, y2) - 6 + Math.abs(y2 - y1) / 2;
    return h('g', { key: i, className: `tl-edge tl-edge-${e.label ?? 'next'}` }, h('path', { d, markerEnd: 'url(#tl-arrow)' }), label ? h('text', { x: lx, y: ly }, label) : null);
  });
  return h('div', { className: 'tl-reading tl-flow', ref: box, style: { gridTemplateColumns: `repeat(${lanes}, minmax(200px, 1fr))` } },
    h('svg', { className: 'tl-edges', width: size.w, height: size.h, 'aria-hidden': true },
      h('defs', null, h('marker', { id: 'tl-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, h('path', { d: 'M0 0 L10 5 L0 10 z' }))),
      edges),
    flow.nodes.map((n) => {
      const does = doesOf(n.does);
      const color = n.kind === 'stop' ? 'failure' : n.kind === 'decision' ? 'question' : does.color;
      const symbol = n.kind === 'stop' ? 'stop' : n.kind === 'decision' ? 'rule' : n.kind === 'start' ? 'action' : null;
      const mark = marks?.has(n.id) ? markAs : undefined;
      return h('div', {
        key: n.id, ref: (el) => { if (el) refs.current.set(n.id, el); else refs.current.delete(n.id); },
        className: `tl-node tl-node-${n.kind} tl-tone-${color}${n.code || n.kind === 'code' ? ' tl-node-code' : ''}${mark ? ` tl-mark-${mark}` : ''}`,
        style: { gridRow: n.row + 1, gridColumn: n.lane + 1 },
      },
      h('span', { className: 'tl-node-mark', 'aria-hidden': true, title: does.label }, symbol ? h(ThunderSymbol, { id: symbol, size: 15 }) : does.mark),
      mark ? h('span', { className: `tl-badge tl-badge-${mark}` }, mark === 'added' ? 'New' : 'Gone') : null,
      h('span', { className: 'tl-node-text', title: n.text }, n.kind === 'code' ? h('code', null, n.text) : n.text),
      n.uses && onUse ? h('button', { type: 'button', className: 'tl-node-use', onClick: () => onUse(n.uses), title: 'Open the rule this step uses, and try it' }, `${useLabel?.(n.uses) ?? READING_LABELS.openRule} →`) : null,
      h(LineButton, { line: n.line, onLine }));
    }));
}

function Whens({ when }) {
  if (!when.length) return h('span', { className: 'tl-quiet' }, READING_LABELS.details.always);
  return h(Fragment, null, when.map((w, k) => h('span', { key: k, className: 'tl-cond' },
    h('span', { className: 'tl-cond-q' }, w.question), ' ',
    h('span', { className: `tl-ans tl-ans-${w.answer === 'Yes' ? 'yes' : w.answer === 'No' ? 'no' : 'each'}` }, w.answer),
    k < when.length - 1 ? h('span', { className: 'tl-cond-and', 'aria-hidden': true }, '·') : null)));
}

/**
 * Details: the same action sorted into facts, each with its line. `view` is readLevel(model, 'details', memberId)
 * (or pass `layout` from detailsLayout). Sections appear only when the compiler gives them.
 *   onLine(line) opens the original code.  rules: the app's own cards for the rules it relies on, drawn in place of
 *   the plain "It relies on" list (OpenThunder's try-it cards).
 */
export function Details({ view, layout, onLine, rules, headingLevel = 3 }) {
  const d = layout ?? detailsLayout(view);
  const H = `h${headingLevel}`;
  const card = (cls, heading, icon, ...body) => h('section', { className: `tl-card tl-details-card${cls ? ` ${cls}` : ''}` },
    h(H, { className: 'tl-details-h' }, icon, heading), ...body);
  const doesMark = (does, mark) => { const x = doesOf(does); return h('span', { className: `tl-does tl-c-${x.color}`, title: x.label }, mark || x.mark); };
  return h('div', { className: 'tl-reading tl-details' },
    h('div', { className: 'tl-stats', 'aria-label': d.heading }, d.stats.map((s) => h('span', { key: s.id, className: `tl-stat tl-stat-${s.id}` }, h('b', null, s.count), ` ${s.text}`))),
    d.give ? h('div', { className: 'tl-io' },
      card('tl-io-give', d.give.heading, h('span', { 'aria-hidden': true }, '→ '),
        d.give.items.length ? h('ul', { className: 'tl-inputs' }, d.give.items.map((i) => h('li', { key: i.label },
          h('span', { className: 'tl-pill tl-pill-fact' }, i.label),
          i.lines.length && onLine ? h('span', { className: 'tl-used' }, `${READING_LABELS.details.usedOn} `, i.lines.map((l, k) => h(Fragment, { key: l }, k > 0 ? ', ' : null,
            h('button', { type: 'button', className: 'tl-line tl-line-inline', onClick: () => onLine(l), title: 'See this line' }, l)))) : null)))
          : h('p', { className: 'tl-quiet' }, d.give.empty)),
      card('tl-io-back', d.getBack.heading, h('span', { 'aria-hidden': true }, '⇥ '),
        d.getBack.items.length ? h('ul', { className: 'tl-rows' }, d.getBack.items.map((g, i) => h('li', { key: i },
          h('div', { className: 'tl-row-top' }, h('span', { className: 'tl-strong' }, g.text), h(LineButton, { line: g.line, onLine })),
          g.when ? h('div', { className: 'tl-when' }, h(Whens, { when: g.when })) : null)))
          : h('p', { className: 'tl-quiet' }, d.getBack.empty))) : null,
    d.stops ? card('tl-details-stops', d.stops.heading, h(ThunderSymbol, { id: 'stop', size: 15 }),
      d.stops.items.length ? h('ul', { className: 'tl-rows' }, d.stops.items.map((s, i) => h('li', { key: i, className: 'tl-stop-row-detail' },
        h('div', { className: 'tl-row-top' }, h('b', null, s.error), s.message ? h('span', { className: 'tl-message' }, `"${s.message}"`) : null, h(LineButton, { line: s.line, onLine })),
        h('div', { className: 'tl-when' }, h(Whens, { when: s.when })))))
        : h('p', { className: 'tl-quiet' }, d.stops.empty)) : null,
    d.changes ? card(null, d.changes.heading, h('span', { 'aria-hidden': true }, '= '),
      h('ul', { className: 'tl-rows' }, d.changes.items.map((c, i) => h('li', { key: i },
        h('div', { className: 'tl-row-top' }, doesMark(c.does), h('span', { className: 'tl-strong' }, c.text), h(LineButton, { line: c.line, onLine })),
        c.when.length ? h('div', { className: 'tl-when' }, h(Whens, { when: c.when })) : null)))) : null,
    d.answers ? card(null, d.answers.heading, h(ThunderSymbol, { id: 'rule', size: 15 }),
      h('ol', { className: 'tl-answers' }, d.answers.items.map((a, i) => h('li', { key: i }, h('b', null, a.answer), ' ', h('span', { className: 'tl-quiet' }, a.when))))) : null,
    d.limits ? card(null, d.limits.heading, h(ThunderSymbol, { id: 'rule', size: 15 }),
      h('p', { className: 'tl-quiet tl-limits-note' }, d.limits.note),
      h('div', { className: 'tl-limits' }, d.limits.items.map((r, i) => h('div', { key: i, className: 'tl-limit' }, h('span', { className: 'tl-range' }, r.range), h('b', null, r.answer))))) : null,
    d.steps ? card(null, d.steps.heading, h('span', { 'aria-hidden': true }, '≡ '),
      h('ul', { className: 'tl-steps' }, d.steps.items.map((s) => h('li', { key: s.id, className: s.notExplained ? 'tl-step-code' : undefined, style: { paddingLeft: 4 + s.depth * 18 } },
        doesMark(s.does, s.mark),
        h('span', { className: 'tl-step-text' }, s.notExplained ? h('code', null, s.text) : s.text, s.via ? h('span', { className: 'tl-quiet' }, ` · ${s.via}`) : null),
        h(LineButton, { line: s.line, onLine }))))) : null,
    d.reliesOn && !rules ? card(null, d.reliesOn.heading, h(ThunderSymbol, { id: 'rule', size: 15 }),
      h('ul', { className: 'tl-rows' }, d.reliesOn.items.map((r) => h('li', { key: r.id },
        h('div', { className: 'tl-row-top' }, h(ThunderSymbol, { id: r.symbol, size: 14 }), h('b', null, r.label)),
        r.says ? h('div', { className: 'tl-quiet' }, r.says) : null)))) : null,
    rules ?? null,
    d.usedBy ? h('p', { className: 'tl-quiet' }, `${d.usedBy.heading}: ${d.usedBy.items.map((u) => u.label).join(', ')}.`) : null,
    d.openQuestions ? card('tl-details-open', d.openQuestions.heading, null, h('ul', { className: 'tl-rows' }, d.openQuestions.items.map((q) => h('li', { key: q }, q)))) : null,
    d.source ? h('p', { className: 'tl-source' }, d.source) : null);
}
