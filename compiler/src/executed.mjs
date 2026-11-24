// Proof by running: run real code, record what actually happened, and compare it with the flow Thunder drew.
//
// A reading is checked by sampling and by its own self-checks (the faithfulness gate). Running the code turns
// "carefully read" into "shown to be right": the recorders in ./runners (Python: sys.monitoring and `ast`; JavaScript:
// V8's debugger) note, for every question the code reached, where it went next, and how each call ended. Here that
// record meets Thunder's flow:
//
//   * a question: when the code's condition held, the side Thunder says it takes then (Yes, or No for a question asked
//     the positive way round of a negated condition: node.whenTrue) must hold the next step the run reached; when it
//     did not hold, the other side (or carrying straight on, when Thunder shows nothing there) must;
//   * a loop: entering it must reach its "For each" steps, and leaving it must not;
//   * a case, an error handler: the run's case or handler must hold the step that ran;
//   * an ending: a `return` line must be one of Thunder's endings (and a rule's answer must be the value given back);
//     a `raise` / `throw` line must be a Stop, of the error Thunder names; reaching the end of a function without
//     returning needs a "Done" ending.
//
// Each member is then **executed** (ran, and every claim the run reached matched), **contradicted** (some claim did
// not: each mismatch says which question, which side, which line), **not checked** (ran, but reached nothing Thunder
// claims), or **not run**. Only "executed" is written into the model (member.completeness.level), and only by a run.
// Node-only (child processes); the comparison itself, compareRun, is pure.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync, statSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReadableFiles } from './read-repo-fs.mjs';
import { thunderModel } from './model.mjs';

export const EXECUTED_SCHEMA = 'thunder-executed-v1';
const HERE = dirname(fileURLToPath(import.meta.url));
export const PY_TRACER = join(HERE, 'runners', 'thunder_trace.py');
export const JS_TRACER = join(HERE, 'runners', 'thunder-trace.cjs');
const JS_GENERATE = join(HERE, 'runners', 'thunder-generate.mjs');
const TEST_PATH = /(^|\/)(test|tests|testing|__tests__|spec|specs|fixtures?)\/|(^|\/)test_[^/]*\.py$|_test\.py$|(^|\/)conftest\.py$|\.(test|spec)\.[cm]?[jt]sx?$/;
const LANGS = { python: ['python'], js: ['javascript', 'typescript'] };

// ── Reading the flow ─────────────────────────────────────────────────────────────────────────────────────

/** Every block in a flow by its node id, and the node ids under each block (its sides, body, cases, handlers). */
function indexFlow(flow) {
  const block = new Map();
  const walk = (blocks) => {
    for (const b of blocks || []) {
      block.set(b.id, b);
      walk(b.yes); walk(b.no); walk(b.each); walk(b.body);
      for (const c of b.cases || []) walk(c.blocks);
      for (const h of b.handlers || []) { block.set(h.id, h); walk(h.blocks); }
      if (b.always) { block.set(b.always.id, b.always); walk(b.always.blocks); }
    }
  };
  walk(flow.blocks);
  return block;
}

/** The node ids in a list of blocks, at any depth. */
function idsIn(blocks, out = new Set()) {
  for (const b of blocks || []) {
    out.add(b.id);
    idsIn(b.yes, out); idsIn(b.no, out); idsIn(b.each, out); idsIn(b.body, out);
    for (const c of b.cases || []) idsIn(c.blocks, out);
    for (const h of b.handlers || []) { out.add(h.id); idsIn(h.blocks, out); }
    if (b.always) { out.add(b.always.id); idsIn(b.always.blocks, out); }
  }
  return out;
}

const firstText = (flow, blocks) => { const n = blocks?.length ? flow.nodes.find((x) => x.id === blocks[0].id) : null; return n ? `"${String(n.text).slice(0, 70)}"${n.line ? ` (line ${n.line})` : ''}` : 'nothing (it carries on)'; };
const sideName = (s) => (s === 'yes' ? 'Yes' : s === 'no' ? 'No' : s);

/**
 * Compare a run's record with the model. `trace` is { files: { path: { functions, decisions, returns } } } as the
 * recorders write it. `languages` limits which members are judged (others are left out of the result).
 */
export function compareRun(model, trace, { languages = null } = {}) {
  const members = [];
  for (const m of model.members) {
    if (languages && !languages.includes(m.language)) continue;
    const t = trace.files?.[m.file];
    members.push(judgeMember(m, t, model));
  }
  const count = (s) => members.filter((x) => x.status === s).length;
  const questions = members.reduce((a, x) => a + x.questions.drawn, 0);
  const checked = members.reduce((a, x) => a + x.questions.checked, 0);
  const summary = {
    members: members.length, run: members.filter((x) => x.runs > 0).length,
    executed: count('executed'), contradicted: count('contradicted'), notChecked: count('not checked'), notRun: count('not run'),
    questions, questionsChecked: checked,
    claims: { matched: members.reduce((a, x) => a + x.matched, 0), mismatched: members.reduce((a, x) => a + x.mismatches.length, 0), notDrawn: members.reduce((a, x) => a + x.notDrawn, 0) },
  };
  return { schema: EXECUTED_SCHEMA, members, summary };
}

function functionFor(m, t) {
  if (!t) return null;
  const fns = t.functions || {};
  if (fns[m.lines[0]]) return fns[m.lines[0]];
  // A recorder may place a function where its header starts (a decorator, a multi-line signature): the nearest
  // function line at or after the member's first line, inside its lines.
  const near = Object.keys(fns).map(Number).filter((l) => l >= m.lines[0] && l <= Math.min(m.lines[1], m.lines[0] + 3)).sort((a, b) => a - b)[0];
  return near != null ? fns[near] : null;
}

function judgeMember(m, t, model) {
  const flow = m.flow;
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const block = indexFlow(flow);
  const fn = functionFor(m, t);
  const encl = t?.returns || {};
  const runs = fn?.runs ?? 0;
  const decisions = [], mismatches = [];
  let matched = 0, notDrawn = 0;
  const nodesAt = (line) => flow.nodes.filter((n) => n.line === line);
  const drawn = (line) => flow.nodes.some((n) => n.line === line);
  // A rule's answer is drawn on its question's line; the `return` that gives it is on that line or below it, before the
  // next question. Python's recorder says which `if` / `case` holds each return (encl); otherwise the nearest answer above.
  const answers = flow.nodes.filter((n) => n.kind === 'end' && n.answer && n.line != null);
  const questionLines = flow.nodes.filter((n) => n.kind === 'decision' && n.line != null).map((n) => n.line);
  const answerFor = (R) => {
    if (encl[R] != null) return answers.find((n) => n.line === encl[R]) ?? null;
    const above = answers.filter((n) => n.line <= R).sort((a, b) => b.line - a.line)[0];
    return above && !questionLines.some((q) => q > above.line && q <= R) ? above : null;
  };
  const holds = (ids, N) => N != null && [...ids].some((id) => { const n = byId.get(id); return n && (n.line === N || (n.kind === 'end' && n.answer && answerFor(N) === n)); });
  const outside = (N, ...sets) => N != null && flow.nodes.some((n) => n.line === N && n.kind !== 'start' && !sets.some((s) => s.has(n.id)));
  const lineWords = (N) => (N == null ? 'the end of the function' : `line ${N}`);
  // A line the run reached that the picture leaves out altogether: no node of any member of the file is on it, and no
  // step shown as one piece (code, or a statement drawn without its inside) holds it. Needs the recorder's spans.
  const spans = t?.spans;
  const fileNodes = new Set(model.members.filter((x) => x.file === m.file).flatMap((x) => x.flow.nodes.map((n) => n.line)));
  const parents = new Set();
  for (const b of block.values()) for (const k of ['yes', 'no', 'each', 'body', 'blocks']) if (b[k]?.length) parents.add(b.id);
  for (const b of block.values()) if (b.cases?.some((c) => c.blocks.length) || b.handlers?.length || b.always) parents.add(b.id);
  // (Only code holds lines honestly: a step in words with nothing under it, such as a `with` read as "Calls with",
  // has dropped what is inside it.)
  const dropped = (L) => !!spans && !fileNodes.has(L) && !flow.nodes.some((n) => n.line != null && n.line < L && (spans[n.line] ?? n.line) >= L && !parents.has(n.id) && (n.kind === 'code' || n.code));
  const miss = (x) => { if (!mismatches.some((y) => y.line === x.line && y.side === x.side && y.observed === x.observed)) mismatches.push(x); };

  // ── Questions, loops, cases, handlers ──
  const obsAt = new Map(Object.entries(t?.decisions || {}).map(([l, d]) => [Number(l), d]).filter(([l]) => l >= m.lines[0] && l <= m.lines[1]));
  // A `match` Thunder drew as a chain of questions (a rule) is checked question by question: case P taken = the
  // question at line P answered Yes.
  for (const [L, d] of [...obsAt]) {
    if (d.kind !== 'match' || nodesAt(L).some((n) => n.kind === 'decision')) continue;
    for (const [k, c] of Object.entries(d.obs)) {
      const [where, N] = k.split('|');
      const P = where.startsWith('case:') ? Number(where.slice(5)) : null;
      if (P == null || !nodesAt(P).some((n) => n.kind === 'decision')) continue;
      const tgt = obsAt.get(P) || { kind: 'if', obs: {} };
      tgt.obs[`body|${N}`] = (tgt.obs[`body|${N}`] || 0) + c;
      obsAt.set(P, tgt);
    }
    obsAt.delete(L);
  }
  const checkedNodes = new Set();
  for (const [L, d] of obsAt) {
    const here = nodesAt(L);
    const node = d.kind === 'handler' ? here.find((n) => n.handler) : here.find((n) => n.kind === 'decision' && !n.handler) ?? here.find((n) => n.kind === 'loop');
    if (!node) {
      const n = Object.values(d.obs).reduce((a, b) => a + b, 0);
      if (dropped(L)) { miss({ line: L, question: null, side: 'missing', expected: 'Thunder: the picture shows nothing at this line', observed: `the run reached ${d.kind === 'handler' ? 'an error handler' : `a question (${d.kind})`} at line ${L}`, times: n }); decisions.push({ line: L, question: null, kind: d.kind, observed: {}, result: 'contradicted' }); }
      else notDrawn += n;
      continue;
    }
    const b = block.get(node.id) || {};
    const seen = {};
    let ok = 0, bad = 0;
    for (const [k, count] of Object.entries(d.obs)) {
      const [where, nRaw] = k.split('|');
      const N = nRaw === '' ? null : Number(nRaw);
      let verdict, side, expected;
      if (node.kind === 'loop' || (d.kind === 'for' && node.kind !== 'decision')) {
        const each = idsIn(b.each);
        side = where === 'body' ? 'each' : 'done';
        expected = side === 'each' ? `its "For each" steps start with ${firstText(flow, b.each)}` : 'it leaves the loop';
        if (node.kind !== 'loop') verdict = 'mismatch';
        else if (side === 'each') verdict = holds(each, N) ? 'match' : outside(N, each) ? 'mismatch' : 'unclaimed';
        else verdict = holds(each, N) && N !== L ? 'mismatch' : 'match';
      } else if (node.cases) {
        const P = where.startsWith('case:') ? Number(where.slice(5)) : null;
        const all = (b.cases || []).map((c) => ({ c, ids: idsIn(c.blocks) }));
        const mine = P != null ? all.find((x) => x.c.line === P) : null;
        side = mine ? mine.c.label : 'None of these';
        expected = mine ? `the case "${mine.c.label}" starts with ${firstText(flow, mine.c.blocks)}` : 'no case runs';
        if (P == null) verdict = all.some((x) => holds(x.ids, N)) ? 'mismatch' : 'match';
        else if (!mine) verdict = 'unclaimed';
        else if (holds(mine.ids, N)) verdict = 'match';
        else if (all.some((x) => x !== mine && holds(x.ids, N))) verdict = 'mismatch';
        else verdict = !mine.ids.size ? 'match' : outside(N, mine.ids) ? 'mismatch' : 'unclaimed';
      } else if (node.handler) {
        const ids = idsIn(b.blocks);
        side = 'handled';
        expected = `the handler does ${firstText(flow, b.blocks)}`;
        verdict = holds(ids, N) ? 'match' : outside(N, ids) ? 'mismatch' : ids.size ? 'unclaimed' : 'match';
      } else {
        // A question. The side for "the condition held" is node.whenTrue (rules: always Yes).
        const yesWhen = node.whenTrue || 'yes';
        const noWhen = yesWhen === 'yes' ? 'no' : 'yes';
        const held = where === 'body';
        side = held ? yesWhen : noWhen;
        const exp = idsIn(b[side]), other = idsIn(b[held ? noWhen : yesWhen]);
        expected = `the ${sideName(side)} side ${exp.size ? `starts with ${firstText(flow, b[side])}` : 'carries straight on'}`;
        if (holds(other, N) && !holds(exp, N) && N !== L) verdict = 'mismatch';
        else if (holds(exp, N)) verdict = 'match';
        else if (!exp.size) verdict = held || where === 'orelse' ? (outside(N, other) && N !== L ? 'mismatch' : 'unclaimed') : 'match';
        else if (N == null) verdict = where === 'end' ? 'mismatch' : 'unclaimed';
        else verdict = outside(N, exp, other) && N !== L ? 'mismatch' : 'unclaimed';
      }
      seen[sideName(side)] = (seen[sideName(side)] || 0) + count;
      if (verdict === 'match') { ok += count; matched += count; }
      else if (verdict === 'mismatch') {
        bad += count;
        miss({ line: L, question: node.text, side: sideName(side), expected: `Thunder: ${expected}`, observed: `the run went to ${lineWords(N)}${node.kind === 'loop' || node.cases || node.handler ? '' : where === 'body' ? ' (the condition held)' : ' (the condition did not hold)'}`, times: count });
      } else notDrawn += count;
    }
    if (ok || bad) checkedNodes.add(node.id);
    decisions.push({ line: L, question: node.text, kind: d.kind, observed: seen, result: bad ? 'contradicted' : ok ? 'matched' : 'not drawn' });
  }

  // ── Endings ──
  const endings = [];
  if (fn) {
    for (const [R, e] of Object.entries(fn.returns || {})) {
      const line = Number(R);
      // Every ending drawn for this return (a one-line `return x` read as a yes/no rule has both answers on it).
      const ends = [...new Set([...flow.nodes.filter((n) => n.kind === 'end' && n.line === line), answerFor(line)].filter(Boolean))];
      const end = ends[0];
      const stop = flow.nodes.find((n) => n.kind === 'stop' && n.line === line);
      let result = 'not drawn';
      if (end) {
        result = 'matched';
        // A rule's text answer is kept without its quotes ("big"): it is text when the code returns quoted text there.
        const quoted = /\breturn\s+(["'])/.test(sourceLine(model, m.file, line));
        const wants = ends.map((x) => literal(x.value) ?? (quoted && x.value != null ? String(x.value) : undefined));
        const got = e.values.map(literal);
        if (wants.every((w) => w !== undefined) && e.values.length && got.every((g) => g !== undefined) && got.some((g) => !wants.some((w) => sameValue(g, w)))) {
          result = 'contradicted';
          miss({ line, question: null, side: 'ending', expected: `Thunder: it gives back ${ends.map((x) => x.value).join(' or ')} here`, observed: `the run gave back ${e.values.join(', ')}`, times: e.count });
        }
      } else if (stop) {
        result = 'contradicted';
        miss({ line, question: null, side: 'ending', expected: `Thunder: ${stop.text} (line ${line})`, observed: 'the run returned there', times: e.count });
      }
      if (result === 'not drawn' && dropped(line)) { result = 'contradicted'; miss({ line, question: null, side: 'missing', expected: 'Thunder: the picture shows nothing at this line', observed: 'the run returned there', times: e.count }); }
      if (result === 'matched') matched += e.count; else if (result === 'not drawn') notDrawn += e.count;
      endings.push({ line, kind: 'return', count: e.count, values: e.values, result });
    }
    for (const [R, e] of Object.entries(fn.raises || {})) {
      const line = Number(R);
      const stop = flow.nodes.find((n) => n.kind === 'stop' && n.line === line);
      const other = flow.nodes.find((n) => n.line === line && (n.kind === 'end'));
      let result = 'not drawn';
      if (stop) {
        result = 'matched';
        const named = stopType(stop.text, sourceLine(model, m.file, line));
        const types = Object.entries(e.types);
        // `from .exceptions import SSLError as RequestsSSLError`: the code's name for a class may be an alias.
        const also = named ? aliasesOf(model, m.file, named) : [];
        if (named && types.length && types.some(([, mro]) => !mro.includes(named) && !also.some((a) => mro.includes(a)))) {
          result = 'contradicted';
          miss({ line, question: null, side: 'Stop', expected: `Thunder: it stops with ${named}`, observed: `the run raised ${types.map(([n]) => n).join(', ')}`, times: e.count });
        }
      } else if (other) {
        result = 'contradicted';
        miss({ line, question: null, side: 'ending', expected: `Thunder: ${other.text} (line ${line})`, observed: `the run raised ${Object.keys(e.types).join(', ')} there`, times: e.count });
      }
      if (result === 'not drawn' && dropped(line)) { result = 'contradicted'; miss({ line, question: null, side: 'missing', expected: 'Thunder: the picture shows nothing at this line', observed: `the run raised ${Object.keys(e.types).join(', ')} there`, times: e.count }); }
      if (result === 'matched') matched += e.count; else if (result === 'not drawn') notDrawn += e.count;
      endings.push({ line, kind: 'raise', count: e.count, types: Object.keys(e.types), result });
    }
    if (fn.fellOff) {
      // Reaching the end of the body matches "Done", or an ending drawn on the last line that ran (a web handler's
      // `res.send(…)` is how it answers: Thunder draws it as the ending).
      const done = flow.nodes.find((n) => n.kind === 'end' && n.line == null);
      const lastLines = Object.keys(fn.fellOffAt || {}).map(Number);
      const endedThere = lastLines.length && lastLines.every((l) => flow.nodes.some((n) => n.kind === 'end' && n.line === l));
      const ok = !!done || !!endedThere;
      if (ok) matched += fn.fellOff;
      else miss({ line: lastLines[0] ?? m.lines[1], question: null, side: 'ending', expected: 'Thunder: every path ends with an answer or a Stop', observed: `the run reached the end of the function without giving anything back${lastLines.length ? ` (after line ${lastLines.join(', ')})` : ''}`, times: fn.fellOff });
      endings.push({ line: null, kind: 'end of function', count: fn.fellOff, ...(lastLines.length ? { after: lastLines } : {}), result: ok ? 'matched' : 'contradicted' });
    }
  }

  const drawnQuestions = flow.nodes.filter((n) => (n.kind === 'decision' || n.kind === 'loop') && n.line != null && !n.code);
  const status = runs === 0 && !matched && !mismatches.length ? 'not run' : mismatches.length ? 'contradicted' : matched ? 'executed' : 'not checked';
  return {
    id: m.id, file: m.file, name: m.name, lines: m.lines, language: m.language, status, runs,
    questions: { drawn: drawnQuestions.length, checked: drawnQuestions.filter((n) => checkedNodes.has(n.id)).length },
    matched, notDrawn, decisions, endings, mismatches,
  };
}

function sourceLine(model, file, line) { return model._sources?.get(file)?.[line - 1] ?? ''; }

/** The original names a file imports under `name`: `import { A as name }`, `from m import A as name`. */
function aliasesOf(model, file, name) {
  const text = (model._sources?.get(file) || []).join('\n');
  return [...text.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s+as\\s+${name}\\b`, 'g'))].map((x) => x[1]);
}

/** The error type a Stop names, when the code's own raise / throw line names that type too. */
function stopType(text, code) {
  const m = String(text).match(/^Stop:\s*([A-Z][A-Za-z0-9_]*)(?=:|\s*$|\s*\()/);
  if (!m) return null;
  return new RegExp(`\\b(?:raise|throw\\s+new|throw)\\s+(?:[\\w.]+\\.)?${m[1]}\\b`).test(code) ? m[1] : null;
}

/** A plain literal as a value: numbers, quoted text, yes/no, nothing. undefined when it is not a literal. */
function literal(v) {
  const s = String(v ?? '').trim();
  if (v == null || s === '') return undefined;
  if (/^-?\d+(?:\.\d+)?(?:e-?\d+)?$/i.test(s)) return Number(s);
  if (/^(True|true)$/.test(s)) return true;
  if (/^(False|false)$/.test(s)) return false;
  if (/^(None|null|nil)$/.test(s)) return null;
  if (s === 'undefined') return 'undefined';
  const q = s.match(/^(["'])((?:\\.|(?!\1).)*)\1$/);
  if (q) { try { return JSON.parse(`"${q[2].replace(/\\'/g, "'").replace(/"/g, '\\"')}"`); } catch { return q[2]; } }
  return undefined;
}
const sameValue = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b);

/** Write "executed" into the model for every member a run proved, with the reason. Returns the model. */
export function markExecuted(model, result) {
  const byId = new Map(result.members.map((r) => [r.id, r]));
  for (const m of model.members) {
    const r = byId.get(m.id);
    if (!r || r.status !== 'executed') continue;
    m.completeness = { level: 'executed', reasons: [`Ran ${r.runs} time${r.runs === 1 ? '' : 's'}; every question and ending the runs reached matched this flow (${r.questions.checked} of ${r.questions.drawn} questions checked).`] };
  }
  return model;
}

// ── Running ──────────────────────────────────────────────────────────────────────────────────────────────

/** Add one record into another (counts add up; values are kept once). */
export function mergeTraces(into, add) {
  into.files ||= {};
  for (const [file, f] of Object.entries(add.files || {})) {
    const t = (into.files[file] ||= { functions: {}, decisions: {}, returns: {} });
    Object.assign(t.returns, f.returns || {});
    if (f.spans) t.spans = { ...(t.spans || {}), ...f.spans };
    for (const [l, d] of Object.entries(f.decisions || {})) {
      const x = (t.decisions[l] ||= { kind: d.kind, obs: {} });
      for (const [k, c] of Object.entries(d.obs)) x.obs[k] = (x.obs[k] || 0) + c;
    }
    for (const [l, fn] of Object.entries(f.functions || {})) {
      const x = (t.functions[l] ||= { runs: 0, returns: {}, raises: {}, fellOff: 0, unwound: 0 });
      x.runs += fn.runs; x.fellOff += fn.fellOff || 0; x.unwound += fn.unwound || 0;
      for (const [l, c] of Object.entries(fn.fellOffAt || {})) (x.fellOffAt ||= {})[l] = (x.fellOffAt[l] || 0) + c;
      for (const [r, e] of Object.entries(fn.returns || {})) { const y = (x.returns[r] ||= { count: 0, values: [] }); y.count += e.count; for (const v of e.values) if (!y.values.includes(v) && y.values.length < 6) y.values.push(v); }
      for (const [r, e] of Object.entries(fn.raises || {})) { const y = (x.raises[r] ||= { count: 0, types: {} }); y.count += e.count; Object.assign(y.types, e.types); }
    }
  }
  (into.runs ||= []).push(...(add.runs || []));
  return into;
}

const scratch = () => mkdtempSync(join(tmpdir(), 'thunder-run-'));

/**
 * Run Python code under the recorder. mode: 'generate' (made-up inputs for functions that look free of side
 * effects), 'discover' (call test_* functions under `tests`), or 'pytest' (pytest in the same process; it must be
 * installed for `python`). Returns a record with `runs: [{ how, ... }]`.
 */
export function runPython(root, { mode = 'generate', tests, pytestArgs = [], python = 'python3', maxSeconds = 120, maxCalls = 200, cwd } = {}) {
  const dir = scratch();
  const out = join(dir, 'trace.json');
  const args = ['-I', '-B', PY_TRACER, '--root', root, '--out', out, '--max-seconds', String(maxSeconds), '--max-calls', String(maxCalls)];
  if (mode === 'generate') args.push('--generate');
  else if (mode === 'discover') args.push('--discover', tests);
  else args.push('--pytest', '--', ...pytestArgs);
  const began = Date.now();
  // Generated inputs and test discovery run from a scratch folder, so nothing in the code's folder is picked up by
  // accident; pytest runs in the code's folder so its configuration applies.
  const r = spawnSync(python, args, { cwd: mode === 'pytest' ? cwd || root : dir, encoding: 'utf8', timeout: (maxSeconds + 60) * 1000, maxBuffer: 64 * 1024 * 1024 });
  let trace = { files: {}, meta: {} };
  try { trace = JSON.parse(readFileSync(out, 'utf8')); } catch { trace.meta = { errors: [`The Python recorder did not finish: ${(r.error?.message || r.stderr || '').slice(-400)}`] }; }
  rmSync(dir, { recursive: true, force: true });
  trace.runs = [{ how: mode === 'generate' ? 'generated inputs' : mode === 'discover' ? `test functions in ${tests}` : `pytest ${pytestArgs.join(' ')}`.trim(), language: 'python', seconds: (Date.now() - began) / 1000, ...trace.meta, exit: r.status }];
  return trace;
}

/**
 * Run JavaScript under the recorder: `command` (a shell command, e.g. the project's test runner, run in the code's
 * folder with the recorder loaded into every Node process it starts) or made-up inputs for exported functions that
 * look free of side effects.
 */
export function runJs(root, { mode = 'generate', command, node = process.execPath, maxSeconds = 120, maxCalls = 200, cwd } = {}) {
  const dir = scratch();
  const env = { ...process.env, THUNDER_TRACE_ROOT: root, THUNDER_TRACE_OUT: dir, THUNDER_TRACE_MAX_SECONDS: String(maxSeconds), NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(JS_TRACER)}`.trim() };
  const began = Date.now();
  const r = mode === 'command'
    ? spawnSync(command, { shell: true, cwd: cwd || root, env, encoding: 'utf8', timeout: (maxSeconds + 60) * 1000, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync(node, [JS_GENERATE, root, String(maxCalls)], { cwd: dir, env, encoding: 'utf8', timeout: (maxSeconds + 60) * 1000, maxBuffer: 64 * 1024 * 1024 });
  const trace = { files: {}, runs: [] };
  const metas = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => /^trace-\d+\.json$/.test(x)) : []) {
    try { const t = JSON.parse(readFileSync(join(dir, f), 'utf8')); mergeTraces(trace, t); metas.push(t.meta); } catch { /* a process that died mid-write */ }
  }
  rmSync(dir, { recursive: true, force: true });
  const calls = mode === 'generate' ? (() => { try { return JSON.parse(r.stdout).calls; } catch { return 0; } })() : undefined;
  trace.runs = [{ how: mode === 'command' ? command : 'generated inputs', language: 'js', seconds: (Date.now() - began) / 1000, processes: metas.length, pauses: metas.reduce((a, x) => a + (x?.pauses || 0), 0), undecided: metas.reduce((a, x) => a + (x?.undecided || 0), 0), capped: metas.some((x) => x?.capped), ...(calls != null ? { calls } : {}), exit: r.status, ...(r.status && !metas.length ? { errors: [String(r.stderr || r.error?.message || '').slice(-400)] } : {}) }];
  return trace;
}

/** Which language a folder is mostly written in, of the two Thunder can run. */
export function languageOf(root) {
  let py = 0, js = 0;
  for (const f of collectReadableFiles(root, { maxFiles: 3000 })) { if (/\.py$/.test(f.path)) py++; else if (/\.[cm]?[jt]sx?$/.test(f.path)) js++; }
  return py >= js ? 'python' : 'js';
}

/**
 * Read a folder, run it (its tests when given, and made-up inputs), and compare. Options: lang ('python' | 'js'),
 * tests (a folder of test_* functions, Python), pytest (arguments; runs pytest), command (JS: a shell command such as
 * the project's test runner), cwd (where pytest or the command runs; default the folder: lets one project's tests
 * exercise another folder's code), trace (a saved record to compare again instead of running), generate (default
 * true), python, maxSeconds, maxCalls.
 */
export function verifyRun(root, opts = {}) {
  root = realpathSync(root);
  if (!statSync(root).isDirectory()) throw new Error(`${root} is not a folder.`);
  const lang = opts.lang || languageOf(root);
  if (!LANGS[lang]) throw new Error(`Thunder runs python or js code; got "${lang}".`);
  const trace = { files: {}, runs: [] };
  if (opts.trace) mergeTraces(trace, typeof opts.trace === 'string' ? JSON.parse(readFileSync(opts.trace, 'utf8')) : opts.trace);
  else if (lang === 'python') {
    if (opts.pytest != null) mergeTraces(trace, runPython(root, { ...opts, mode: 'pytest', pytestArgs: [].concat(opts.pytest).flatMap((a) => String(a).split(/\s+/)).filter(Boolean) }));
    const tests = opts.tests ?? ['tests', 'test'].map((d) => join(root, d)).find((d) => existsSync(d));
    if (tests && opts.pytest == null) mergeTraces(trace, runPython(root, { ...opts, mode: 'discover', tests }));
    if (opts.generate !== false) mergeTraces(trace, runPython(root, { ...opts, mode: 'generate' }));
  } else {
    if (opts.command) mergeTraces(trace, runJs(root, { ...opts, mode: 'command' }));
    if (opts.generate !== false) mergeTraces(trace, runJs(root, { ...opts, mode: 'generate' }));
  }
  const files = collectReadableFiles(root, { maxFiles: 5000 }).filter((f) => f.source && !TEST_PATH.test(f.path) && LANGS[lang].includes(langOfPath(f.path)));
  const model = thunderModel(files, { name: root.split('/').pop() });
  Object.defineProperty(model, '_sources', { value: new Map(files.map((f) => [f.path, f.source.split('\n')])), enumerable: false });
  const result = compareRun(model, trace, { languages: LANGS[lang] });
  result.language = lang;
  result.runs = trace.runs;
  markExecuted(model, result);
  return { result, model, trace };
}

const langOfPath = (p) => (/\.py$/.test(p) ? 'python' : /\.[cm]?tsx?$/.test(p) ? 'typescript' : /\.[cm]?jsx?$/.test(p) ? 'javascript' : null);

/** The result in words, for a person: totals, then every contradiction with its question, side, and line. */
export function executedText(result, { all = false } = {}) {
  const s = result.summary;
  const out = [];
  for (const r of result.runs || []) out.push(`  ran: ${r.how} (${r.language}, ${r.seconds}s${r.calls != null ? `, ${r.calls} calls` : ''}${r.capped ? ', stopped at the time cap' : ''}${r.errors?.length ? `, ${r.errors.length} could not run` : ''})`);
  out.push(`  ${s.members} members: ${s.executed} executed, ${s.contradicted} contradicted, ${s.notChecked} ran with nothing to check, ${s.notRun} not run`);
  out.push(`  questions: ${s.questionsChecked} of ${s.questions} checked by a run; claims matched ${s.claims.matched}, contradicted ${s.claims.mismatched}, not drawn ${s.claims.notDrawn}`);
  for (const m of result.members) {
    if (m.status === 'contradicted') {
      out.push(`  contradicted  ${m.file}:${m.lines[0]} ${m.name}`);
      for (const x of m.mismatches) out.push(`    line ${x.line}${x.question ? ` "${x.question}"` : ''} ${x.side}: ${x.expected}; ${x.observed}${x.times > 1 ? ` (${x.times} times)` : ''}`);
    } else if (all) out.push(`  ${m.status.padEnd(12)}  ${m.file}:${m.lines[0]} ${m.name}${m.runs ? ` (${m.runs} runs; ${m.questions.checked} of ${m.questions.drawn} questions checked)` : ''}`);
  }
  return out.join('\n');
}
