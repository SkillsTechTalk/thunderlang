// @skillstech/thunderlang/react: the Thunder drawing kit. One set of components that OpenThunder, thunderlang.dev,
// and the Skills Tech Talk course all use, so a reading looks and reads the same everywhere. Every word and its
// order come from readingLayout (../reading-layout.mjs); these components only turn that data into elements.
// Styling: plain `tl-` class names and one stylesheet (@skillstech/thunderlang/react/reading.css) whose colors are
// CSS variables, so each app sets its own (STT's --language-accent is honored). No JSX, no build step, no Tailwind:
// React is the only dependency, and it is the app's own (a peer dependency).
import { createElement as h, Fragment } from 'react';
import { THUNDER_VISUAL } from '../visual.mjs';
import { readingLayout, thingCard, dataCard, ioBoxes, READING_LABELS } from '../reading-layout.mjs';

export { readingLayout, thingCard, dataCard, ioBoxes, READING_LABELS };

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

/**
 * The Big Picture, zoomed by `focus` (see readingLayout). The IO boxes for an action or rule are drawn by IOBoxes,
 * which joins the kit next; until then that section is left to the app.
 */
export function BigPicture({ model, layout, focus = null, onOpen, selectedId, headingLevel = 2 }) {
  const l = layout ?? readingLayout(model, { focus });
  return h('div', { className: 'tl-reading tl-big-picture' }, l.sections.filter((s) => s.id !== 'io').map((s) => h('section', { key: s.id, className: `tl-bp-section tl-bp-${s.id}`, 'aria-label': s.heading },
    h('div', { className: s.id === 'things' ? 'tl-bp-things' : 'tl-bp-data' }, s.cards.map((c) => (c.kind === 'thing'
      ? h(ThingCard, { key: c.id, card: c, onOpen, selected: c.id === selectedId, headingLevel })
      : h(DataCard, { key: c.id, card: c, headingLevel: headingLevel + 1 })))))));
}
