// IntentLang parser (deterministic, no AI). Turns .intent source into an Intent AST.
// This is the MVP emit-stage parser: it covers the core constructs (mission, goal, why,
// requires, input, output, guarantees, never, constraints, assumptions, risks, target,
// style, verify) plus architecture blocks (service, api, event, database). Detail blocks
// `guarantee <text>` / `never <text>` attach `because` (rationale) and `verify` to a rule.
//
// Indentation defines structure: a keyword on its own line opens a block; deeper-indented
// lines are its children. We build an indent tree first, then interpret it, so nested
// architecture blocks (service -> owns/publishes/...) parse cleanly.

const firstWord = (s) => s.split(/\s+/)[0];
const rest = (s) => s.split(/\s+/).slice(1).join(' ').trim();

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unnamed';
}

// Strip comments (ignored), drop blank lines, keep indentation and 1-based line.
// A `#` comment is IGNORED by the compiler; `note <lens>:` blocks are compiled.
function toRows(source) {
  const rows = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s*#.*$/, '');
    line = line.replace(/\s+#\s.*$/, '');
    if (!line.trim()) continue;
    rows.push({ indent: line.length - line.trimStart().length, text: line.trim(), line: i + 1 });
  }
  return rows;
}

// Build an indent tree: each node = { text, line, children: [] }.
function buildTree(rows) {
  const root = { text: '__root__', line: 0, children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const row of rows) {
    const node = { text: row.text, line: row.line, children: [] };
    while (stack.length > 1 && row.indent <= stack[stack.length - 1].indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent: row.indent, node });
  }
  return root.children;
}

// Known IntentLens reader lenses. Unknown lenses warn (INTENT_NOTE_UNKNOWN_LENS).
export const KNOWN_LENSES = [
  'pm', 'beginner', 'qa', 'risk', 'security', 'support', 'reviewer', 'ops', 'non_goal', 'term',
];

// Parse a `note <lens>:` node. Text is inline after the colon, or the child body.
function parseNoteNode(node) {
  const after = node.text.replace(/^note\s+/i, '');
  const m = after.match(/^([A-Za-z_]+)\s*:?\s*(.*)$/);
  const lens = m ? m[1] : after.trim();
  const inline = m ? m[2].trim() : '';
  const body = node.children.map((c) => c.text).join(' ').trim();
  return { lens, text: inline || body, line: node.line };
}

const isNote = (node) => firstWord(node.text).toLowerCase() === 'note';

const leafItems = (node) => node.children.map((c) => c.text);
const childBlock = (node, kw) => node.children.find((c) => firstWord(c.text) === kw);

function parseFields(node) {
  // "key: Type" lines. A field may carry indented modifiers and IntentLens notes.
  return node.children.map((c) => {
    const m = c.text.match(/^([A-Za-z_][\w]*)\s*:\s*(.+)$/);
    const modifiers = [];
    const notes = [];
    for (const mc of c.children) {
      if (isNote(mc)) notes.push(parseNoteNode(mc));
      else modifiers.push(mc.text);
    }
    const base = m ? { name: m[1], type: m[2].trim() } : { name: c.text, type: null };
    return { ...base, modifiers, notes, line: c.line };
  });
}

function parseService(name, node) {
  return {
    id: slug(name), name,
    owns: (childBlock(node, 'owns') && leafItems(childBlock(node, 'owns'))) || [],
    consumes: (childBlock(node, 'consumes') && leafItems(childBlock(node, 'consumes'))) || [],
    publishes: (childBlock(node, 'publishes') && leafItems(childBlock(node, 'publishes'))) || [],
    database: (childBlock(node, 'database') && leafItems(childBlock(node, 'database'))[0]) || null,
    owner: (childBlock(node, 'owner') && leafItems(childBlock(node, 'owner')).join(' ')) || null,
  };
}

function parseApi(name, node) {
  const one = (kw) => { const b = childBlock(node, kw); return b ? leafItems(b).join(' ') : null; };
  const list = (kw) => { const b = childBlock(node, kw); return b ? leafItems(b) : []; };
  return {
    id: slug(name), name,
    method: one('method'), path: one('path'),
    requires: list('requires'), errors: list('errors'),
    input: one('input'), output: one('output'),
  };
}

function parseEvent(name, node) {
  const list = (kw) => { const b = childBlock(node, kw); return b ? leafItems(b) : []; };
  const payloadBlock = childBlock(node, 'payload');
  return {
    id: slug(name), name,
    publishedBy: list('publishedBy'), consumedBy: list('consumedBy'),
    payload: payloadBlock ? parseFields(payloadBlock) : [],
    guarantees: list('guarantees'),
  };
}

function upsertRule(list, statement, line) {
  const id = slug(statement);
  let r = list.find((x) => x.id === id);
  if (!r) { r = { id, statement, because: null, verify: [], notes: [], line }; list.push(r); }
  return r;
}

function applyDetail(rule, node) {
  for (const c of node.children) {
    const kw = firstWord(c.text);
    if (kw === 'because') rule.because = rest(c.text) || (c.children[0] && c.children[0].text) || null;
    else if (kw === 'verify') rule.verify.push(rest(c.text) || (c.children[0] && c.children[0].text) || '');
    else if (isNote(c)) rule.notes.push(parseNoteNode(c));
  }
  rule.verify = rule.verify.filter(Boolean);
}

export function parseIntent(source) {
  const ast = {
    mission: null, goal: '', why: '',
    requires: [], inputs: [], outputs: [],
    guarantees: [], neverRules: [], constraints: [], assumptions: [], risks: [],
    targets: [], style: [], verify: [], errors: [], examples: [],
    services: [], apis: [], events: [], databases: [], architecture: [],
    implementation: null, selection: [],
    notes: [], diagnostics: [],
  };
  const missionNotes = [];
  const items = (node) => node.children.filter((c) => !isNote(c));
  for (const node of buildTree(toRows(source))) {
    const kw = firstWord(node.text);
    const arg = rest(node.text);
    switch (kw) {
      case 'mission': ast.mission = arg || null; break;
      case 'note': missionNotes.push(parseNoteNode(node)); break;
      case 'goal': ast.goal = leafItems(node).join(' '); break;
      case 'why': ast.why = leafItems(node).join(' '); break;
      case 'requires': ast.requires.push(...leafItems(node)); break;
      case 'input': ast.inputs.push(...parseFields(node)); break;
      case 'output': ast.outputs.push(...parseFields(node)); break;
      case 'guarantees': for (const c of items(node)) upsertRule(ast.guarantees, c.text, c.line); break;
      case 'guarantee': applyDetail(upsertRule(ast.guarantees, arg, node.line), node); break;
      case 'never':
        if (arg) applyDetail(upsertRule(ast.neverRules, arg, node.line), node);
        else for (const c of items(node)) upsertRule(ast.neverRules, c.text, c.line);
        break;
      case 'constraints': ast.constraints.push(...leafItems(node)); break;
      case 'assumptions': ast.assumptions.push(...leafItems(node)); break;
      case 'risks': ast.risks.push(...leafItems(node)); break;
      case 'target': ast.targets.push(...leafItems(node)); break;
      case 'style': ast.style.push(...leafItems(node)); break;
      case 'verify': ast.verify.push(...leafItems(node)); break;
      // Named failure modes: PascalCase names -> a result/status union + per-error tests.
      case 'errors':
        for (const c of items(node)) ast.errors.push({ name: firstWord(c.text), line: c.line });
        break;
      // Executable examples: "given <input> -> expect <outcome>".
      case 'examples':
        for (const c of items(node)) {
          const m = c.text.match(/^(?:given\s+)?(.*?)\s*->\s*(?:expect\s+)?(.*)$/i);
          if (m) ast.examples.push({ given: m[1].trim(), expect: m[2].trim(), line: c.line });
          else ast.examples.push({ given: c.text.trim(), expect: null, line: c.line });
        }
        break;
      case 'service': ast.services.push(parseService(arg, node)); break;
      case 'api': ast.apis.push(parseApi(arg, node)); break;
      case 'event': ast.events.push(parseEvent(arg, node)); break;
      case 'database': ast.databases.push({ id: slug(arg), name: arg, engine: leafItems(node)[0] || null }); break;
      case 'architecture': ast.architecture.push(...leafItems(node)); break;
      case 'selection': ast.selection.push(...leafItems(node)); break;
      // Intentionally deferred, AI-assisted implementation. "implement with ai [pending]".
      case 'implement': {
        if (/^with\s+ai\b/.test(arg)) {
          const impl = { pending: /\bpending\b/.test(arg), line: node.line };
          for (const c of items(node)) {
            const k = firstWord(c.text).replace(/:$/, '');
            if (k === 'may_modify') impl.mayModify = leafItems(c);
            else if (k === 'must_not_modify') impl.mustNotModify = leafItems(c);
            else impl[k] = rest(c.text);
          }
          ast.implementation = impl;
        }
        break;
      }
      // IntentLift inferred-draft metadata blocks: recognized, kept as metadata, not errors.
      case 'inferred': case 'maps_to': case 'evidence': case 'unknown':
      case 'needs_review': case 'assumption': case 'source': case 'confidence':
        (ast.lift ||= {})[kw] = leafItems(node);
        break;
      case 'approval': {
        const a = {};
        for (const c of node.children) a[firstWord(c.text)] = rest(c.text);
        a.reviewed = a.reviewed === 'true';
        ast.approval = a;
        break;
      }
      default:
        ast.diagnostics.push({ level: 'info', code: 'unknown-block', message: `Unrecognized top-level block: "${kw}"` });
    }
  }

  // ── Assemble IntentLens notes with stable ids, target kinds, paths, spans ──
  const mprefix = `mission.${ast.mission || 'unnamed'}`;
  const pushNote = (raw, targetKind, targetPath) => {
    if (!raw) return;
    ast.notes.push({
      id: `note_${String(ast.notes.length + 1).padStart(3, '0')}`,
      lens: raw.lens, text: raw.text,
      targetKind, targetPath,
      sourceSpan: { line: raw.line, column: 1 },
    });
  };
  for (const nt of missionNotes) pushNote(nt, 'mission', mprefix);
  for (const f of ast.inputs) for (const nt of f.notes || []) pushNote(nt, 'input', `${mprefix}.input.${f.name}`);
  for (const f of ast.outputs) for (const nt of f.notes || []) pushNote(nt, 'output', `${mprefix}.output.${f.name}`);
  for (const g of ast.guarantees) for (const nt of g.notes || []) pushNote(nt, 'guarantee', `${mprefix}.guarantee.${g.id}`);
  for (const n of ast.neverRules) for (const nt of n.notes || []) pushNote(nt, 'never', `${mprefix}.never.${n.id}`);

  return ast;
}
