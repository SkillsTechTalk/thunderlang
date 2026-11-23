// thunder-visual-v1: the visual grammar of Thunder V1, as data.
//
// Thunder is written for the people who read software, not for the computer that runs it. The picture is the main
// form; Thunder Text is the same thing in structured words for those who want detail; the original code is always
// one click away. This module is the single source of truth for how Thunder looks: every view (thunderlang.dev,
// OpenThunder, the VS Code extension) renders from it and does not re-decide shapes, colors, or wording.
// See docs/spec.md (Thunder V1).
import { plainFromReading, renderPlainContract } from './plain-contract.mjs';

export const VISUAL_SCHEMA = 'thunder-visual-v1';

export const PRINCIPLE = 'We are no longer writing code for the computer. We are writing code for humans.';

/** The forms one piece of software can take in Thunder, in the order a reader meets them. */
export const FORMS = [
  { id: 'picture', name: 'Thunder', role: 'main', says: 'The visual form: cards, steps, and maps. What most people read.' },
  { id: 'text', name: 'Thunder Text', role: 'detail', says: 'The same meaning in structured words, for reading in detail, reviewing, and storing.' },
  { id: 'source', name: 'Original code', role: 'evidence', says: 'The code in its own language. Always one click away (View original).' },
];

/**
 * Zoom levels, matching the Thunder Atlas (OpenThunder ADR 0033): two entrances that meet at the Thunder card.
 * `meaning` is how people name things (product, feature); `code` is how engineers find them (repository, file).
 */
export const ZOOM = [
  { level: 0, meaning: 'Product', code: 'Repository', element: 'app' },
  { level: 1, meaning: 'Feature area', code: 'Service, package, or folder', element: 'area' },
  { level: 2, meaning: 'Mission', code: 'File, module, or class', element: 'file' },
  { level: 3, meaning: 'Thunder card', code: 'Endpoint or function', element: 'decision' },
  { level: 4, meaning: 'Source', code: 'The original lines', element: 'source' },
];

/**
 * Color roles. Each kind of word keeps one hue everywhere it appears (picture, text, legend). Hex values are for the
 * dark theme; a light theme may darken them but must keep the same role per hue. Color is never the only signal:
 * every colored thing also has a mark, a word, or a shape.
 */
export const COLORS = {
  structure: { hex: '#C4B5FD', name: 'violet', for: 'Structure words: when, otherwise, all of these, for each' },
  question: { hex: '#7FB2FF', name: 'blue', for: "A decision's question and branches (If)" },
  fact: { hex: '#FCD34D', name: 'yellow', for: 'Facts a rule reads, values a step works out, routes' },
  comparison: { hex: '#F472B6', name: 'pink', for: 'Comparisons and checks: at least, at most, is set' },
  amount: { hex: '#FDBA74', name: 'orange', for: 'Amounts and numbers' },
  outcome: { hex: '#67E8F9', name: 'cyan', for: 'Outcomes and what a function hands back' },
  name: { hex: '#BEF264', name: 'lime', for: 'Example names' },
  failure: { hex: '#FDBA74', name: 'orange', for: 'Ways a function fails (always with the ✕ mark and the word Fails, which tell it apart from amounts)' },
  pass: { hex: '#34D399', name: 'green', for: 'ONLY a check that ran and passed' },
  fail: { hex: '#F87171', name: 'red', for: 'ONLY a check that ran and failed' },
  unread: { hex: '#9CA3AF', name: 'grey, dashed', for: 'Not established: not read, not confirmed, or not run' },
};

/** Line styles carry trust. Solid means established; dashed means not established (never a guess drawn solid). */
export const LINES = {
  solid: 'Read from code exactly, or confirmed by a person',
  dashed: 'Not established: not read, only partly read, an AI summary, or not yet run',
};

/** Where a piece of Thunder came from. Every element shows exactly one. */
export const PROVENANCE = {
  'read-from-code': { label: 'Read from code', line: 'solid', says: 'Read exactly from the source by the Thunder compiler, with no AI.' },
  confirmed: { label: 'Confirmed', line: 'solid', says: 'A person confirmed this reading is what the software should do.' },
  'author-says': { label: 'The author says', line: 'solid', says: "The code author's own words (docstring or doc comment). A statement, not a reading." },
  'ai-summary': { label: 'AI summary', line: 'dashed', says: 'Written by AI to explain. Never a source of truth; the exact reading is shown beneath it.' },
  'not-read': { label: 'Not read', line: 'dashed', says: 'Thunder could not read this. The original code is shown instead, never a guess.' },
};

/** Step marks: shape first, color second. `show: 'code'` means the original code is shown instead of words. */
export const STEP_MARKS = {
  check: { mark: '✓', label: 'Check', color: 'comparison', show: 'words' },
  branch: { mark: '◇', label: 'If', color: 'question', show: 'words' },
  loop: { mark: '↻', label: 'For each', color: 'structure', show: 'words' },
  set: { mark: '=', label: 'Works out', color: 'fact', show: 'words' },
  call: { mark: '→', label: 'Calls', color: 'outcome', show: 'words' },
  return: { mark: '⇥', label: 'Gives back', color: 'outcome', show: 'words' },
  fail: { mark: '✕', label: 'Fails', color: 'failure', show: 'words' },
  try: { mark: '⛉', label: 'Tries', color: 'structure', show: 'words' },
  restates: { mark: '·', label: 'Code', color: 'unread', show: 'code', line: 'dashed' },
  other: { mark: '·', label: 'Not read', color: 'unread', show: 'code', line: 'dashed' },
};

/**
 * Every element a reader meets when software is shown in Thunder. `status` is honest about the compiler today:
 * 'available' (the reader produces it), 'partial' (some languages), 'planned' (defined here, not produced yet).
 */
export const ELEMENTS = {
  app: { zoom: 0, name: 'App', shape: 'map', status: 'available', shows: 'Its areas, how many endpoints, decisions, and functions each holds, and what could not be read.', text: 'App <name>' },
  area: { zoom: 1, name: 'Area', shape: 'map-region', status: 'available', shows: 'A folder, package, or service, with its files.', text: 'Area <name>' },
  file: { zoom: 2, name: 'File', shape: 'stack', status: 'available', shows: 'Every endpoint and function in the file, in order.', text: 'File <path>' },
  'data-shape': { zoom: 2, name: 'Data shape', shape: 'table-card', status: 'planned', shows: 'A record, class, enum, or database table: its fields, their kinds, and the allowed values.', text: 'A <Name> has\n  <field>, <kind>' },
  endpoint: { zoom: 3, name: 'Endpoint', shape: 'steps-card', badge: 'route', status: 'available', shows: 'The door into the app (method and path), then what it does as steps.', text: 'When someone calls <METHOD> <path>' },
  decision: { zoom: 3, name: 'Thunder card', shape: 'card', status: 'available', shows: 'One decision: its question, the facts it reads, each rule, the outcome otherwise, and examples you can ask.', text: '<Question>?\n  <Outcome> when ...\n  Otherwise, <Outcome>.' },
  function: { zoom: 3, name: 'Steps card', shape: 'steps-card', status: 'available', shows: 'What a function does, as a short list of steps with one level of nesting.', text: 'What <name> does\n  - <step>' },
  'not-read': { zoom: 3, name: 'Not-read card', shape: 'dashed-card', line: 'dashed', status: 'available', shows: 'A function Thunder cannot read well yet, with its original code.', text: 'Not read: <name> (see the code)' },
  error: { zoom: 3, name: 'Failure', shape: 'chip', mark: '✕', color: 'failure', status: 'available', shows: 'A way the code can fail, by name.', text: 'Can fail with <Name>' },
  test: { zoom: 3, name: 'Test', shape: 'chip', mark: '⚑', color: 'structure', status: 'available', shows: 'A test that exists. Green or red only once it has run.', text: 'Test: <name>' },
  event: { zoom: 3, name: 'Trigger', shape: 'steps-card', badge: 'when', status: 'planned', shows: 'Something that runs when an event happens (a database trigger, a message handler, a schedule).', text: 'When <event>, it\n  - <step>' },
  source: { zoom: 4, name: 'Original code', shape: 'code', status: 'available', shows: 'The exact lines, highlighted, in the original language.', text: '(the original code)' },
};

/** The languages Thunder reads, and how each one's constructs become Thunder elements. */
export const LANGUAGES = {
  python: { name: 'Python', status: 'available', endpoint: '@app.get / @router.post (FastAPI), @app.route (Flask)', decision: 'a def that returns fixed answers', doc: 'docstring', 'data-shape': '@dataclass, pydantic BaseModel, Enum (planned)' },
  typescript: { name: 'TypeScript', status: 'available', endpoint: 'NestJS @Get/@Post, Express router.post(...)', decision: 'a function that returns fixed answers', doc: '/** JSDoc */', 'data-shape': 'interface, type, enum (planned)' },
  javascript: { name: 'JavaScript', status: 'available', endpoint: 'Express app.get / router.post(...)', decision: 'a function that returns fixed answers', doc: '/** JSDoc */', 'data-shape': 'classes (planned)' },
  go: { name: 'Go', status: 'available', endpoint: 'not yet (net/http, Gin planned)', decision: 'a func that returns fixed answers', doc: '// comment above the func', 'data-shape': 'struct, const iota (planned)' },
  rust: { name: 'Rust', status: 'available', endpoint: 'not yet (Actix, Axum planned)', decision: 'a fn with match or if returning fixed answers', doc: '/// doc comment', 'data-shape': 'struct, enum (planned)' },
  csharp: { name: 'C#', status: 'available', endpoint: '[HttpGet] / [HttpPost]', decision: 'a method that returns fixed answers', doc: '/// <summary>', 'data-shape': 'class, record, enum (planned)' },
  java: { name: 'Java', status: 'available', endpoint: '@GetMapping / @PostMapping (Spring)', decision: 'a method that returns fixed answers', doc: '/** Javadoc */', 'data-shape': 'class, record, enum (planned)' },
  kotlin: { name: 'Kotlin', status: 'available', endpoint: 'Spring annotations', decision: 'a fun with when or if returning fixed answers', doc: '/** KDoc */', 'data-shape': 'data class, enum class (planned)' },
  php: { name: 'PHP', status: 'available', endpoint: '#[Route] (Symfony)', decision: 'a function that returns fixed answers', doc: '/** PHPDoc */', 'data-shape': 'class, enum (planned)' },
  ruby: { name: 'Ruby', status: 'available', endpoint: 'Sinatra get/post blocks (Rails routes.rb planned)', decision: 'a def that returns fixed answers', doc: '# comment above the def', 'data-shape': 'class, Struct (planned)' },
  sql: { name: 'SQL', status: 'planned', endpoint: '(none: SQL is reached through the app)', decision: 'CHECK constraints, CASE expressions, IF in procedures', doc: '-- comment above, COMMENT ON', 'data-shape': 'CREATE TABLE / VIEW', event: 'CREATE TRIGGER', steps: 'SELECT / INSERT / UPDATE / DELETE: which data, filtered by which conditions, changed how' },
};

/** Rules every Thunder view follows. A view that breaks one is wrong, however good it looks. */
export const RULES = [
  'Show the picture first, Thunder Text second, and the original code one click away.',
  'Never draw a guess. What Thunder cannot read is shown as Not read, dashed, with the original code.',
  'Green and red mean only a check that ran and passed or failed.',
  'Every element shows where it came from: read from code, confirmed, the author says, AI summary, or not read.',
  "An AI summary is labeled, dashed, and always sits above the exact reading it summarizes, never instead of it.",
  "The author's words (docstrings) are shown as their statement, separate from what the code does.",
  'Say the action that is really possible: Propose rule change until a change is written back and checked; never Update code.',
  'Use the reader\'s words: plain names, no syntax. A step that would only restate the code shows the code instead.',
];

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();

/**
 * How to draw one reader item (from readCode) in Thunder. Views call this instead of deciding shape and labels.
 * Returns { element, shape, line, title, badge?, provenance, doc? }.
 */
export function visualFor(item) {
  if (!item || typeof item !== 'object') throw new Error('visualFor needs a reader item.');
  const base = { provenance: item.provenance === 'confirmed' ? 'confirmed' : 'read-from-code', ...(item.doc ? { doc: { text: item.doc, provenance: 'author-says' } } : {}) };
  if (item.kind === 'error') return { element: 'error', shape: 'chip', line: 'solid', mark: '✕', color: 'failure', title: `Can fail with ${item.name}`, ...base };
  if (item.kind === 'test') return { element: 'test', shape: 'chip', line: 'solid', mark: '⚑', color: 'structure', title: `Test: ${item.name}`, ...base };
  const badge = item.route ? { kind: 'route', text: `${item.route.method} ${item.route.path}`.trim() } : undefined;
  if (item.kind === 'decision') {
    const card = safePlain(item);
    return { element: 'decision', shape: 'card', line: item.status === 'partial' ? 'dashed' : 'solid', title: card?.question || `How ${words(item.name)} decides`, ...(badge ? { badge } : {}), ...(item.status === 'partial' ? { note: 'Partly read' } : {}), ...base };
  }
  const readable = (item.stepsReadable ?? 0) >= 0.5 && item.steps?.length;
  if (!readable) return { element: 'not-read', shape: 'dashed-card', line: 'dashed', title: `What ${words(item.name)} does`, ...(badge ? { badge } : {}), ...base, provenance: 'not-read' };
  return { element: item.route ? 'endpoint' : 'function', shape: 'steps-card', line: 'solid', title: item.route ? `When someone calls ${badge.text}` : `What ${words(item.name)} does`, ...(badge ? { badge } : {}), ...base };
}

/** How to draw one step: its mark, label, color role, and whether to show words or the original code. */
export function visualForStep(step) {
  const key = step?.restates ? 'restates' : STEP_MARKS[step?.kind] ? step.kind : 'other';
  const m = STEP_MARKS[key];
  return { mark: m.mark, label: m.label, color: m.color, show: m.show, line: m.line || 'solid', text: m.show === 'code' ? step.code ?? step.says : step.says };
}

function safePlain(item) {
  try { return plainFromReading(item); } catch { return null; }
}

/**
 * Thunder Text for one reader item: the same meaning as the picture, in structured words. Decisions use the
 * Thunder Text contract form (.thunder-plain); functions and endpoints use the steps form. Code that Thunder only
 * restates or cannot read is quoted as code, never paraphrased.
 */
export function thunderText(item) {
  const v = visualFor(item);
  if (item.kind === 'error' || item.kind === 'test') return `${v.title}\n`;
  if (item.kind === 'decision') {
    const card = safePlain(item);
    if (card) {
      if (item.doc && !card.why) card.why = item.doc; // the author's reason becomes the contract's Why: line
      return renderPlainContract(card).replace(/\n+Examples\s*$/, '\n'); // a read decision has no examples yet
    }
  }
  const out = [v.title];
  if (item.doc) out.push(`  The author says: "${item.doc}"`);
  if (item.inputs?.length) out.push(`  Takes ${item.inputs.map((p) => words(p.name)).join(', ')}`);
  const steps = item.steps || [];
  const lines = (list, depth) => {
    for (const st of list) {
      const s = visualForStep(st);
      const pad = '  '.repeat(depth + 1);
      out.push(s.show === 'code' ? `${pad}- \`${s.text}\` (code, not explained)` : `${pad}- ${s.text}`);
      if (st.children?.length) lines(st.children, depth + 1);
    }
  };
  if (steps.length) lines(steps, 0);
  else if (item.kind === 'decision' && item.rules?.length) {
    for (const r of item.rules) out.push(`  - ${r.result} when ${r.says ?? r.when}`);
    if (item.otherwise) out.push(`  - Otherwise, ${item.otherwise.result}`);
  } else out.push('  Not read: see the original code.');
  return `${out.join('\n')}\n`;
}

/** The whole grammar in one object, for views that want to render a legend or validate themselves against it. */
export const THUNDER_VISUAL = { schema: VISUAL_SCHEMA, principle: PRINCIPLE, forms: FORMS, zoom: ZOOM, colors: COLORS, lines: LINES, provenance: PROVENANCE, steps: STEP_MARKS, elements: ELEMENTS, languages: LANGUAGES, rules: RULES };
