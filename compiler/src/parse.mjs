// ThunderLang parser (deterministic, no AI). Turns .intent source into an Intent AST.
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

// The primary subject of a file, so a non-mission root (a standalone service / api / event /
// capability) titles its graph and docs by its real name instead of a null "mission".
export function subjectName(ast) {
  return ast?.mission || ast?.title
    || ast?.services?.[0]?.name || ast?.apis?.[0]?.name || ast?.events?.[0]?.name
    || ast?.capabilities?.[0]?.name || ast?.commands?.[0]?.name || ast?.decisions?.[0]?.name
    || ast?.lifecycles?.[0]?.name || null;
}

/**
 * The canonical cross-ecosystem intent reference id , the stable string every SkillsTech
 * product puts in evidence-event-v1 / proof-bundle-v1 `intentReferences[]` so an evidence
 * record or Ownership Proof cites the EXACT intent it supports. IL owns this id shape.
 *
 * - Subject-level (which intent):     `intent:<mission-slug>`         (stable across versions)
 * - Version-pinned (which compile):   `intent:<mission-slug>@<sha8>`  (pass the proof `sourceHash`)
 *
 * Deterministic + browser-safe. Accepts an AST or a plain name string.
 */
export function intentRefId(astOrName, { sourceHash } = {}) {
  const name = typeof astOrName === 'string' ? astOrName : subjectName(astOrName);
  const base = `intent:${slug(name || 'mission')}`;
  if (!sourceHash) return base;
  const short = String(sourceHash).replace(/^sha256:/, '').slice(0, 8);
  return short ? `${base}@${short}` : base;
}

/**
 * The canonical shared skill id. IL owns the `skill:` NAMESPACE (the id SHAPE, this function);
 * SkillsTech Certified owns the CONTENT (which skills exist, aliases, cert->skill maps) , a
 * founder decision (2026-07-14). Deterministic + browser-safe, so OT/RM/STT/Certified emit the
 * SAME skill id for the same skill in evidence-event-v1 `skillIds[]`.
 *   skillRefId('TypeScript')          -> 'skill:typescript'
 *   skillRefId('Distributed Systems') -> 'skill:distributed-systems'
 * This is the id primitive only; the curated taxonomy list is STCE's and lands post-loop.
 */
export function skillRefId(name) {
  return `skill:${slug(name || 'unknown')}`;
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
const stripQuotes = (s) => String(s ?? '').trim().replace(/^"(.*)"$/s, '$1');
// key/value children: "classification observed" -> { classification: "observed" }.
const kvChildren = (node) => {
  const o = {};
  for (const c of node.children) { if (isNote(c)) continue; o[firstWord(c.text)] = rest(c.text); }
  return o;
};
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

// Roles that can contribute scoped constraints (Gap 1).
const ROLE_KEYWORDS = new Set(['product', 'experience', 'security', 'legal', 'operations', 'analytics', 'engineering', 'accessibility', 'business', 'design', 'qa', 'ux']);
const kids = (node) => node.children.filter((c) => !isNote(c));
const RECOVERY_RE = /\b(retry|recover|contact\s*support|contactsupport|retryprocessing|try\s*again|resume)\b/i;

// Experience Contract (intent-graph-v1 Section 7.3): UX behavior as a first-class contract.
function parseExperience(name, node) {
  const exp = { name, actor: null, goal: '', enterWhen: [], journeys: [], states: [], responsive: [], accessible: { target: null, requirements: [] }, follows: [], line: node.line };
  for (const c of kids(node)) {
    const k = firstWord(c.text); const a = rest(c.text);
    if (k === 'actor') exp.actor = a || null;
    else if (k === 'goal') exp.goal = leafItems(c).map(stripQuotes).join(' ').trim();
    else if (k === 'enter') exp.enterWhen.push(...leafItems(c)); // "enter when" + conditions
    else if (k === 'journey') exp.journeys.push({ name: a || null, steps: leafItems(c) });
    else if (k === 'state') {
      const directives = kids(c).map((x) => x.text);
      exp.states.push({
        name: a || null, directives,
        offers: directives.filter((x) => /^offer\b/i.test(x)).map((x) => x.replace(/^offer\s+/i, '')),
        preserves: directives.some((x) => /^preserve\b/i.test(x)),
        hasRecovery: directives.some((x) => RECOVERY_RE.test(x)),
        line: c.line,
      });
    } else if (k === 'responsive') exp.responsive.push(...leafItems(c).map((x) => x.replace(/^support\s+/i, '')));
    else if (k === 'accessible' || k === 'accessibility') {
      for (const x of kids(c)) {
        if (firstWord(x.text) === 'target') exp.accessible.target = rest(x.text);
        else exp.accessible.requirements.push(x.text);
      }
    } else if (k === 'follows') exp.follows.push(a);
  }
  return exp;
}

// Decision / rules (intent-graph-v1 Gap 4).
function parseDecision(name, node) {
  const dec = { name, inputs: [], rules: [], default: null, explanationRequired: false, owner: null, line: node.line };
  for (const c of node.children.filter((x) => !isNote(x))) {
    const k = firstWord(c.text); const a = rest(c.text);
    if (k === 'inputs') dec.inputs.push(...leafItems(c));
    else if (k === 'rule') {
      const kv = {};
      for (const ch of c.children.filter((x) => !isNote(x))) kv[firstWord(ch.text)] = rest(ch.text);
      dec.rules.push({ name: a || null, when: kv.when || null, result: kv.return || null, priority: kv.priority || null, line: c.line });
    } else if (k === 'default') {
      const ret = c.children.find((x) => firstWord(x.text) === 'return');
      dec.default = ret ? rest(ret.text) : (a || null);
    } else if (k === 'explanation') dec.explanationRequired = /required/.test(a);
    else if (k === 'owner') dec.owner = a || null;
  }
  return dec;
}

// Lifecycle state machine (intent-graph-v1 Gap 2).
function parseLifecycle(name, node) {
  const lc = { name, states: [], transitions: [], terminals: [], line: node.line };
  for (const c of node.children.filter((x) => !isNote(x))) {
    const k = firstWord(c.text); const a = rest(c.text);
    if (k === 'state') lc.states.push(a);
    else if (k === 'transition') {
      const kv = {};
      for (const ch of c.children.filter((x) => !isNote(x))) kv[firstWord(ch.text)] = rest(ch.text);
      lc.transitions.push({ name: a || null, from: kv.from || null, to: kv.to || null, within: kv.within || null });
    } else if (k === 'terminal') lc.terminals.push(...a.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return lc;
}

// Reusable experience pattern (Section 7.3).
function parsePattern(name, node) {
  const p = { name, requires: [], accessible: [], line: node.line };
  for (const c of kids(node)) {
    const k = firstWord(c.text);
    if (k === 'requires') p.requires.push(...leafItems(c));
    else if (k === 'accessible' || k === 'accessibility') p.accessible.push(...leafItems(c));
  }
  return p;
}

// A global invariant , a system-wide law that must hold across features / services / data.
// `invariant Name` + statement / scope / applies_to / severity / because / verify.
function parseInvariant(name, node) {
  const list = (kw) => { const b = childBlock(node, kw); return b ? leafItems(b) : []; };
  const inv = { id: slug(name), name, statement: name, scope: 'global', appliesTo: list('applies_to'), severity: 'critical', because: null, verify: [], line: node.line };
  for (const c of kids(node)) {
    const k = firstWord(c.text);
    if (k === 'verify') inv.verify.push(rest(c.text));
    else if (k === 'because') inv.because = rest(c.text);
    else if (k === 'statement') inv.statement = rest(c.text) || leafItems(c).join(' ');
    else if (k === 'scope') inv.scope = (rest(c.text) || leafItems(c).join(' ')).toLowerCase();
    else if (k === 'severity') inv.severity = (rest(c.text) || leafItems(c).join(' ')).toLowerCase();
  }
  inv.verify = inv.verify.filter(Boolean);
  return inv;
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
  const one = (kw) => { const c = node.children.find((x) => firstWord(x.text) === kw); return c ? rest(c.text) : null; };
  const payloadBlock = childBlock(node, 'payload');
  return {
    id: slug(name), name,
    publishedBy: list('publishedBy'), consumedBy: list('consumedBy'),
    payload: payloadBlock ? parseFields(payloadBlock) : [],
    guarantees: list('guarantees'),
    // Distributed delivery semantics (Gap 3): reuse the event, add fields when present.
    delivery: one('delivery'), orderedBy: one('ordered_by'),
  };
}

// Command with failure policy (Gap 3): idempotency / timeout / retry / backoff.
function parseCommand(name, node) {
  const cmd = { name, idempotencyKey: null, timeout: null, retry: null, backoff: null, line: node.line };
  for (const c of node.children.filter((x) => !isNote(x))) {
    const k = firstWord(c.text); const a = rest(c.text);
    if (k === 'idempotency_key') cmd.idempotencyKey = a;
    else if (k === 'timeout') cmd.timeout = a;
    else if (k === 'retry') {
      cmd.retry = a; // e.g. "at_most 2"
      const withBackoff = c.children.find((x) => /^with\b/.test(x.text));
      if (withBackoff) cmd.backoff = rest(withBackoff.text);
    }
  }
  return cmd;
}

// Failure / duplicate handler (Gap 3): "on <trigger>" + actions.
function parseHandler(trigger, node) {
  const actions = node.children.filter((x) => !isNote(x)).map((c) => c.text.trim());
  return {
    trigger,
    compensate: actions.filter((a) => /^compensate\b/.test(a)).map((a) => a.replace(/^compensate\s+/, '')),
    notify: actions.filter((a) => /^notify\b/.test(a)).map((a) => a.replace(/^notify\s+/, '')),
    preserve: actions.filter((a) => /^preserve\b/.test(a)).map((a) => a.replace(/^preserve\s+/, '')),
    actions,
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
    guarantees: [], neverRules: [], constraints: [], invariants: [], assumptions: [], risks: [],
    targets: [], style: [], verify: [], errors: [], examples: [],
    services: [], apis: [], events: [], databases: [], architecture: [],
    implementation: null, selection: [],
    // Product / intent-graph profile (intent-graph-v1)
    profiles: [], title: null, actor: null, problem: '', persona: null, customer: null,
    evidence: [], outcomes: [], metrics: [],
    scope: { include: [], exclude: [] }, nonGoals: [],
    owner: null, approvals: [], unknowns: [], questions: [], assumptionDecls: [],
    // Experience profile (intent-graph-v1)
    experiences: [], patterns: [],
    // Style intent , brand/visual language as a governed Experience-profile extension
    styleIntents: [],
    // Constraint composition + conflict resolution (Gap 1)
    roleConstraints: [], conflicts: [],
    // Temporal + lifecycle semantics (Gap 2)
    lifecycles: [], always: [], eventually: [], until: [],
    // Distributed + failure semantics (Gap 3)
    commands: [], handlers: [],
    // Decisions, rules, process (Gap 4)
    decisions: [],
    // Governance: waivers , governed exceptions to blocking diagnostics (Gap 5)
    waivers: [],
    // Data purpose + privacy , governed data elements (Gap 6)
    dataElements: [],
    // System profile , capabilities + system contracts (interfaces)
    capabilities: [], interfaces: [],
    // Design profile , design-system components + artifacts (mockups)
    components: [], artifacts: [],
    // Delivery profile , releases, outcome results, learnings
    releases: [], results: [], learnings: [],
    // Outcome contracts , executable commitments binding an outcome to a target
    outcomeContracts: [],
    // Skills the mission requires + the understanding a human must demonstrate (Ownership Graph seam)
    skills: [], demonstrates: [],
    // Tests , first-class cases that make a .intent file self-verifying
    tests: [],
    notes: [], diagnostics: [],
  };
  const missionNotes = [];
  const items = (node) => node.children.filter((c) => !isNote(c));
  for (const node of buildTree(toRows(source))) {
    const kw = firstWord(node.text);
    const arg = rest(node.text);
    // Role-scoped constraints (Gap 1): "product requires", "security requires", ...
    // Each role contributes constraints independently; IL composes them deterministically.
    if (ROLE_KEYWORDS.has(kw) && /^requires\b/.test(arg)) {
      for (const c of items(node)) ast.roleConstraints.push({ role: kw, statement: c.text.trim(), line: c.line });
      continue;
    }
    switch (kw) {
      case 'mission': ast.mission = arg || null; break;
      case 'note': missionNotes.push(parseNoteNode(node)); break;
      case 'goal': ast.goal = leafItems(node).join(' '); break;
      case 'why': ast.why = leafItems(node).join(' '); break;
      case 'requires': ast.requires.push(...leafItems(node)); break;
      // Skills the mission requires (Ownership Graph seam). Inline "requires_skill A, B" or a block.
      // Each is normalized to the shared `skill:<slug>` namespace (IL owns the id; STCE the content).
      case 'requires_skill': case 'requires_skills': {
        const names = (arg ? arg.split(',') : leafItems(node)).map((s) => s.trim()).filter(Boolean);
        for (const name of names) ast.skills.push({ name, id: skillRefId(name), line: node.line });
        break;
      }
      // What a human must be able to explain to own this mission (ties to Comprehension C0..C7).
      case 'demonstrates': {
        const stmts = (arg ? [arg] : leafItems(node)).map((s) => String(s).trim()).filter(Boolean);
        for (const statement of stmts) ast.demonstrates.push({ statement, line: node.line });
        break;
      }
      case 'input': ast.inputs.push(...parseFields(node)); break;
      case 'output': ast.outputs.push(...parseFields(node)); break;
      case 'guarantees': for (const c of items(node)) upsertRule(ast.guarantees, c.text, c.line); break;
      case 'guarantee': applyDetail(upsertRule(ast.guarantees, arg, node.line), node); break;
      case 'never':
        if (arg) applyDetail(upsertRule(ast.neverRules, arg, node.line), node);
        else for (const c of items(node)) upsertRule(ast.neverRules, c.text, c.line);
        break;
      case 'constraints': ast.constraints.push(...leafItems(node)); break;
      case 'invariant': if (arg) ast.invariants.push(parseInvariant(arg, node)); break;
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
      // ── Product / intent-graph profile (intent-graph-v1) ──
      case 'use': if (arg) ast.profiles.push(arg); break;
      case 'title': ast.title = stripQuotes(arg || leafItems(node).join(' ')); break;
      case 'for': ast.actor = arg || null; break;
      case 'persona': ast.persona = arg || null; break;
      case 'customer': ast.customer = arg || null; break;
      case 'problem': ast.problem = leafItems(node).map(stripQuotes).join(' ').trim(); break;
      case 'evidence': {
        const kv = kvChildren(node);
        ast.evidence.push({ name: arg, classification: kv.classification || null, confidence: kv.confidence || null, source: kv.source || null, line: node.line });
        break;
      }
      case 'outcome': ast.outcomes.push({ name: arg, description: stripQuotes(leafItems(node).join(' ')) || null, line: node.line }); break;
      case 'metric': {
        const kv = kvChildren(node);
        ast.metrics.push({ name: arg, baseline: kv.baseline || null, target: kv.target || null, window: kv.window || null, line: node.line });
        break;
      }
      case 'scope':
        for (const c of items(node)) {
          const k = firstWord(c.text);
          if (k === 'include') ast.scope.include.push(rest(c.text));
          else if (k === 'exclude') ast.scope.exclude.push(rest(c.text));
        }
        break;
      case 'non_goal': ast.nonGoals.push(arg || leafItems(node).join(' ')); break;
      case 'owner': ast.owner = arg || null; break;
      case 'unknown': {
        const kv = kvChildren(node);
        ast.unknowns.push({ name: arg, owner: kv.owner || null, resolveBefore: (kv.resolve || '').replace(/^before\s+/, '') || null, blocks: kv.blocks || null, line: node.line });
        break;
      }
      case 'question': {
        const kv = kvChildren(node);
        ast.questions.push({ name: arg, askedOf: kv.asked_of || null, blocks: kv.blocks || null, line: node.line });
        break;
      }
      case 'assumption': {
        const kv = kvChildren(node);
        ast.assumptionDecls.push({ name: arg, confidence: kv.confidence || null, validateWith: (kv.validate || '').replace(/^with\s+/, '') || null, line: node.line });
        break;
      }
      case 'experience': ast.experiences.push(parseExperience(arg, node)); break;
      case 'pattern': ast.patterns.push(parsePattern(arg, node)); break;
      case 'style_intent': {
        // Brand + visual language as a governed Experience-profile extension. Tokens are
        // (path value) pairs against a canonical address space; accessibility_target is
        // always a PROPOSED claim (IL never labels it verified , that is OT's verdict).
        const si = {
          name: arg || null, appliesTo: null, purpose: null,
          audience: [], surfaces: [], tokens: [], accessibilityTarget: null,
          scope: null, line: node.line,
        };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'applies_to') si.appliesTo = a || null;
          else if (k === 'purpose') si.purpose = stripQuotes(a || leafItems(c).join(' '));
          else if (k === 'audience') si.audience.push(...(a ? a.split(',').map((s) => s.trim()).filter(Boolean) : leafItems(c)));
          else if (k === 'surface' || k === 'surfaces') si.surfaces.push(...(a ? a.split(',').map((s) => s.trim()).filter(Boolean) : leafItems(c)));
          else if (k === 'token') {
            const bits = a.split(/\s+/);
            const path = bits.shift();
            if (path) si.tokens.push({ path, value: stripQuotes(bits.join(' ')) || null, line: c.line });
          } else if (k === 'accessibility_target' || k === 'accessibility') si.accessibilityTarget = (a || '').trim() || null;
          else if (k === 'scope') si.scope = a || null;
        }
        ast.styleIntents.push(si);
        break;
      }
      case 'decision': ast.decisions.push(parseDecision(arg, node)); break;
      // ── System profile ──
      case 'capability': {
        const cap = { name: arg, description: null, implements: [], line: node.line };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'description') cap.description = stripQuotes(a || leafItems(c).join(' '));
          else if (k === 'implements') cap.implements.push(...(a ? [a] : leafItems(c)));
        }
        ast.capabilities.push(cap);
        break;
      }
      case 'interface': {
        const iface = { name: arg, provides: [], requires: [], slo: null, line: node.line };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'provides') iface.provides.push(...(a ? [a] : leafItems(c)));
          else if (k === 'requires') iface.requires.push(...(a ? [a] : leafItems(c)));
          else if (k === 'slo') iface.slo = stripQuotes(a || leafItems(c).join(' '));
        }
        ast.interfaces.push(iface);
        break;
      }
      // ── Design profile (design-system mappings) ──
      case 'component': {
        const comp = { name: arg, description: null, variants: [], tokens: [], implements: [], line: node.line };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'description') comp.description = stripQuotes(a || leafItems(c).join(' '));
          else if (k === 'variant') comp.variants.push(...(a ? [a] : leafItems(c)));
          else if (k === 'token') comp.tokens.push(...(a ? [a] : leafItems(c)));
          else if (k === 'implements') comp.implements.push(...(a ? [a] : leafItems(c)));
        }
        ast.components.push(comp);
        break;
      }
      case 'artifact': {
        const art = { name: arg, kind: null, ref: null, covers: [], line: node.line };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'kind') art.kind = a;
          else if (k === 'ref' || k === 'url') art.ref = stripQuotes(a);
          else if (k === 'covers') art.covers.push(...(a ? [a] : leafItems(c)));
        }
        ast.artifacts.push(art);
        break;
      }
      case 'outcome_contract': {
        // An executable commitment: outcome achieved when its metric hits target within the
        // window. `direction` (higher|lower, default higher) sets which way is "better".
        const kv = kvChildren(node);
        ast.outcomeContracts.push({
          name: arg,
          outcome: kv.outcome || null,
          metric: kv.metric || null,
          baseline: kv.baseline ? stripQuotes(kv.baseline) : null,
          target: kv.target ? stripQuotes(kv.target) : null,
          direction: /lower/i.test(kv.direction || '') ? 'lower' : 'higher',
          window: kv.window || null,
          // Guardrails: what must NOT regress while the outcome improves (else the target is gameable).
          guardrails: (childBlock(node, 'guardrails') && leafItems(childBlock(node, 'guardrails'))) || [],
          // Attribution honesty: how the outcome is evidenced. Never assume causation from a metric move.
          attribution: (kv.attribution || 'unknown').toLowerCase(),
          owner: kv.owner || null,
          line: node.line,
        });
        break;
      }
      // ── Delivery profile ──
      case 'release': {
        const kv = kvChildren(node);
        const rel = { name: arg, version: kv.version ? stripQuotes(kv.version) : null, status: kv.status || 'planned', date: kv.date || null, includes: [], line: node.line };
        for (const c of kids(node)) if (firstWord(c.text) === 'includes') rel.includes.push(...(rest(c.text) ? [rest(c.text)] : leafItems(c)));
        ast.releases.push(rel);
        break;
      }
      case 'result': {
        const res = { name: arg, measures: null, metric: null, value: null, baseline: null, line: node.line };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'measures') res.measures = a;
          else if (k === 'metric') res.metric = a;
          else if (k === 'value') res.value = stripQuotes(a);
          else if (k === 'baseline') res.baseline = stripQuotes(a);
        }
        ast.results.push(res);
        break;
      }
      case 'learning': {
        const learn = { name: arg, description: null, from: null, line: node.line };
        for (const c of kids(node)) {
          const k = firstWord(c.text); const a = rest(c.text);
          if (k === 'description') learn.description = stripQuotes(a || leafItems(c).join(' '));
          else if (k === 'from') learn.from = a;
        }
        ast.learnings.push(learn);
        break;
      }
      case 'test': {
        // A first-class test block targeting a decision or lifecycle by name. Each `case`
        // (decision) has `given <k> <v>` + `expect <result>`; each `scenario` (lifecycle)
        // has `events a, b, c` + optional `expect <finalState>` / `valid` / `invalid`.
        const t = { name: arg || null, cases: [], line: node.line };
        for (const c of kids(node)) {
          const ck = firstWord(c.text);
          if (ck !== 'case' && ck !== 'scenario') continue;
          const cs = { name: rest(c.text) || null, given: {}, expect: null, events: null, expectValid: null, line: c.line };
          for (const cc of kids(c)) {
            const k = firstWord(cc.text); const a = rest(cc.text);
            if (k === 'given') {
              for (const pair of a.split(',')) {
                const bits = pair.trim().split(/\s+/);
                const key = bits.shift();
                if (key) cs.given[key] = bits.join(' ');
              }
            } else if (k === 'expect') cs.expect = a;
            else if (k === 'events') cs.events = a.split(',').map((s) => s.trim()).filter(Boolean);
            else if (k === 'valid') cs.expectValid = true;
            else if (k === 'invalid') cs.expectValid = false;
          }
          t.cases.push(cs);
        }
        ast.tests.push(t);
        break;
      }
      case 'data': {
        // A governed data element (Gap 6). "data <path>" + classification / purpose /
        // retention / basis (lawful basis). Purpose limitation is enforced by privacy.mjs.
        const kv = kvChildren(node);
        ast.dataElements.push({
          id: `data.${slug(arg || String(ast.dataElements.length + 1))}`,
          path: arg || null,
          classification: kv.classification || null,
          purpose: kv.purpose ? stripQuotes(kv.purpose) : null,
          retention: kv.retention || null,
          basis: kv.basis || null,
          line: node.line,
        });
        break;
      }
      case 'waiver': {
        // A governed exception to a blocking diagnostic (Gap 5). "waiver <CODE>" +
        // reason / approved_by / scope / expires. Deterministic; expiry evaluated by caller.
        const kv = kvChildren(node);
        ast.waivers.push({
          id: `waiver.${slug(arg || String(ast.waivers.length + 1))}`,
          code: arg || null,
          reason: kv.reason ? stripQuotes(kv.reason) : null,
          approvedBy: kv.approved_by || kv.by || null,
          scope: kv.scope || null,
          expires: kv.expires || null,
          line: node.line,
        });
        break;
      }
      case 'command': ast.commands.push(parseCommand(arg, node)); break;
      case 'on': ast.handlers.push(parseHandler(arg, node)); break;
      case 'lifecycle': ast.lifecycles.push(parseLifecycle(arg, node)); break;
      case 'always': ast.always.push(...leafItems(node)); break;
      case 'eventually': {
        const lines = leafItems(node);
        const within = (lines.find((l) => /^within\b/i.test(l)) || '').replace(/^within\s+/i, '') || null;
        const statement = lines.filter((l) => !/^within\b/i.test(l)).join(' ').trim();
        ast.eventually.push({ statement, within, line: node.line });
        break;
      }
      case 'until': {
        const lines = leafItems(node);
        const restrict = lines.find((l) => /^restrict\b/i.test(l)) || null;
        const condition = lines.filter((l) => !/^restrict\b/i.test(l)).join(' ').trim();
        ast.until.push({ condition, restrict: restrict ? restrict.replace(/^restrict\s+/i, '') : null, line: node.line });
        break;
      }
      case 'conflict': {
        const c = { name: arg, between: [], options: [], resolveBy: [], before: null, resolution: null, line: node.line };
        for (const ch of items(node)) {
          const k = firstWord(ch.text);
          if (k === 'between') c.between.push(...leafItems(ch));
          else if (k === 'options') c.options.push(...leafItems(ch));
          else if (k === 'resolve_by') c.resolveBy.push(...rest(ch.text).split(',').map((s) => s.trim()).filter(Boolean));
          else if (k === 'before') c.before = rest(ch.text) || null;
          else if (k === 'resolution') {
            // A human's recorded choice (Studio Conflict Workspace write-back).
            const kv = {};
            for (const g of ch.children.filter((x) => !isNote(x))) kv[firstWord(g.text)] = rest(g.text);
            c.resolution = { chosen: kv.choose || rest(ch.text) || null, by: kv.by || null, at: kv.at || null, decision: kv.decision || null };
          }
        }
        ast.conflicts.push(c);
        break;
      }
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
      // `evidence`, `unknown`, and `assumption` are intentionally NOT listed here: each is a real
      // top-level block handled by an earlier case in this switch (which wins), so listing them
      // again was dead duplicate `case` labels. A lifted draft's evidence/unknown lines already
      // parse via those earlier cases; behavior is unchanged.
      case 'inferred': case 'maps_to':
      case 'needs_review': case 'source': case 'confidence':
        (ast.lift ||= {})[kw] = leafItems(node);
        break;
      case 'approval': {
        // Product Mission form: "approval required from" + a list of approver roles.
        if (/\bfrom\b/.test(arg) || /\brequired\b/.test(arg)) {
          ast.approvals.push(...leafItems(node).map((s) => s.trim()).filter(Boolean));
          break;
        }
        // Drift form: reviewed/by metadata block.
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
