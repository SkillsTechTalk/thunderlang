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

// Strip comments, drop blank lines, keep indentation width.
function toRows(source) {
  const rows = [];
  for (const raw of source.split(/\r?\n/)) {
    // Full-line comment, or trailing "  # ..." comment.
    let line = raw.replace(/^\s*#.*$/, '');
    line = line.replace(/\s+#\s.*$/, '');
    if (!line.trim()) continue;
    rows.push({ indent: line.length - line.trimStart().length, text: line.trim() });
  }
  return rows;
}

// Build an indent tree: each node = { text, children: [] }.
function buildTree(rows) {
  const root = { text: '__root__', children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const row of rows) {
    const node = { text: row.text, children: [] };
    while (stack.length > 1 && row.indent <= stack[stack.length - 1].indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent: row.indent, node });
  }
  return root.children;
}

const leafItems = (node) => node.children.map((c) => c.text);
const childBlock = (node, kw) => node.children.find((c) => firstWord(c.text) === kw);

function parseFields(node) {
  // "key: Type" lines. A field may carry indented security modifiers (never log, etc.).
  return node.children.map((c) => {
    const m = c.text.match(/^([A-Za-z_][\w]*)\s*:\s*(.+)$/);
    const modifiers = c.children.map((mc) => mc.text);
    if (!m) return { name: c.text, type: null, modifiers };
    return { name: m[1], type: m[2].trim(), modifiers };
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

function upsertRule(list, statement) {
  const id = slug(statement);
  let r = list.find((x) => x.id === id);
  if (!r) { r = { id, statement, because: null, verify: [] }; list.push(r); }
  return r;
}

function applyDetail(rule, node) {
  for (const c of node.children) {
    const kw = firstWord(c.text);
    if (kw === 'because') rule.because = rest(c.text) || (c.children[0] && c.children[0].text) || null;
    else if (kw === 'verify') rule.verify.push(rest(c.text) || (c.children[0] && c.children[0].text) || '');
  }
  rule.verify = rule.verify.filter(Boolean);
}

export function parseIntent(source) {
  const ast = {
    mission: null, goal: '', why: '',
    requires: [], inputs: [], outputs: [],
    guarantees: [], neverRules: [], constraints: [], assumptions: [], risks: [],
    targets: [], style: [], verify: [],
    services: [], apis: [], events: [], databases: [],
    diagnostics: [],
  };
  for (const node of buildTree(toRows(source))) {
    const kw = firstWord(node.text);
    const arg = rest(node.text);
    switch (kw) {
      case 'mission': ast.mission = arg || null; break;
      case 'goal': ast.goal = leafItems(node).join(' '); break;
      case 'why': ast.why = leafItems(node).join(' '); break;
      case 'requires': ast.requires.push(...leafItems(node)); break;
      case 'input': ast.inputs.push(...parseFields(node)); break;
      case 'output': ast.outputs.push(...parseFields(node)); break;
      case 'guarantees': for (const it of leafItems(node)) upsertRule(ast.guarantees, it); break;
      case 'guarantee': applyDetail(upsertRule(ast.guarantees, arg), node); break;
      case 'never':
        if (arg) applyDetail(upsertRule(ast.neverRules, arg), node);
        else for (const it of leafItems(node)) upsertRule(ast.neverRules, it);
        break;
      case 'constraints': ast.constraints.push(...leafItems(node)); break;
      case 'assumptions': ast.assumptions.push(...leafItems(node)); break;
      case 'risks': ast.risks.push(...leafItems(node)); break;
      case 'target': ast.targets.push(...leafItems(node)); break;
      case 'style': ast.style.push(...leafItems(node)); break;
      case 'verify': ast.verify.push(...leafItems(node)); break;
      case 'service': ast.services.push(parseService(arg, node)); break;
      case 'api': ast.apis.push(parseApi(arg, node)); break;
      case 'event': ast.events.push(parseEvent(arg, node)); break;
      case 'database': ast.databases.push({ id: slug(arg), name: arg, engine: leafItems(node)[0] || null }); break;
      default:
        ast.diagnostics.push({ level: 'info', code: 'unknown-block', message: `Unrecognized top-level block: "${kw}"` });
    }
  }
  return ast;
}
