// The drawing kit: one layout (words and order) that OpenThunder, thunderlang.dev, and the Skills Tech Talk course
// all draw from, the React components that draw it, and the stylesheet's color variables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { thunderModel } from '../src/model.mjs';
import { THUNDER_VISUAL } from '../src/visual.mjs';
import { readingLayout, READING_LABELS, READING_LAYOUT_SCHEMA } from '../src/core.mjs';

const SHOP = `from dataclasses import dataclass
from enum import Enum


class Size(Enum):
    SMALL = "small"
    LARGE = "large"


@dataclass
class Address:
    street: str
    city: str


class Cart:
    """What a customer is about to buy."""

    def __init__(self, owner: str):
        self.owner = owner
        self.items = []

    def add(self, item):
        self.items.append(item)

    def is_empty(self) -> bool:
        return len(self.items) == 0
`;
const model = thunderModel([{ path: 'shop.py', source: SHOP }]);

test('the Big Picture: Things first, then records, then choices, with the shared labels', () => {
  const l = readingLayout(model);
  assert.equal(l.schema, READING_LAYOUT_SCHEMA);
  assert.deepEqual(l.sections.map((s) => s.id), ['things', 'data']);
  const [cart] = l.sections[0].cards;
  assert.equal(cart.heading, 'A Thing');
  assert.equal(cart.label, 'Cart');
  assert.equal(cart.doc, 'What a customer is about to buy.');
  assert.equal(cart.knows.heading, 'It knows');
  assert.deepEqual(cart.knows.items.map((k) => k.label), ['owner', 'items']);
  assert.equal(cart.can.heading, 'It can');
  assert.deepEqual(cart.can.items.map((m) => m.label), ['Add', 'Is empty']);
  assert.equal(cart.starts.text, 'How a new Cart starts');
  assert.ok(cart.starts.id, 'the setup is a door to open');
  assert.deepEqual(l.sections[1].cards.map((c) => [c.label, c.heading]), [['Address', 'Data: a record'], ['Size', 'Data: choices']]);
  assert.deepEqual(l.sections[1].cards[1].choices, ['small', 'large']);
});

test('the labels are the ones the products already show (a change here changes every app)', () => {
  assert.deepEqual([READING_LABELS.thing, READING_LABELS.knows, READING_LABELS.can, READING_LABELS.starts('Cart'), READING_LABELS.record, READING_LABELS.choices],
    ['A Thing', 'It knows', 'It can', 'How a new Cart starts', 'Data: a record', 'Data: choices']);
});

test('the stylesheet has a variable and a class for every grammar color, in the dark and the light set', () => {
  const css = readFileSync(new URL('../src/react/reading.css', import.meta.url), 'utf8');
  for (const name of Object.keys(THUNDER_VISUAL.colors)) {
    assert.equal(css.match(new RegExp(`--tl-c-${name}:`, 'g'))?.length, 2, `--tl-c-${name} in both sets`);
    assert.match(css, new RegExp(`\\.tl-c-${name} \\{ color: var\\(--tl-c-${name}\\); \\}`));
  }
  assert.match(css, /--tl-accent: var\(--language-accent/, 'a course accent is honored');
});

test('the layout and the kit load no Node-only module', () => {
  const seen = new Set(), bad = [];
  const walk = (url) => {
    if (seen.has(url.href)) return; seen.add(url.href);
    for (const m of readFileSync(url, 'utf8').matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (m[1].startsWith('node:')) bad.push(`${url.pathname} -> ${m[1]}`);
      else if (m[1].startsWith('.') && m[1].endsWith('.mjs')) walk(new URL(m[1], url));
    }
  };
  walk(new URL('../src/react/reading.mjs', import.meta.url));
  assert.deepEqual(bad, []);
});

// Drawn with React when React is installed (it is the app's own: a peer dependency).
let react = null;
try { const req = createRequire(import.meta.url); req.resolve('react'); req.resolve('react-dom/server'); react = true; } catch { /* not installed here */ }

test('the components draw the layout: headings, "It knows" in order, buttons only with onOpen', { skip: !react && 'React is not installed next to the compiler' }, async () => {
  const { createElement: h } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { BigPicture, ThingCard } = await import('../src/react/reading.mjs');
  const html = renderToStaticMarkup(h(BigPicture, { model, onOpen: () => {} }));
  const order = ['A Thing', '>Cart<', 'It knows', '>owner<', '>items<', 'It can', '>Add<', '>Is empty<', 'How a new Cart starts', 'Data: a record', '>Address<', 'Data: choices', '>Size<', '>small<'];
  let at = -1;
  for (const w of order) { const i = html.indexOf(w, at + 1); assert.ok(i > at, `"${w}" comes after the one before`); at = i; }
  assert.equal(html.match(/<button/g)?.length, 3, 'two abilities and how it starts');
  const still = renderToStaticMarkup(h(ThingCard, { model, thing: model.things.find((t) => t.label === 'Cart') }));
  assert.ok(!still.includes('<button'), 'no buttons without onOpen');
  assert.match(still, /<h2 id="tl-thing-[^"]+" class="tl-card-title">Cart<\/h2>/);
});

test('the Big Picture zooms with focus: a Thing, a file, an action (its IO boxes), or nothing for an unknown id', () => {
  const src = 'class Shop:\n    def order(self, total: float, distance: float) -> str:\n        """Place an order."""\n        if distance > 15:\n            raise ValueError("TooFar")\n        return "ok"\n';
  const m = thunderModel([{ path: 'shop.py', source: SHOP }, { path: 'orders.py', source: src }]);
  assert.deepEqual(readingLayout(m).sections[0].cards.map((c) => c.label), ['Cart', 'Shop']);
  assert.deepEqual(readingLayout(m, { focus: 'orders.py' }).sections.map((s) => s.cards.map((c) => c.label)), [['Shop']]);
  const cartFocus = readingLayout(m, { focus: 'shop.py#Cart' });
  assert.equal(cartFocus.focus.kind, 'thing');
  assert.deepEqual(cartFocus.sections.map((s) => s.cards.map((c) => c.label)), [['Cart'], ['Address', 'Size']]);
  const order = m.members.find((x) => x.name === 'order');
  const io = readingLayout(m, { focus: order.id });
  assert.equal(io.focus.kind, 'member');
  const [box] = io.sections[0].cards;
  assert.deepEqual([box.give.heading, box.getBack.heading, box.stops.heading], ['You give it', 'You get back', 'It can stop with']);
  assert.deepEqual(box.give.items, [{ label: 'total', kind: 'a number' }, { label: 'distance', kind: 'a number' }]);
  assert.equal(box.getBack.text, 'words');
  assert.deepEqual(box.getBack.items, ['words']);
  assert.deepEqual(box.stops.items, [{ text: 'ValueError: "TooFar"', line: 5 }]);
  assert.deepEqual(box.partOf, { id: 'orders.py#Shop', text: 'Part of Shop' });
  assert.deepEqual(readingLayout(m, { focus: 'nope' }), { schema: READING_LAYOUT_SCHEMA, focus: { kind: 'unknown', id: 'nope' }, sections: [] });
});

// Step 2: the IO boxes, Flow, and Details join the kit, so all three products draw them the same way.
const ORDERS = 'class Shop:\n    def order(self, total: float, distance: float) -> str:\n        """Place an order."""\n        if distance > 15:\n            raise ValueError("TooFar")\n        return "ok"\n';
const shop = thunderModel([{ path: 'orders.py', source: ORDERS }]);
const order = shop.members.find((x) => x.name === 'order');

test('Flow edges say the shared words, a case its own words, and a plain step nothing', async () => {
  const { flowEdgeLabel } = await import('../src/core.mjs');
  assert.deepEqual(['yes', 'no', 'each', 'done', 'error', 'nested'].map((label) => flowEdgeLabel({ label })), ['Yes', 'No', 'For each', 'Done', 'If it fails', 'Runs on its own']);
  assert.equal(flowEdgeLabel({ label: 'case', text: 'When it is gold' }), 'When it is gold');
  assert.equal(flowEdgeLabel({ label: 'case' }), 'When');
  assert.equal(flowEdgeLabel({ label: 'next' }), null);
  assert.equal(flowEdgeLabel({}), null);
  assert.equal(flowEdgeLabel({ label: 'brand-new' }), 'brand-new', 'an edge the kit does not know yet is shown, never dropped');
});

test('Details: counts at a glance, then give and get back, stops, steps, each with its line, and only what the compiler gave', async () => {
  const { readLevel, detailsLayout } = await import('../src/core.mjs');
  const view = readLevel(shop, 'details', order.id);
  const d = detailsLayout(view);
  assert.deepEqual(d.stats.find((s) => s.id === 'inputs'), { id: 'inputs', count: 2, text: 'things you give it' });
  assert.equal(d.give.heading, 'You give it');
  assert.deepEqual(d.give.items.map((i) => i.label), ['total', 'distance']);
  assert.equal(d.getBack.heading, 'You get back');
  assert.ok(d.getBack.items.length > 0, 'what it gives back');
  assert.equal(d.stops.heading, 'When it stops');
  assert.equal(d.stops.items.length, 1);
  assert.equal(d.stops.items[0].line, 5);
  assert.equal(d.steps.heading, 'Every step, with its line');
  assert.ok(d.steps.items.every((s) => 'line' in s && 'depth' in s));
  // A section the compiler did not give is null, never an empty guess.
  const bare = detailsLayout({ steps: [] });
  assert.deepEqual([bare.give, bare.stops, bare.changes, bare.limits, bare.reliesOn], [null, null, null, null, null]);
  assert.deepEqual(bare.stats, [{ id: 'steps', count: 0, text: 'steps' }]);
  // What it gives back falls back the way the Big Picture does: youGetBack, then the Flow's end steps.
  assert.deepEqual(detailsLayout({ youGive: ['a'], youGetBack: 'words' }).getBack.items, [{ text: 'words', line: null, when: null }]);
});

test('the kit draws the IO boxes in the Big Picture, then Flow and Details, with buttons only when the app gives callbacks', { skip: !react && 'React is not installed next to the compiler' }, async () => {
  const { createElement: h } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { readLevel } = await import('../src/core.mjs');
  const { BigPicture, IOBoxes, Flow, Details } = await import('../src/react/reading.mjs');
  const bp = renderToStaticMarkup(h(BigPicture, { model: shop, focus: order.id, onLine: () => {}, onThing: () => {} }, h('p', null, 'extra from the app')));
  let at = -1;
  for (const w of ['Place an order.', 'You give it', '>total<', ': a number', '>distance<', 'You get back', '>words<', 'It can stop with', 'ValueError: &quot;TooFar&quot;', 'line 5', 'extra from the app', 'Part of Shop']) {
    const i = bp.indexOf(w, at + 1); assert.ok(i > at, `"${w}" comes after the one before`); at = i;
  }
  assert.equal(bp.match(/<button/g)?.length, 2, 'the stop line and Part of Shop');
  const still = renderToStaticMarkup(h(IOBoxes, { model: shop, member: order }));
  assert.ok(!still.includes('<button'), 'no buttons without callbacks');

  const flow = renderToStaticMarkup(h(Flow, { flow: order.flow, onLine: () => {} }));
  assert.equal(flow.match(/class="tl-node /g)?.length, order.flow.nodes.length, 'every node drawn');
  assert.match(flow, /tl-node-stop tl-tone-failure/);
  assert.match(flow, /tl-node-decision tl-tone-question/);
  assert.match(flow, />line 5</);
  assert.ok(!renderToStaticMarkup(h(Flow, { flow: order.flow })).includes('<button'), 'no line buttons without onLine');

  const det = renderToStaticMarkup(h(Details, { view: readLevel(shop, 'details', order.id), onLine: () => {} }));
  at = -1;
  for (const w of ['things you give it', 'You give it', 'You get back', 'When it stops', 'Every step, with its line']) {
    const i = det.indexOf(w, at + 1); assert.ok(i > at, `"${w}" comes after the one before`); at = i;
  }
  const withRules = renderToStaticMarkup(h(Details, { view: readLevel(shop, 'details', order.id), rules: h('div', { id: 'app-rules' }) }));
  assert.match(withRules, /id="app-rules"/);
});

test('the IO boxes say what it gives back from the Flow when the code declares no result, so they agree with Flow and Details', async () => {
  const { ioBoxes } = await import('../src/core.mjs');
  const fees = thunderModel([{ path: 'fees.py', source: 'def late_fee(days_late):\n    """Small fines for late books."""\n    if days_late <= 0:\n        return "No fee"\n    if days_late <= 7:\n        return "Small fee"\n    return "Big fee"\n' }]);
  const fee = fees.members.find((x) => x.name === 'late_fee');
  const box = ioBoxes(fees, fee);
  assert.equal(box.getBack.text, null, 'nothing declared');
  assert.equal(box.getBack.items.length, 3);
  assert.ok(box.getBack.items.every((t) => !/^Gives back/i.test(t)));
});

test('plain functions: the Big Picture lists the actions and rules that belong to no Thing, after the Data', () => {
  const FUNCS = 'def total(prices):\n    """Add them up."""\n    return sum(prices)\n\n\ndef is_big(n) -> bool:\n    return n > 10\n';
  const only = thunderModel([{ path: 'calc.py', source: FUNCS }]);
  const l = readingLayout(only);
  assert.deepEqual(l.sections.map((s) => s.id), ['actions'], 'a file of functions is not an empty picture');
  assert.equal(l.sections[0].heading, READING_LABELS.actions);
  assert.deepEqual(l.sections[0].cards.map((c) => [c.label, c.doc]), [['Total', 'Add them up.'], ['Is big?', null]]);
  assert.deepEqual(readingLayout(only, { focus: 'calc.py' }).sections.map((s) => s.id), ['actions']);
  // With a Thing, its own abilities stay on its card; only the loose ones are listed.
  const both = thunderModel([{ path: 'shop.py', source: SHOP + '\n\ndef tax(amount):\n    return amount * 0.2\n' }]);
  const b = readingLayout(both);
  assert.deepEqual(b.sections.map((s) => s.id), ['things', 'data', 'actions']);
  assert.deepEqual(b.sections[2].cards.map((c) => c.label), ['Tax']);
  assert.deepEqual(readingLayout(both, { focus: both.things.find((t) => t.label === 'Cart').id }).sections.map((s) => s.id), ['things', 'data'], 'a Thing in focus does not list loose functions');
});

test('phone and panel fixes: answer tags never break inside a word, Data columns follow their container', () => {
  const css = readFileSync(new URL('../src/react/reading.css', import.meta.url), 'utf8');
  assert.match(css, /\.tl-ans \{[^}]*white-space: nowrap/);
  assert.match(css, /\.tl-ans \{[^}]*flex: none/);
  assert.match(css, /\.tl-bp-data \{[^}]*repeat\(auto-fill, minmax\(min\(100%, 240px\), 1fr\)\)/);
  assert.doesNotMatch(css, /760px/);
});
