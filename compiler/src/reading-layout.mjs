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
  actions: 'Actions and rules',
  // Flow: the words on each kind of edge. An edge label not listed here is shown as the compiler wrote it.
  edges: Object.freeze({ yes: 'Yes', no: 'No', each: 'For each', done: 'Done', error: 'If it fails', nested: 'Runs on its own', case: 'When' }),
  openLine: (line) => `line ${line}`,
  openRule: 'Open the rule',
  // Details: what each section is called.
  details: Object.freeze({
    stops: 'When it stops', noStops: 'Thunder found no place where it stops early.',
    noInputs: 'Thunder found no inputs. Check Original if it reads a request or a file.', nothingBack: 'Thunder found nothing it gives back.',
    changes: 'What it changes, saves or sends', answers: 'Its answers', limits: (fact) => `Exact limits for ${fact}`,
    limitsHow: 'Found by running the rule on every whole number around each limit.',
    steps: 'Every step, with its line', reliesOn: 'It relies on', usedBy: 'Used by', openQuestions: 'Questions the code cannot answer',
    always: 'Always', otherwise: 'otherwise', when: (w) => `when ${w}`, usedOn: 'used on', atAGlance: 'At a glance',
  }),
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

/** What an action gives back: its declared result, else the end steps of its Flow, each once. */
const givesBackOf = (member) => {
  const list = member.youGetBack ? [member.youGetBack] : (member.flow?.nodes ?? []).filter((n) => n.kind === 'end').map((n) => n.text.replace(/^Gives back\s+/i, ''));
  return [...new Set(list.filter(Boolean))];
};

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
    // What it gives back: what the code declares, else the Flow's end steps (the same facts Flow and Details show).
    getBack: { heading: READING_LABELS.getBack, text: member.youGetBack ?? null, items: givesBackOf(member), empty: READING_LABELS.getsNothing },
    stops: { heading: READING_LABELS.stops, items: stops },
    partOf: owner ? { id: owner.id, text: READING_LABELS.partOf(owner.label) } : null,
  };
}

/** What a Flow edge says ("Yes", "For each", a case's own words), or null for a plain next step. */
export function flowEdgeLabel(edge) {
  if (!edge.label || edge.label === 'next') return null;
  if (edge.label === 'case') return edge.text ?? READING_LABELS.edges.case;
  return READING_LABELS.edges[edge.label] ?? edge.text ?? edge.label;
}

const count = (n, one, many) => ({ count: n, text: n === 1 ? one : many });

/**
 * Details, sorted for drawing: the counts at a glance, then You give it / You get back, When it stops, What it
 * changes, Its answers, Exact limits, Every step, It relies on, Used by, and Questions the code cannot answer.
 * `view` is readLevel(model, 'details', memberId). A section is present only when the compiler gave it (null when
 * not), so nothing is invented. What it gives back comes from the same facts as the Big Picture: givesBack, else
 * youGetBack, else the Flow's end steps.
 */
export function detailsLayout(view) {
  const L = READING_LABELS.details;
  const inputs = view.inputs ?? (view.youGive ?? []).map((label) => ({ label, lines: [] }));
  const givesBack = view.givesBack?.length ? view.givesBack.map((g) => ({ text: g.text, line: g.line ?? null, when: g.when ?? null }))
    : view.youGetBack ? [{ text: view.youGetBack, line: null, when: null }]
    : (view.flow?.nodes ?? []).filter((n) => n.kind === 'end').map((n) => ({ text: n.text, line: n.line ?? null, when: null }));
  const steps = view.steps ?? [];
  const stops = view.stops ?? null;
  const changes = view.changes ?? null;
  const reliesOn = view.reliesOn ?? (view.uses ?? []).map((u) => ({ id: u.id, label: u.label, symbol: 'rule', says: '' }));
  const stats = [
    ...(inputs.length ? [{ id: 'inputs', ...count(inputs.length, 'thing you give it', 'things you give it') }] : []),
    { id: 'steps', ...count(steps.length, 'step', 'steps') },
    ...(stops ? [{ id: 'stops', ...count(stops.length, 'way to stop', 'ways to stop') }] : []),
    ...(changes ? [{ id: 'changes', ...count(changes.length, 'change', 'changes') }] : []),
    ...(reliesOn.length ? [{ id: 'reliesOn', count: reliesOn.length, text: 'relies on' }] : []),
    ...((view.notExplained ?? 0) > 0 ? [{ id: 'notExplained', count: view.notExplained, text: 'not explained yet' }] : []),
  ];
  return {
    id: view.id ?? null, title: view.title ?? null, heading: L.atAGlance, stats,
    give: inputs.length || givesBack.length ? { heading: READING_LABELS.give, items: inputs.map((i) => ({ label: i.label, lines: i.lines ?? [] })), empty: L.noInputs } : null,
    getBack: inputs.length || givesBack.length ? { heading: READING_LABELS.getBack, items: givesBack, empty: L.nothingBack } : null,
    stops: stops ? { heading: L.stops, items: stops.map((s) => ({ error: s.error, message: s.message ?? null, line: s.line ?? null, when: s.when ?? [] })), empty: L.noStops } : null,
    changes: changes?.length ? { heading: L.changes, items: changes.map((c) => ({ text: c.text, does: c.does ?? null, line: c.line ?? null, when: c.when ?? [] })) } : null,
    answers: view.answers?.length ? { heading: L.answers, items: view.answers.map((a) => ({ answer: a.answer, when: a.when === 'otherwise' ? L.otherwise : L.when(a.when) })) } : null,
    limits: view.limits ? { heading: L.limits(view.limits.fact), note: L.limitsHow, items: view.limits.ranges.map((r) => ({ range: r.from == null ? `${r.to} or less` : r.to == null ? `${r.from} or more` : r.from === r.to ? `${r.from}` : `${r.from} to ${r.to}`, answer: r.answer })) } : null,
    steps: steps.length ? { heading: L.steps, items: steps.map((s) => ({ id: s.id, text: s.text, does: s.does ?? null, mark: s.mark ?? null, depth: s.depth ?? 0, line: s.line ?? null, notExplained: !!s.notExplained, via: s.via ?? null })) } : null,
    reliesOn: reliesOn.length ? { heading: L.reliesOn, items: reliesOn.map((r) => ({ id: r.id, label: r.label, symbol: r.symbol ?? 'rule', says: r.says ?? '' })) } : null,
    usedBy: view.usedBy?.length ? { heading: L.usedBy, items: view.usedBy.map((u) => ({ id: u.id, label: u.label })) } : null,
    openQuestions: view.openQuestions?.length ? { heading: L.openQuestions, items: [...view.openQuestions] } : null,
    source: view.source ?? null,
  };
}

/** An action or rule that belongs to no Thing (a plain function): a door to open, with its symbol and doc. */
const memberEntry = (m) => ({ kind: 'member', id: m.id, label: `${m.label}${m.yesNo ? '?' : ''}`, symbol: memberSymbolId(m), doc: m.doc ?? null });

const sectionsFor = (model, things, loose = []) => {
  const cards = things.filter((t) => t.kind === 'thing').map((t) => thingCard(model, t));
  const data = [...things.filter((t) => t.kind === 'record'), ...things.filter((t) => t.kind === 'choices')].map(dataCard);
  const actions = loose.map(memberEntry);
  return [
    ...(cards.length ? [{ id: 'things', heading: READING_LABELS.things, cards }] : []),
    ...(data.length ? [{ id: 'data', heading: READING_LABELS.data, cards: data }] : []),
    ...(actions.length ? [{ id: 'actions', heading: READING_LABELS.actions, cards: actions }] : []),
  ];
};
const ownerless = (model, file) => model.members.filter((m) => !m.owner && (file == null || m.file === file));

/**
 * The Big Picture, which zooms with what is in focus (the tabs stay Big Picture / Flow / Details / Text / Original):
 *   no focus:            every Thing, then every record, then every set of choices, then the actions and rules that
 *                        belong to no Thing (plain functions), each a door to open
 *   a file's path:       the same, for that file
 *   a Thing's id:        its card, then the Data in its file
 *   an action or rule:   its "You give it / You get back / It can stop with" boxes, with "Part of <Thing>"
 * Resources are infrastructure and have their own view. `focus.kind` says which one it was ('unknown' when the id is
 * not in the model: nothing is drawn rather than something else).
 */
export function readingLayout(model, { focus = null } = {}) {
  const base = { schema: READING_LAYOUT_SCHEMA };
  if (focus == null) return { ...base, focus: { kind: 'app', id: null }, sections: sectionsFor(model, model.things, ownerless(model)) };
  const member = model.members.find((m) => m.id === focus);
  if (member) return { ...base, focus: { kind: 'member', id: focus }, sections: [{ id: 'io', heading: READING_LABELS.io, cards: [ioBoxes(model, member)] }] };
  const thing = model.things.find((t) => t.id === focus);
  if (thing) {
    const rest = model.things.filter((t) => t !== thing && t.file === thing.file && t.kind !== 'thing');
    return { ...base, focus: { kind: 'thing', id: focus }, sections: sectionsFor(model, [thing, ...rest]) };
  }
  if (model.files.some((f) => f.path === focus)) return { ...base, focus: { kind: 'file', id: focus }, sections: sectionsFor(model, model.things.filter((t) => t.file === focus), ownerless(model, focus)) };
  return { ...base, focus: { kind: 'unknown', id: focus }, sections: [] };
}
