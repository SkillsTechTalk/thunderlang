// What a Thunder reading shows, and in what order, as plain data: the words on every card, which list comes first,
// and what each entry opens. Every app that draws a reading (OpenThunder, thunderlang.dev, the Skills Tech Talk
// course) draws from this, so the three say the same thing in the same order; the drawing kit
// (@skillstech/thunderlang/react) only turns it into elements. Pure, deterministic, browser-safe, no React.

export const READING_LAYOUT_SCHEMA = 'thunder-reading-layout-v1';

/** Every fixed word a reading shows. Change a label here and every app changes with it. */
export const READING_LABELS = Object.freeze({
  thing: 'A Thing',
  knows: 'It knows',
  can: 'It can',
  starts: (label) => `How a new ${label} starts`,
  startsWithKnows: (label) => `A new ${label} starts with what it knows above`,
  record: 'Data: a record',
  choices: 'Data: choices',
  recordSymbol: 'Record',
  choicesSymbol: 'Choices',
  things: 'Things',
  data: 'Data',
  give: 'You give it',
  getBack: 'You get back',
  stops: 'It can stop with',
  givesNothing: 'Nothing',
  getsNothing: 'Nothing it hands back',
  partOf: (label) => `Part of ${label}`,
  io: 'What goes in and out',
});

/** The symbol (thunder-visual-v1) for a member, as every view draws it. */
export const memberSymbolId = (m) => (m.kind === 'action' || m.kind === 'pipeline' ? 'action' : m.kind === 'rule' ? 'rule' : m.kind === 'setup' ? 'setup' : m.kind === 'not-read' ? 'not-read' : 'steps');

/** One "It knows" line: the name, and its kind and starting value in words when the code says them. */
const knowsLine = (k) => {
  const detail = [k.kind, k.start].filter(Boolean).join(', ');
  return { name: k.name, label: k.label, detail: detail || null, ...(k.secret ? { secret: true } : {}), line: k.line ?? null };
};

/** A Thing card: what it knows, what it can do (each a door to open), and how a new one starts. */
export function thingCard(model, thing) {
  const members = new Map(model.members.map((m) => [m.id, m]));
  const can = thing.can.map((id) => members.get(id)).filter(Boolean);
  const setup = can.find((m) => m.kind === 'setup') ?? null;
  return {
    kind: 'thing', id: thing.id, label: thing.label, doc: thing.doc ?? null,
    heading: READING_LABELS.thing, symbol: 'thing',
    knows: { heading: READING_LABELS.knows, items: thing.knows.map(knowsLine) },
    can: { heading: READING_LABELS.can, items: can.filter((m) => m !== setup).map((m) => ({ id: m.id, label: `${m.label}${m.yesNo ? '?' : ''}`, symbol: memberSymbolId(m) })) },
    starts: setup ? { id: setup.id, text: READING_LABELS.starts(thing.label) } : { id: null, text: READING_LABELS.startsWithKnows(thing.label) },
  };
}

/** A Data card: a record (facts, like an ID card) or choices (one allowed value). */
export function dataCard(thing) {
  const record = thing.kind === 'record';
  return {
    kind: record ? 'record' : 'choices', id: thing.id, label: thing.label, doc: thing.doc ?? null,
    heading: record ? READING_LABELS.record : READING_LABELS.choices,
    symbol: record ? 'record' : 'choices', symbolLabel: record ? READING_LABELS.recordSymbol : READING_LABELS.choicesSymbol,
    choices: [...thing.choices],
    knows: thing.knows.map(knowsLine),
  };
}

/**
 * What goes in and out of one action or rule: "You give it" (each input, with its kind when the code says it), "You
 * get back", "It can stop with" (every Stop in its flow, with its line), and "Part of <Thing>" back to its card.
 */
export function ioBoxes(model, member) {
  const owner = member.owner ? model.things.find((t) => t.id === member.owner) : null;
  const kinds = member.inputKinds ?? {};
  const stops = (member.flow?.nodes ?? []).filter((n) => n.kind === 'stop').map((n) => ({ text: n.text.replace(/^Stop:\s*/, ''), line: n.line ?? null }));
  return {
    kind: 'io', id: member.id, label: `${member.label}${member.yesNo ? '?' : ''}`, doc: member.doc ?? null, symbol: memberSymbolId(member),
    give: { heading: READING_LABELS.give, items: member.youGive.map((label) => ({ label, kind: kinds[label] ?? null })), empty: READING_LABELS.givesNothing },
    getBack: { heading: READING_LABELS.getBack, text: member.youGetBack ?? null, empty: READING_LABELS.getsNothing },
    stops: { heading: READING_LABELS.stops, items: stops },
    partOf: owner ? { id: owner.id, text: READING_LABELS.partOf(owner.label) } : null,
  };
}

const sectionsFor = (model, things) => {
  const cards = things.filter((t) => t.kind === 'thing').map((t) => thingCard(model, t));
  const data = [...things.filter((t) => t.kind === 'record'), ...things.filter((t) => t.kind === 'choices')].map(dataCard);
  return [
    ...(cards.length ? [{ id: 'things', heading: READING_LABELS.things, cards }] : []),
    ...(data.length ? [{ id: 'data', heading: READING_LABELS.data, cards: data }] : []),
  ];
};

/**
 * The Big Picture, which zooms with what is in focus (the tabs stay Big Picture / Flow / Details / Text / Original):
 *   no focus:            every Thing, then every record, then every set of choices
 *   a file's path:       the same, for that file
 *   a Thing's id:        its card, then the Data in its file
 *   an action or rule:   its "You give it / You get back / It can stop with" boxes, with "Part of <Thing>"
 * Resources are infrastructure and have their own view. `focus.kind` says which one it was ('unknown' when the id is
 * not in the model: nothing is drawn rather than something else).
 */
export function readingLayout(model, { focus = null } = {}) {
  const base = { schema: READING_LAYOUT_SCHEMA };
  if (focus == null) return { ...base, focus: { kind: 'app', id: null }, sections: sectionsFor(model, model.things) };
  const member = model.members.find((m) => m.id === focus);
  if (member) return { ...base, focus: { kind: 'member', id: focus }, sections: [{ id: 'io', heading: READING_LABELS.io, cards: [ioBoxes(model, member)] }] };
  const thing = model.things.find((t) => t.id === focus);
  if (thing) {
    const rest = model.things.filter((t) => t !== thing && t.file === thing.file && t.kind !== 'thing');
    return { ...base, focus: { kind: 'thing', id: focus }, sections: sectionsFor(model, [thing, ...rest]) };
  }
  if (model.files.some((f) => f.path === focus)) return { ...base, focus: { kind: 'file', id: focus }, sections: sectionsFor(model, model.things.filter((t) => t.file === focus)) };
  return { ...base, focus: { kind: 'unknown', id: focus }, sections: [] };
}
