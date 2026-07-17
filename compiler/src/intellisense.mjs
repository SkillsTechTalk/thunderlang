// ThunderLang IntelliSense providers (deterministic, no AI). Pure functions the
// CLI, the playground API, and a future LSP all share. The playground must NOT
// reimplement these; it renders what the compiler returns.

import { KNOWN_LENSES } from './parse.mjs';

export const SEMANTIC_TYPES = [
  'Email', 'Money(USD)', 'Currency', 'Url', 'UserId', 'AccountId', 'OrderId',
  'InvoiceId', 'PaymentId', 'Secret', 'Token', 'Jwt', 'IdempotencyKey', 'Date',
  'DateTime', 'Duration', 'Percentage', 'TraceId', 'CorrelationId',
];

// Hover text for semantic types. Types not listed get a generic explanation.
const TYPE_INFO = {
  Email: { description: 'A validated email address. Prefer this over a raw string so tools can reason about PII and format.', examples: ['user@company.com'] },
  Money: { description: 'A monetary amount with a currency, for example Money(USD). Avoids float rounding bugs and ambiguous units.', examples: ['Money(USD) 100.00'] },
  'Money(USD)': { description: 'A monetary amount in US dollars. Prefer a typed money value over a number to avoid rounding and currency bugs.', examples: ['100.00'] },
  Secret: { description: 'Sensitive value that must never be logged, returned to a client, or placed in events, proof, or AI context.', examples: ['paymentToken: Secret'] },
  Token: { description: 'An opaque credential. Treat like a Secret: never log or return it.', examples: ['resetToken: Token'] },
  Jwt: { description: 'A JSON Web Token credential. Sensitive; never log or expose it.', examples: [] },
  IdempotencyKey: { description: 'A retry key. The same key must return the same result instead of creating a duplicate action.', examples: ['Use it to prevent duplicate invoices when checkout retries.'], relatedSuggestions: ['Add a duplicate prevention guarantee', 'Add a repeated-order verification test'] },
  OrderId: { description: 'The stable identity of a placed order.', examples: ['A1'] },
  InvoiceId: { description: 'The stable identity of an issued invoice.', examples: ['INV-1'] },
  TraceId: { description: 'A distributed-tracing identifier used to correlate work across services.', examples: [] },
  CorrelationId: { description: 'An identifier that correlates related requests or events.', examples: [] },
};

const LENS_INFO = {
  pm: 'Business meaning for product and non-technical stakeholders.',
  beginner: 'Plain-English explanation for someone new to programming.',
  qa: 'How to test or verify this behavior.',
  risk: 'What goes wrong if this fails.',
  security: 'Privacy, secrets, auth, or data-exposure meaning.',
  support: 'What support needs to know to help customers.',
  reviewer: 'What a reviewer should check before approving.',
  ops: 'What production signal or failure mode to watch.',
  non_goal: 'What this mission intentionally does not do.',
  term: 'Defines an unfamiliar term for readers.',
};

const BLOCK_KEYWORDS = ['goal', 'why', 'input', 'output', 'guarantees', 'never', 'verify', 'target', 'examples', 'note'];
const SENSITIVE = /payment token|secret|token|password|jwt|credential|ssn|pii|email/i;

const item = (id, label, insertText, detail, sortText = '050', kind = 'snippet') =>
  ({ id, label, kind, detail, insertText, sortText, source: 'compiler', confidence: 'high' });

const noteItem = (lens) =>
  item(`completion_note_${lens}`, `note ${lens}:`, `note ${lens}:\n  \${1:${LENS_INFO[lens]}}`, LENS_INFO[lens], '010');

const typeItem = (t) =>
  item(`completion_type_${t}`, t, t, `Semantic type: ${(TYPE_INFO[t]?.description || TYPE_INFO[t.replace(/\(.*/, '')]?.description || 'A semantic type.')}`, '020', 'type');

// Nearest enclosing top-level block above the cursor (by indentation).
function enclosingBlock(lines, idx) {
  const curIndent = lines[idx].length - lines[idx].trimStart().length;
  if (curIndent === 0) return null;
  for (let i = idx; i >= 0; i--) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = l.length - l.trimStart().length;
    if (ind < curIndent) return l.trim().split(/\s+/)[0].toLowerCase();
  }
  return null;
}

export function getCompletions(source, position = {}) {
  const lines = source.split('\n');
  const idx = Math.max(0, Math.min((position.line || 1) - 1, lines.length - 1));
  const cur = lines[idx] ?? '';
  const items = [];

  const meaningful = lines.filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (meaningful.length === 0) {
    items.push(item('completion_mission_starter', 'mission starter',
      'mission ${1:MissionName}\n  note pm:\n    ${2:Plain-English business meaning.}\n\n  goal\n    ${3:What should this accomplish?}\n\n  why\n    ${4:Why does this matter?}\n\n  input\n    ${5:field}: ${6:SemanticType}\n\n  output\n    ${7:result}: ${8:ResultType}\n\n  guarantees\n    ${9:Something that must always be true}\n\n  never\n    ${10:Something that must never happen}\n\n  verify\n    test ${11:expected behavior}\n',
      'Start a new mission with goal, why, input, output, guarantees, never, verify.', '001'));
    return { items };
  }

  // Typing a note lens: `note ` or `note pa`
  if (/(^|\s)note\s+\w*$/.test(cur)) {
    for (const lens of KNOWN_LENSES) items.push(noteItem(lens));
    return { items };
  }

  const ctx = enclosingBlock(lines, idx);

  if (SENSITIVE.test(cur) || SENSITIVE.test(lines[idx - 1] || '')) {
    items.push(item('completion_note_security', 'note security:',
      'note security:\n  ${1:This value must not appear in logs, events, responses, proof artifacts, or AI context.}',
      'Flag sensitive data handling for security readers.', '005'));
  }

  if (ctx === 'input' || ctx === 'output') {
    for (const t of SEMANTIC_TYPES) items.push(typeItem(t));
    for (const l of ['beginner', 'pm', 'qa']) items.push(noteItem(l));
  } else if (ctx === 'guarantees' || ctx === 'guarantee') {
    for (const l of ['pm', 'risk', 'qa']) items.push(noteItem(l));
    items.push(item('completion_verify', 'verify:', 'verify\n  test ${1:expected behavior}', 'Add verification evidence.', '015'));
  } else if (ctx === 'never') {
    for (const l of ['security', 'risk', 'reviewer']) items.push(noteItem(l));
    items.push(item('completion_verify', 'verify:', 'verify\n  ${1:security scan}', 'Add verification evidence.', '015'));
  } else {
    for (const kw of BLOCK_KEYWORDS) {
      if (kw === 'note') { items.push(noteItem('pm'), noteItem('beginner')); continue; }
      items.push(item(`completion_block_${kw}`, `${kw}`, `${kw}\n  \${1:...}`, `Add a ${kw} block.`, '030', 'keyword'));
    }
  }
  return { items };
}

export function getHover(source, position = {}) {
  const lines = source.split('\n');
  const idx = Math.max(0, Math.min((position.line || 1) - 1, lines.length - 1));
  const cur = lines[idx] ?? '';
  const col = Math.max(0, (position.column || 1) - 1);

  // Word under the cursor.
  let s = col, e = col;
  while (s > 0 && /[A-Za-z0-9_()]/.test(cur[s - 1])) s--;
  while (e < cur.length && /[A-Za-z0-9_()]/.test(cur[e])) e++;
  const word = cur.slice(s, e);
  if (!word) return { hover: null };

  // note lens hover
  const noteMatch = cur.match(/^\s*note\s+([A-Za-z_]+)/);
  if (noteMatch && (word === noteMatch[1] || word === 'note')) {
    const lens = noteMatch[1];
    return {
      hover: {
        target: lens, kind: 'note_lens', title: `note ${lens}`,
        description: LENS_INFO[lens] || 'An IntentLens reader lens.',
        examples: [], relatedSuggestions: [],
      },
    };
  }

  // semantic type hover (known type, or a PascalCase type-like identifier)
  const base = word.replace(/\(.*\)/, '');
  const isKnownType = SEMANTIC_TYPES.some((t) => t === word || t.replace(/\(.*/, '') === base);
  const info = TYPE_INFO[word] || TYPE_INFO[base];
  if (info || isKnownType || /^[A-Z][a-z]/.test(word)) {
    return {
      hover: {
        target: word, kind: 'semantic_type', title: word,
        description: info?.description || 'A semantic type. Prefer semantic types over raw string or number so tools can reason about meaning.',
        examples: info?.examples || [],
        relatedSuggestions: info?.relatedSuggestions || [],
      },
    };
  }
  return { hover: null };
}

// ── Autocorrect + code actions (deterministic, safety-graded) ────────────────
// Provably-safe header normalizations only. Aliases are limited to words that are
// NOT valid canonical keywords in any context (so, e.g., `inputs` is intentionally
// absent: it is the canonical sub-block of a decision and must not be touched).
const HEADER_ALIASES = { goals: 'goal', nevers: 'never' };
const TOP_HEADERS = new Set([
  'goal', 'why', 'requires', 'input', 'output', 'guarantees', 'never', 'constraints',
  'assumptions', 'risks', 'target', 'style', 'verify', 'errors', 'examples',
]);

/**
 * Apply only meaning-preserving textual fixes: rename a bare misspelled block header
 * to its canonical form (`goals` -> `goal`, `nevers` -> `never`) and strip a stray
 * trailing colon from a recognized top-level header (`goal:` -> `goal`). Operates on
 * single-word header lines only, so attached forms and leaf values are never rewritten.
 * Returns { fixed, changes }. Pure and browser-safe.
 */
export function autocorrectSource(source) {
  const lines = String(source).split('\n');
  const changes = [];
  const out = lines.map((line, i) => {
    const m = line.match(/^(\s*)([A-Za-z]+)(:?)\s*$/);
    if (!m) return line;
    const [, indent, word, colon] = m;
    const alias = HEADER_ALIASES[word.toLowerCase()];
    const target = alias || word;
    const isHeader = TOP_HEADERS.has(target.toLowerCase());
    const dropColon = Boolean(colon) && isHeader;
    if (target === word && !dropColon) return line;
    const rule = alias ? 'header-alias' : 'strip-colon';
    const fixed = `${indent}${target}`;
    changes.push({ line: i + 1, from: line.trim(), to: fixed.trim(), rule, safety: 'safe' });
    return fixed;
  });
  return { fixed: out.join('\n'), changes };
}

/**
 * The code actions available for a source: the safe autocorrects, plus the quick-fixes
 * the semantic diagnostics already carry (graded `reviewable` because they insert
 * placeholder content a human should confirm). Diagnostics are passed in so this module
 * stays browser-safe (no crypto import). Each action carries a safety level:
 * safe | reviewable | meaning_change | blocked.
 */
export function getCodeActions(source, diagnostics = []) {
  const actions = [];
  for (const c of autocorrectSource(source).changes) {
    actions.push({ title: `Normalize "${c.from}" to "${c.to}"`, kind: 'autocorrect', safety: 'safe', line: c.line, rule: c.rule });
  }
  for (const d of diagnostics) {
    for (const f of d.fix || []) {
      actions.push({ title: f.label, kind: 'quickfix', safety: 'reviewable', code: d.code, line: d.line ?? null, insert: f.insert, block: f.block });
    }
  }
  return actions;
}
