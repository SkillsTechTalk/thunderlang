// What kind of .thunder file is this: a mission (a specification the compiler checks) or a Thunder Core program
// (code that runs)? Decided by a fixed rule, never by guessing, in this order:
//   1. thunder new, a thunder.toml in the file's folder or above it, or --core: a program (src/core/cli.mjs).
//   2. Otherwise the file's first line that is not blank or a comment decides. A mission always starts with one of
//      the mission keywords, in lowercase, with at most a name after it ("mission Checkout", "service Billing",
//      "use product"). A line that cannot start a mission ("say "Hello"", "Set total to 0", "To greet:",
//      "A Trade has:", "Screen Today:", "Use csv as csv") means a program.
//   3. Anything that could be either (an empty file, or "use csv" alone) stays a mission, as before 1.7.
// Every mission written before this rule existed starts with a mission keyword, so none changes meaning.

/** The keywords a mission file's top-level blocks start with (the mission parser's own list, src/parse.mjs). */
export const MISSION_KEYWORDS = new Set([
  'mission', 'note', 'goal', 'why', 'requires', 'requires_skill', 'demonstrates', 'input', 'output', 'guarantees',
  'guarantee', 'never', 'constraints', 'invariant', 'assumptions', 'risks', 'target', 'style', 'verify', 'errors',
  'examples', 'service', 'api', 'event', 'database', 'architecture', 'selection', 'use', 'title', 'for', 'persona',
  'customer', 'problem', 'evidence', 'outcome', 'metric', 'scope', 'non_goal', 'owner', 'unknown', 'question',
  'assumption', 'experience', 'pattern', 'style_intent', 'decision', 'property', 'scenario', 'evaluation',
  'capability', 'interface', 'component', 'artifact', 'outcome_contract', 'release', 'result', 'learning', 'test',
  'data', 'waiver', 'command', 'on', 'lifecycle', 'always', 'eventually', 'until', 'conflict', 'implement',
  'requires_skills', 'approval', 'inferred', 'maps_to', 'needs_review', 'source', 'confidence',
]);

/** The first line of `source` that is not blank or a comment, or null. */
export function firstCodeLine(source) {
  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith('#')) return { text: line, indented: raw.length > 0 && /^\s/.test(raw) };
  }
  return null;
}

/**
 * 'mission' or 'program', from the file's text alone (rule 2 and 3 above), with the reason in words so a person
 * can see why: { kind, reason }.
 */
export function fileKind(source) {
  const first = firstCodeLine(source);
  if (!first) return { kind: 'mission', reason: 'the file has no lines yet' };
  const m = /^([a-z_]+)(?:\s+([A-Za-z_][\w.-]*))?\s*$/.exec(first.text);
  if (!first.indented && m && MISSION_KEYWORDS.has(m[1])) return { kind: 'mission', reason: `its first line starts with the mission keyword "${m[1]}"` };
  return { kind: 'program', reason: `its first line ("${first.text.length > 40 ? `${first.text.slice(0, 40)}…` : first.text}") cannot start a mission` };
}
