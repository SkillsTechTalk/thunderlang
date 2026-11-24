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
  { id: 'meaning', name: 'The meaning', role: 'model', says: 'The one reading both views are made from. The picture and Thunder Text are two views of it, never translations of each other.' },
  { id: 'source', name: 'Original code', role: 'evidence', says: 'The code in its own language. Always one click away (View original).' },
];

/**
 * The five reading levels: HOW DEEP you read whatever you are looking at. Every Thunder view offers the same five, in
 * this order, with these names: from what something means down to the code that proves it. Big Picture, Flow, and
 * Details are pictures; Text is the same meaning in words; Original is the evidence. `readLevel(model, level, focus)`
 * (model.mjs) gives exactly what each level shows, so every product shows the same thing at the same level.
 */
export const LEVELS = [
  { id: 'big-picture', name: 'Big Picture', question: 'What is it, and what can it do?', shows: 'The Things, what each knows and can do, its doors (actions), its rules, and its data. For one action or rule: what you give it, what you get back, and what it uses.', form: 'picture' },
  { id: 'flow', name: 'Flow', question: 'How does it go?', shows: 'One action or rule as a path: questions with Yes and No, repeats, the Stops, what happens if something goes wrong, and what always happens at the end.', form: 'picture' },
  { id: 'details', name: 'Details', question: 'Exactly what happens, and how sure is Thunder?', shows: 'A fact sheet: every way it can end (each Stop with its message, and what it gives back), the answers that lead there, what it changes, what goes in, what it relies on, a rule\'s answers and exact limits, and what the code cannot tell you.', form: 'picture' },
  { id: 'text', name: 'Text', question: 'What does it say, in words?', shows: 'Thunder Text: the same meaning in structured words, for reading closely, reviewing a change, and keeping a copy.', form: 'words' },
  { id: 'original', name: 'Original', question: 'Which code says so?', shows: 'The exact lines in the original language that Thunder read. The evidence, one click away.', form: 'evidence' },
];

/**
 * Places: WHERE you are in an app (App > Area > File > Action or Rule), as opposed to how deep you read it (LEVELS).
 * Read in Thunder (OpenThunder ADR 0035) walks App > File > Action > Rule; the Thunder Atlas (ADR 0033) adds Area
 * between App and File for large apps. `atlas` gives the Atlas level for each. (Kept as ZOOM for compatibility.)
 */
export const ZOOM = [
  { level: 0, name: 'App', from: 'A product or a repository', element: 'app', atlas: 'Z0' },
  { level: 1, name: 'Area', from: 'A feature area, service, package, or folder (Atlas; optional in Read in Thunder)', element: 'area', atlas: 'Z1' },
  { level: 2, name: 'File', from: 'A file, module, or class', element: 'file', atlas: 'Z2' },
  { level: 3, name: 'Action', from: 'A door into the app: an endpoint or a screen, and the handler behind it', element: 'action', atlas: 'Z3' },
  { level: 4, name: 'Rule', from: 'One decision (a Thunder card) or the steps of a function', element: 'decision', atlas: 'Z3' },
  { level: 5, name: 'Original', from: 'The exact lines in the original language', element: 'source', atlas: 'Z4' },
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
  solid: 'From code (read exactly) or confirmed by a person',
  dashed: 'Not established: not read, only partly read, an AI summary, or not yet run',
};

/**
 * Where a piece of Thunder came from. Every element shows exactly one, as a chip. Chips are neutral grey with a solid
 * or dashed outline: color stays reserved for word roles, so a chip never borrows a role's hue. Labels are the words
 * agreed with OpenThunder (ADR 0035).
 */
export const PROVENANCE = {
  'from-code': { label: 'From code', line: 'solid', says: 'Read exactly from the source by the Thunder compiler, with no AI.' },
  confirmed: { label: 'Confirmed', line: 'solid', says: 'A person confirmed this reading is what the software should do.' },
  'authors-note': { label: "Author's note", line: 'solid', says: "The code author's own words (docstring or doc comment), verbatim. A statement, not a reading." },
  'ai-summary': { label: 'AI summary', line: 'dashed', says: 'Written by AI to explain. Never evidence; the exact reading is shown beneath it.' },
  'not-read': { label: 'Not read yet', line: 'dashed', says: 'Thunder could not read this yet. The original code is shown instead, never a guess.' },
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
  other: { mark: '·', label: 'Not read yet', color: 'unread', show: 'code', line: 'dashed' },
};

/**
 * Every element a reader meets when software is shown in Thunder. `status` is honest about the compiler today:
 * 'available' (the reader produces it), 'partial' (some languages), 'planned' (defined here, not produced yet).
 */
export const ELEMENTS = {
  app: { zoom: 0, name: 'App', shape: 'map', status: 'available', shows: 'Its folders or areas, how many actions, decisions, and functions each holds, and what could not be read yet.', text: 'App <name>' },
  area: { zoom: 1, name: 'Area', shape: 'map-region', status: 'available', shows: 'A folder, package, or service, with its files.', text: 'Area <name>' },
  file: { zoom: 2, name: 'File', shape: 'stack', status: 'available', shows: 'What you can do here: every action and function in the file, in order.', text: 'File <path>' },
  'data-shape': { zoom: 2, name: 'Data shape', shape: 'table-card', status: 'planned', shows: 'A record, class, enum, or database table: its fields, their kinds, and the allowed values.', text: 'A <Name> has\n  <field>, <kind>' },
  action: { zoom: 3, name: 'Action', shape: 'steps-card', badge: 'route', status: 'available', shows: 'A door into the app (an endpoint with its method and path, or a screen), then what its handler does as steps.', text: 'When someone calls <METHOD> <path>' },
  decision: { zoom: 4, name: 'Thunder card', shape: 'card', status: 'available', shows: 'One decision: its question, the facts it reads, each rule, the outcome otherwise, and examples you can ask.', text: '<Question>?\n  <Outcome> when ...\n  Otherwise, <Outcome>.' },
  function: { zoom: 4, name: 'Steps card', shape: 'steps-card', status: 'available', shows: 'What a function does, as a short list of steps with one level of nesting.', text: 'What <name> does\n  - <step>' },
  'not-read': { zoom: 4, name: 'Not-read-yet card', shape: 'dashed-card', line: 'dashed', status: 'available', shows: 'A function Thunder cannot read well yet, with its original code.', text: 'Not read: <name> (see the code)' },
  error: { zoom: 4, name: 'Failure', shape: 'chip', mark: '✕', color: 'failure', status: 'available', shows: 'A way the code can fail, by name.', text: 'Can fail with <Name>' },
  test: { zoom: 4, name: 'Test', shape: 'chip', mark: '⚑', color: 'structure', status: 'available', shows: 'A test that exists. Green or red only once it has run.', text: 'Test: <name>' },
  event: { zoom: 3, name: 'Trigger', shape: 'steps-card', badge: 'when', status: 'planned', shows: 'Something that runs when an event happens (a database trigger, a message handler, a schedule).', text: 'When <event>, it\n  - <step>' },
  // The whole application (spec section 12): where it runs and how it ships.
  resource: { zoom: 2, name: 'Resource', shape: 'block', status: 'available', shows: 'Something that exists when the app runs (an image, a server, a database), with what it knows: its settings.', text: 'Resource <name> (<kind>)\n  It knows' },
  permission: { zoom: 2, name: 'Permission', shape: 'key', status: 'available', shows: 'Who can do what to which resource. Wide permissions are called wide.', text: '<who> can <what> on <resource>' },
  setting: { zoom: 2, name: 'Setting', shape: 'chip', status: 'available', shows: 'A value the app or the infrastructure is given, and where it comes from. A secret is only ever named.', text: 'Setting <name>: <where it comes from>' },
  pipeline: { zoom: 3, name: 'Pipeline', shape: 'steps-card', badge: 'when', status: 'available', shows: 'Automation: when it runs, then its jobs as steps.', text: 'When someone pushes to main\n  - <step>' },
  'image-build': { zoom: 3, name: 'Image build', shape: 'steps-card', status: 'available', shows: 'How an app is packaged and started, one card per build stage.', text: 'What the image build does\n  - <step>' },
  source: { zoom: 5, name: 'Original code', shape: 'code', status: 'available', shows: 'The exact lines, highlighted, in the original language.', text: '(the original code)' },
};

/** The languages Thunder reads, and how each one's constructs become Thunder elements. */
export const LANGUAGES = {
  python: { name: 'Python', status: 'available', action: '@app.get / @router.post (FastAPI), @app.route (Flask)', decision: 'a def that returns fixed answers', doc: 'docstring', 'data-shape': '@dataclass, pydantic BaseModel, Enum (planned)' },
  typescript: { name: 'TypeScript', status: 'available', action: 'NestJS @Get/@Post, Express router.post(...)', decision: 'a function that returns fixed answers', doc: '/** JSDoc */', 'data-shape': 'interface, type, enum (planned)' },
  javascript: { name: 'JavaScript', status: 'available', action: 'Express app.get / router.post(...)', decision: 'a function that returns fixed answers', doc: '/** JSDoc */', 'data-shape': 'classes (planned)' },
  go: { name: 'Go', status: 'available', action: 'not yet (net/http, Gin planned)', decision: 'a func that returns fixed answers', doc: '// comment above the func', 'data-shape': 'struct, const iota (planned)' },
  rust: { name: 'Rust', status: 'available', action: 'not yet (Actix, Axum planned)', decision: 'a fn with match or if returning fixed answers', doc: '/// doc comment', 'data-shape': 'struct, enum (planned)' },
  csharp: { name: 'C#', status: 'available', action: '[HttpGet] / [HttpPost]', decision: 'a method that returns fixed answers', doc: '/// <summary>', 'data-shape': 'class, record, enum (planned)' },
  java: { name: 'Java', status: 'available', action: '@GetMapping / @PostMapping (Spring)', decision: 'a method that returns fixed answers', doc: '/** Javadoc */', 'data-shape': 'class, record, enum (planned)' },
  kotlin: { name: 'Kotlin', status: 'available', action: 'Spring annotations', decision: 'a fun with when or if returning fixed answers', doc: '/** KDoc */', 'data-shape': 'data class, enum class (planned)' },
  php: { name: 'PHP', status: 'available', action: '#[Route] (Symfony)', decision: 'a function that returns fixed answers', doc: '/** PHPDoc */', 'data-shape': 'class, enum (planned)' },
  ruby: { name: 'Ruby', status: 'available', action: 'Sinatra get/post blocks (Rails routes.rb planned)', decision: 'a def that returns fixed answers', doc: '# comment above the def', 'data-shape': 'class, Struct (planned)' },
  sql: { name: 'SQL', status: 'available', action: '(none: SQL is reached through the app)', decision: 'CHECK and UNIQUE constraints; IF in functions and procedures', doc: '-- comment above, COMMENT ON', 'data-shape': 'CREATE TABLE / VIEW', event: 'CREATE TRIGGER', steps: 'SELECT / INSERT / UPDATE / DELETE: which data, filtered by which conditions, changed how' },
  dockerfile: { name: 'Dockerfile', status: 'available', category: 'infrastructure', action: '(none: it packages the app)', decision: '(none)', doc: '# comment above FROM', steps: 'each build stage: FROM, COPY, RUN, ENV, EXPOSE, USER, CMD in words', resource: 'the image it makes' },
  'github-actions': { name: 'GitHub Actions', status: 'available', category: 'delivery', action: 'each job, with a When badge (its trigger)', decision: 'if: as a question', doc: "the workflow's name:", steps: 'well-known actions and run: commands in words', permission: 'permissions:', setting: 'env:, secrets (named only), inputs' },
  terraform: { name: 'Terraform', status: 'available', category: 'infrastructure', action: '(none: it describes what exists)', decision: 'count = cond ? 1 : 0 as a question', doc: '# comment above a block', steps: 'the order things are created, from their references', resource: 'resource, data (looked up), module', permission: 'azurerm_role_assignment, AWS IAM policies, google_*_iam_member', setting: 'variable (sensitive named only), locals, output' },
  bicep: { name: 'Bicep', status: 'available', category: 'infrastructure', action: '(none: it describes what exists)', decision: 'if (…) as a question', doc: '// comment or @description above', steps: 'the order things are created, from their references', resource: "resource (existing: looked up), module", permission: 'Microsoft.Authorization/roleAssignments (well-known roles named)', setting: 'param (@secure() named only), var, output' },
};

/** Rules every Thunder view follows. A view that breaks one is wrong, however good it looks. */
export const RULES = [
  'Show the picture first, Thunder Text second, and the original code one click away.',
  'Never draw a guess. What Thunder cannot read is shown as Not read yet, dashed, with the original code.',
  'Green and red mean only a check that ran and passed or failed.',
  "Every element shows where it came from: From code, Confirmed, Author's note, AI summary, or Not read yet.",
  "An AI summary is labeled, dashed, and always sits above the exact reading it summarizes, never instead of it.",
  "The author's note (a docstring) is shown as the author's statement, verbatim, separate from what the code does.",
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
  const base = { provenance: item.provenance === 'confirmed' ? 'confirmed' : 'from-code', ...(item.doc ? { doc: { text: item.doc, provenance: 'authors-note' } } : {}) };
  if (item.kind === 'error') return { element: 'error', shape: 'chip', line: 'solid', mark: '✕', color: 'failure', title: `Can fail with ${item.name}`, ...base };
  if (item.kind === 'test') return { element: 'test', shape: 'chip', line: 'solid', mark: '⚑', color: 'structure', title: `Test: ${item.name}`, ...base };
  const badge = item.route ? { kind: item.when ? 'when' : 'route', text: `${item.route.method} ${item.route.path}`.trim() } : undefined;
  if (item.kind === 'decision') {
    const card = safePlain(item);
    return { element: 'decision', shape: 'card', line: item.status === 'partial' ? 'dashed' : 'solid', title: card?.question || `How ${words(item.name)} decides`, ...(badge ? { badge } : {}), ...(item.status === 'partial' ? { note: 'Partly read' } : {}), ...base };
  }
  const readable = (item.stepsReadable ?? 0) >= 0.5 && item.steps?.length;
  if (!readable) return { element: 'not-read', shape: 'dashed-card', line: 'dashed', title: `What ${words(item.name)} does`, ...(badge ? { badge } : {}), ...base, provenance: 'not-read' };
  return { element: item.route ? 'action' : 'function', shape: 'steps-card', line: 'solid', title: item.title ?? (item.route ? `When someone calls ${badge.text}` : `What ${words(item.name)} does`), ...(badge ? { badge } : {}), ...base };
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
 * Thunder Text contract form (.thunder-plain); functions and actions use the steps form. Code that Thunder only
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
  if (item.doc) out.push(`  Author's note: "${item.doc}"`);
  if (item.inputs?.length) out.push(`  Takes ${item.inputs.map((p) => words(p.name)).join(', ')}`);
  const steps = item.steps || [];
  const lines = (list, depth) => {
    for (const st of list) {
      const s = visualForStep(st);
      const pad = '  '.repeat(depth + 1);
      out.push(s.show === 'code' ? `${pad}- \`${s.text}\` (code, not explained)` : `${pad}- ${s.text}`);
      if (st.children?.length) lines(st.children, depth + 1);
      // Every branch is printed: the other side of an If, each error handler, and what always runs at the end.
      if (st.otherwise?.length) {
        out.push(`${pad}  Otherwise:`);
        lines(st.otherwise, depth + 2);
      }
      for (const h of st.handlers || []) { out.push(`${pad}  ${h.says}:`); lines(h.steps, depth + 2); }
      if (st.always) { out.push(`${pad}  Always, at the end:`); lines(st.always.steps, depth + 2); }
    }
  };
  if (steps.length) lines(steps, 0);
  else if (item.kind === 'decision' && item.rules?.length) {
    for (const r of item.rules) out.push(`  - ${r.result} when ${r.says ?? r.when}`);
    if (item.otherwise) out.push(`  - Otherwise, ${item.otherwise.result}`);
  } else out.push('  Not read: see the original code.');
  return `${out.join('\n')}\n`;
}

/**
 * The Thunder symbols (V1.1): one shape per kind of thing, drawn as stroke paths on a 44 x 44 grid, so every product
 * draws the same symbol. `paths` are SVG path data; `circles` are [cx, cy, r]; `fill` marks a solid dot. A kid learns
 * the six `beginner` symbols first; the rest appear as they are needed.
 */
export const SYMBOLS = {
  app: { name: 'App', says: 'The whole program, as a map.', color: 'structure', paths: ['M6 11 L16 7 L28 11 L38 7 V33 L28 37 L16 33 L6 37 Z', 'M16 7 V33 M28 11 V37'] },
  area: { name: 'Area', says: 'A part of the app that belongs together.', color: 'structure', paths: ['M5 13 H17 L21 17 H39 V35 H5 Z'] },
  file: { name: 'File', says: 'One page of the program.', color: 'structure', paths: ['M11 5 H27 L35 13 V39 H11 Z', 'M27 5 V13 H35', 'M16 22 H30 M16 28 H30 M16 34 H24'] },
  thing: { name: 'Thing', says: 'Something the app knows about. It knows stuff and can do stuff.', color: 'outcome', beginner: true, paths: ['M22 5 L38 13 V31 L22 39 L6 31 V13 Z', 'M6 13 L22 21 L38 13 M22 21 V39'] },
  data: { name: 'Data', says: 'Information: a record of facts, or a list of allowed choices.', color: 'outcome', beginner: true, paths: ['M8 10 C8 6 36 6 36 10 V34 C36 38 8 38 8 34 Z', 'M8 10 C8 14 36 14 36 10', 'M8 22 C8 26 36 26 36 22'] },
  record: { name: 'Record', says: 'A Thing that only remembers facts, like an ID card.', color: 'outcome', group: 'data', paths: ['M9 10 H35 A4 4 0 0 1 39 14 V30 A4 4 0 0 1 35 34 H9 A4 4 0 0 1 5 30 V14 A4 4 0 0 1 9 10 Z', 'M11 29 H19 M24 18 H34 M24 24 H34 M24 30 H30'], circles: [[15, 20, 4]] },
  choices: { name: 'Choices', says: 'Only one of these values is allowed.', color: 'outcome', group: 'data', paths: ['M10 7 H34 A4 4 0 0 1 34 15 H10 A4 4 0 0 1 10 7 Z', 'M10 18 H34 A4 4 0 0 1 34 26 H10 A4 4 0 0 1 10 18 Z', 'M10 29 H34 A4 4 0 0 1 34 37 H10 A4 4 0 0 1 10 29 Z'], circles: [[12, 22, 1.8]], fill: true },
  action: { name: 'Action', says: 'A door into the app: something a person can do.', color: 'fact', beginner: true, paths: ['M11 39 V6 H33 V39', 'M6 39 H38'], circles: [[27, 23, 1.8]], fill: true },
  rule: { name: 'Rule', says: 'A decision: look at some facts, pick one answer.', color: 'question', beginner: true, paths: ['M22 4 L38 20 L22 36 L6 20 Z', 'M22 36 V41 M15 29 L9 37 M29 29 L35 37'] },
  steps: { name: 'Steps', says: 'A how-to: do this, then this, then this.', color: 'structure', beginner: true, paths: ['M10 5 H34 A4 4 0 0 1 38 9 V35 A4 4 0 0 1 34 39 H10 A4 4 0 0 1 6 35 V9 A4 4 0 0 1 10 5 Z', 'M13 14 H14 M19 14 H31 M13 22 H14 M19 22 H31 M13 30 H14 M19 30 H27'] },
  setup: { name: 'Starts with', says: 'What a new Thing has when it is made.', color: 'structure', paths: ['M22 5 V15 M22 29 V39 M5 22 H15 M29 22 H39 M10 10 L16 16 M28 28 L34 34 M34 10 L28 16 M16 28 L10 34'] },
  stop: { name: 'Stop', says: 'Something is wrong, so it stops and says why.', color: 'failure', beginner: true, paths: ['M15 5 H29 L39 15 V29 L29 39 H15 L5 29 V15 Z', 'M16 22 H28'] },
  'not-read': { name: 'Not read yet', says: "Thunder shows the code, because it can't explain it yet.", color: 'unread', dashed: true, paths: ['M11 5 H33 V39 H11 Z', 'M17 22 H27'] },
  resource: { name: 'Resource', says: 'Something that exists when the app runs: an image, a server, a database. It knows its settings.', color: 'fact', paths: ['M7 8 H37 V18 H7 Z', 'M7 26 H37 V36 H7 Z', 'M22 18 V26'], circles: [[13, 13, 1.6], [13, 31, 1.6]], fill: true },
  permission: { name: 'Permission', says: 'Who can do what. A wide one can change a lot.', color: 'comparison', paths: ['M24 20 L38 34 M33 29 L29 33 M37 33 L34 36'], circles: [[16, 16, 9]] },
};

/** What a step does, in a kid's words (model flow nodes carry `does`). Shape first, color second. */
export const DOES = {
  start: { label: 'Starts', mark: '▶', color: 'fact' },
  find: { label: 'Finds', mark: '⌕', color: 'fact' },
  'keep-only': { label: 'Keeps only', mark: '⏚', color: 'fact' },
  check: { label: 'Checks', mark: '✓', color: 'comparison' },
  decide: { label: 'Asks', mark: '◇', color: 'question' },
  calculate: { label: 'Works out', mark: '=', color: 'fact' },
  save: { label: 'Saves', mark: '⤓', color: 'outcome' },
  send: { label: 'Tells someone', mark: '✉', color: 'outcome' },
  redirect: { label: 'Sends the person to', mark: '↪', color: 'outcome' },
  ask: { label: 'Asks another part', mark: '⇄', color: 'outcome' },
  repeat: { label: 'For each', mark: '↻', color: 'structure' },
  answer: { label: 'Gives back', mark: '⇥', color: 'outcome' },
  stop: { label: 'Stops', mark: '■', color: 'failure', symbol: 'stop' },
  do: { label: 'Does', mark: '→', color: 'outcome' },
  code: { label: 'Not read yet', mark: '·', color: 'unread', dashed: true },
  when: { label: 'Runs when', mark: '⚡', color: 'structure' },
};

/** The six concepts a beginner learns first; the model keeps all of SYMBOLS. */
export const BEGINNER = ['thing', 'action', 'rule', 'steps', 'data', 'stop'];

/** The whole grammar in one object, for views that want to render a legend or validate themselves against it. */
export const PLACES = ZOOM;

export const THUNDER_VISUAL = { schema: VISUAL_SCHEMA, principle: PRINCIPLE, forms: FORMS, levels: LEVELS, places: ZOOM, zoom: ZOOM, colors: COLORS, lines: LINES, provenance: PROVENANCE, steps: STEP_MARKS, elements: ELEMENTS, languages: LANGUAGES, rules: RULES, symbols: SYMBOLS, does: DOES, beginner: BEGINNER };

// ── Thunder Text colors: each word's role, decided by the compiler so every view colors it the same way ──────

const STRUCTURE_WORDS = /^(?:Resource|Permissions|Settings|Ask:|Yes:|No:|Otherwise:|Otherwise,|Always, at the end:|For each:|When done:|You give it:|You get back:|Takes|Author's note:|It knows|It can|One of:|We need|Examples|Why:|When someone calls|What|Thing|Record|Choices|Area|File|App|Not read)(?=\s|$)/;
const COMPARISON_RE = /\b(?:is at least|is at most|is less than|is more than|is not in|is in|is not|at least|at most|less than|more than|under|over|exactly|whether|is set|is not set|is empty|is not empty|has no|has|is)\b/;

/**
 * Split one line of Thunder Text into tokens tagged with a COLORS role, so views color Thunder Text like an IDE
 * without guessing: { text, role } where role is a COLORS key, or null for plain text. Line numbers ("(line 12)")
 * are role 'unread' (quiet). Deterministic; whitespace is preserved, so joining the texts gives the line back.
 */
export function thunderTokens(line) {
  const out = [];
  const push = (text, role = null) => { if (text) out.push({ text, role }); };
  let rest = String(line);
  const lead = rest.match(/^\s*(?:- )?/)[0];
  push(lead.includes('-') ? lead.slice(0, lead.indexOf('-')) : lead, null);
  if (lead.includes('-')) push('- ', 'structure');
  rest = rest.slice(lead.length);
  const lineNo = rest.match(/\s+\(line \d+\)\s*$/);
  const tail = lineNo ? lineNo[0] : '';
  if (lineNo) rest = rest.slice(0, rest.length - tail.length);
  // Whole-line kinds first.
  let m;
  if ((m = rest.match(/^(Stop|Fails with)(:?\s*)([\w.]*)(:?\s*)(.*)$/)) && (/^Stop/.test(rest) || /^Fails with/.test(rest))) {
    push(m[1], 'failure'); push(m[2]); push(m[3], 'failure'); push(m[4]); words(m[5]);
  } else if ((m = rest.match(/^(Answer:|Gives back|Returns)(\s*)(.*)$/))) {
    push(m[1], 'structure'); push(m[2]); push(m[3], 'outcome');
  } else if ((m = rest.match(/^(Ask:)(\s*)(.*)$/))) {
    push(m[1], 'structure'); push(m[2]); words(m[3], 'question');
  } else if ((m = rest.match(/^`(.*)`(.*)$/))) {
    push(`\`${m[1]}\``, 'unread'); push(m[2], 'unread');
  } else {
    const s = rest.match(STRUCTURE_WORDS);
    if (s) { push(s[0], 'structure'); words(rest.slice(s[0].length)); } else words(rest);
  }
  push(tail, 'unread');
  return out;

  // Inside a phrase: comparisons pink, numbers and money orange, quoted text lime, structure words violet.
  function words(text, base = null) {
    const re = /("[^"]*")|(\$?-?\d[\d,]*(?:\.\d+)?%?)|\b(and|or|not|if|otherwise|for each|in|from|to|of)\b|\b(is at least|is at most|is less than|is more than|is not in|is in|is not set|is set|is not empty|is empty|is not|at least|at most|less than|more than|exactly|whether|has no)\b/g;
    let last = 0, x;
    while ((x = re.exec(text))) {
      push(text.slice(last, x.index), base);
      if (x[1]) push(x[1], 'name');
      else if (x[2]) push(x[2], 'amount');
      else if (x[3]) push(x[3], 'structure');
      else push(x[4], 'comparison');
      last = x.index + x[0].length;
    }
    push(text.slice(last), base);
  }
}
