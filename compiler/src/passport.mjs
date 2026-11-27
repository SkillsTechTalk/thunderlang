// Thunder Software Passport (thunder-passport-v1): a portable evidence record for a feature or a change.
//
// It is not a certificate that the code is correct. It is an evidence manifest: every claim names its basis (a
// command and its exit code, or a source location), what it does not cover, and the exact files (by content hash)
// it depended on. When one of those files changes, the claim is stale, and checkPassport says so.
//
// This file is the pure, browser-safe half: it assembles a passport from what was read and run, renders it, and
// checks it against current file contents. Reading folders, git, and running commands is in passport-fs.mjs.
import { sha256 } from './hash.mjs';
import { thunderModel, modelText } from './model.mjs';
import { buildTrace, isTestFile } from './trace.mjs';
import { thunderReview } from './review.mjs';
import { byText } from './text-order.mjs';

export const PASSPORT_SCHEMA = 'thunder-passport-v1';

/** What nothing in a passport establishes unless an evidence item says otherwise. Always listed. */
export const ALWAYS_NOT_VERIFIED = [
  'Deployment: how it is configured and run in a real environment.',
  'External services: real providers, their answers, and their outages (tests use what the code was given).',
  'More than one process or machine: anything kept in memory is not shared between copies.',
  'Load and timing: behavior under many requests at once, beyond what the tests ran.',
];

const MAX_BEHAVIOR = 60;
const fileHash = (source) => sha256(String(source)); // 'sha256:<hex>'

const EFFECT = { find: 'reads', save: 'writes', send: 'sends', ask: 'calls another part', redirect: 'sends the person to' };
function effectKind(node) {
  if (node.does === 'save' && /^(Deletes|Removes)\b/.test(node.text || '')) return 'deletes';
  return EFFECT[node.does] ?? null;
}

/**
 * Assemble a passport from parts already read (and, for a change, their base versions), runs already made, and a
 * purpose. Pure and deterministic: the same inputs (with the same `builtAt`) give the same passport.
 *   parts:   [{ name, path, sha?, dirty?, files: [{ path, source, manifest? }], packages?: [{ name, version?, from }],
 *              changes?: [{ file, status: 'added'|'changed'|'removed', ranges: [[a, b]…], old?: string|null }] }]
 *   change:  { base, head } when this is a change (each part's `changes` then say what changed); null for a snapshot
 *   runs:    [{ command, part: name|null, cwd, exitCode, output }] (output: what it printed, both streams)
 *   purpose: { text, source } or null
 *   extra:   evidence items supplied by other tools (an access-flow result, a conformance run…), already in shape
 */
export function assemblePassport({ parts, change = null, runs = [], purpose = null, extra = [], builtAt = new Date().toISOString(), thunder = null }) {
  const hashes = new Map(); // `${part}/${file}` -> { part, file, sha256 }
  for (const p of parts) for (const f of p.files) hashes.set(`${p.name}/${f.path}`, { part: p.name, file: f.path, sha256: fileHash(f.source) });
  const inputOf = (part, file) => hashes.get(`${part}/${file}`) ?? { part, file, sha256: null };
  const partInputs = (name) => [...hashes.values()].filter((h) => h.part === name);

  const models = new Map(parts.map((p) => [p.name, thunderModel(p.files.filter((f) => !f.manifest), { name: p.name })]));
  const changed = (p, file) => (p.changes ?? []).find((c) => c.file === file);

  // Behavior: in a change, the actions and rules whose lines the change touched (or in an added file); in a
  // snapshot, every action and rule. Test code is evidence, not behavior.
  const behavior = [], effects = [], notRead = [];
  for (const p of parts) {
    const model = models.get(p.name);
    for (const m of model.members) {
      if (m.kind === 'setup' || isTestFile(m.file)) continue;
      const c = change ? changed(p, m.file) : null;
      if (change && !(c && (c.status === 'added' || c.ranges.some(([a, b]) => a <= m.lines[1] && b >= m.lines[0])))) continue;
      const item = { part: p.name, file: m.file, lines: m.lines, name: m.label, kind: m.kind, ...(c ? { change: c.status } : {}) };
      if (m.kind === 'not-read') { notRead.push({ part: p.name, file: m.file, line: m.lines[0], what: `${m.label}: Thunder does not read this yet` }); continue; }
      let text = '';
      try { text = modelText(model, m.id).trim(); } catch { text = ''; }
      behavior.push({ ...item, text });
      for (const nd of m.flow?.nodes ?? []) {
        const kind = effectKind(nd);
        if (kind) effects.push({ part: p.name, file: m.file, line: nd.line ?? m.lines[0], in: m.label, kind, says: nd.text, how: 'detected', basis: 'read from code; nothing was run' });
        if (nd.does === 'code' && nd.line != null) notRead.push({ part: p.name, file: m.file, line: nd.line, what: `shown as code: ${String(nd.text).slice(0, 100)}` });
      }
    }
    for (const u of model.unknowns ?? []) {
      if (isTestFile(u.file)) continue;
      const c = change ? changed(p, u.file) : null;
      if (change && !(c && (c.status === 'added' || c.ranges.some(([a, b]) => u.line >= a && u.line <= b)))) continue;
      const owner = model.members.find((m) => m.file === u.file && m.lines[0] <= u.line && m.lines[1] >= u.line);
      notRead.push({ part: p.name, file: u.file, line: u.line, what: owner ? `${owner.label}: ${u.why}` : u.why });
    }
  }
  const order = (a, b) => byText(`${a.part}/${a.file}`, `${b.part}/${b.file}`) || ((a.lines?.[0] ?? a.line ?? 0) - (b.lines?.[0] ?? b.line ?? 0));
  behavior.sort(order); effects.sort(order); notRead.sort(order);
  { const seen = new Set(); notRead.splice(0, notRead.length, ...notRead.filter((x) => { const k = `${x.part}/${x.file}:${x.line}`; if (seen.has(k)) return false; seen.add(k); return true; })); }
  const shownBehavior = behavior.slice(0, MAX_BEHAVIOR);

  // Dependencies: every file read (with its hash), the links between the parts, packages, and services called.
  const trace = buildTrace(parts.map((p) => ({ name: p.name, sha: p.sha ?? null, dirty: !!p.dirty, files: p.files.filter((f) => !f.manifest) })));
  const linkSays = (l) => (l.kind === 'http' ? `${l.from.repo} calls ${l.to.repo}: ${l.method} ${l.path} (handled by ${l.to.label ?? l.route})`
    : l.kind === 'event' ? `${l.from.repo} publishes ${l.event}, and ${l.to.repo} listens`
      : l.kind === 'data' ? `${l.from.repo} ${l.access} the ${l.table} table, which ${l.to.repo} creates`
        : `${l.from.repo} depends on the package ${l.package}, which ${l.to.repo} publishes`);
  const links = trace.links.map((l) => ({ kind: l.kind, says: linkSays(l), from: l.from.cite, to: l.to.cite }));
  const services = [];
  for (const r of trace.repos) for (const q of r.requests ?? []) if (q.base && q.base !== 'this app') services.push({ part: r.name, calls: `${q.method} ${q.base}${q.path}`, at: `${r.name}:${q.file}:${q.line}` });

  // Evidence.
  const evidence = [];
  const add = (x) => evidence.push({ id: `e${evidence.length + 1}`, ...x });
  for (const r of runs) {
    const passed = r.exitCode === 0;
    const tail = String(r.output ?? '').replace(/\s+$/, '').split('\n').slice(-12).join('\n');
    add({
      kind: 'test-run', status: passed ? 'passed' : 'failed',
      claim: `\`${r.command}\`${r.part ? ` in ${r.part}` : ''} exited with ${r.exitCode}${passed ? '' : ' (a failure)'}.`,
      basis: { command: r.command, cwd: r.cwd, exitCode: r.exitCode, outputDigest: fileHash(r.output ?? ''), outputTail: tail },
      scope: 'Only what these tests exercise. Thunder did not measure which lines or paths they cover.',
      inputs: r.part ? partInputs(r.part) : [...hashes.values()],
    });
  }
  for (const l of trace.links) {
    add({
      kind: 'trace-link', status: 'read',
      claim: l.kind === 'http' ? `${l.from.repo} calls ${l.to.repo} with ${l.method} ${l.path}, and ${l.to.repo} handles it.`
        : l.kind === 'event' ? `${l.from.repo} publishes "${l.event}", and ${l.to.repo} listens for it.`
          : l.kind === 'data' ? `${l.from.repo} ${l.access} the ${l.table} table, and ${l.to.repo} creates it.`
            : `${l.from.repo} depends on the package ${l.package}, and ${l.to.repo} publishes it.`,
      basis: { from: l.from.cite, to: l.to.cite, rules: `thunder-trace rules v${trace.rulesVersion}` },
      scope: 'Read from code; nothing was run. It does not show that the call succeeds or what it answers.',
      inputs: [inputOf(l.from.repo, l.from.file), inputOf(l.to.repo, l.to.file)],
    });
  }
  let review = null;
  if (change) {
    const oldFiles = [], newFiles = [], changedInputs = [];
    for (const p of parts) for (const c of p.changes ?? []) {
      if (c.old != null) oldFiles.push({ path: `${p.name}/${c.file}`, source: c.old });
      const now = p.files.find((f) => f.path === c.file);
      if (now && c.status !== 'removed') { newFiles.push({ path: `${p.name}/${c.file}`, source: now.source }); changedInputs.push(inputOf(p.name, c.file)); }
    }
    review = thunderReview(oldFiles, newFiles);
    add({
      kind: 'review', status: 'read',
      claim: `What the change does, read from both versions: ${review.says}`,
      basis: { base: change.base, head: change.head, schema: review.schema, meaning: review.summary.meaning, risk: review.summary.risk, form: review.summary.form },
      scope: 'What the code says before and after; not whether it runs or is right.',
      inputs: changedInputs,
    });
  }
  for (const x of extra) add({ ...x, inputs: (x.inputs ?? []).map((i) => (i.sha256 ? i : inputOf(i.part, i.file))) });

  // Unknowns: what Thunder could not read or link, the parts no test ran in, and what nothing here verified.
  const tested = new Set(runs.filter((r) => r.part).map((r) => r.part));
  const anyUnscoped = runs.some((r) => !r.part);
  const untested = anyUnscoped ? [] : parts.filter((p) => !tested.has(p.name)).map((p) => ({ part: p.name, what: `No tests were run in ${p.name}.` }));
  const notLinked = trace.notLinked.map((n) => ({ kind: n.kind, call: n.call, at: n.from.cite, why: n.why }));
  const unknowns = {
    notRead, notLinked, untested,
    ...(behavior.length > MAX_BEHAVIOR ? { notShown: `${behavior.length - MAX_BEHAVIOR} more actions and rules are not listed (the first ${MAX_BEHAVIOR} are).` } : {}),
    notVerified: [...ALWAYS_NOT_VERIFIED, ...runs.filter((r) => r.exitCode !== 0).map((r) => `\`${r.command}\` failed, so what it tests is not verified.`)],
  };

  const changedFiles = change ? parts.flatMap((p) => (p.changes ?? []).map((c) => ({ part: p.name, file: c.file, status: c.status }))) : [];
  const body = {
    schema: PASSPORT_SCHEMA,
    subject: { kind: change ? 'change' : 'feature', parts: parts.map((p) => ({ name: p.name, path: p.path ?? p.name, sha: p.sha ?? null, dirty: !!p.dirty })) },
    purpose: purpose?.text ? { stated: true, text: purpose.text, source: purpose.source ?? 'given when the passport was built' } : { stated: false, text: 'not stated', source: null },
    behavior: shownBehavior,
    dependencies: { files: [...hashes.values()], links, packages: parts.flatMap((p) => p.packages ?? []), services },
    effects,
    evidence,
    unknowns,
    history: { base: change?.base ?? null, head: change?.head ?? null, changedFiles, thunder },
  };
  const summary = summarize(body);
  return { ...body, summary, history: { ...body.history, builtAt }, fingerprint: sha256(JSON.stringify({ ...body, summary })) };
}

/** The counts people read first. A claim is an evidence item; nothing counts as verified without one. */
export function summarize(p) {
  const by = (s) => p.evidence.filter((e) => e.status === s).length;
  const u = p.unknowns;
  return {
    claims: p.evidence.length, passed: by('passed'), failed: by('failed'), readFromCode: by('read'),
    unknowns: u.notRead.length + u.notLinked.length + u.untested.length, notVerified: u.notVerified.length,
  };
}

/**
 * Is each evidence item still about the code as it is now? `read(part, file)` gives a file's current text, or null
 * when it is gone. Nothing is re-run: an item is `current` when every file it depended on is unchanged, else `stale`
 * (naming each changed or missing file). Items with no recorded inputs are `unknown`.
 */
export function checkPassport(passport, { read }) {
  if (passport?.schema !== PASSPORT_SCHEMA) throw new Error('this is not a Thunder passport (thunder-passport-v1).');
  const cache = new Map();
  const now = (part, file) => {
    const k = `${part}/${file}`;
    if (!cache.has(k)) { const s = read(part, file); cache.set(k, s == null ? null : fileHash(s)); }
    return cache.get(k);
  };
  const items = passport.evidence.map((e) => {
    if (!e.inputs?.length) return { id: e.id, kind: e.kind, claim: e.claim, freshness: 'unknown', changed: [] };
    const changed = [];
    for (const i of e.inputs) {
      const h = now(i.part, i.file);
      if (h == null) changed.push({ part: i.part, file: i.file, now: 'missing' });
      else if (h !== i.sha256) changed.push({ part: i.part, file: i.file, now: 'changed' });
    }
    return { id: e.id, kind: e.kind, claim: e.claim, freshness: changed.length ? 'stale' : 'current', changed };
  });
  const files = passport.dependencies.files.map((f) => ({ ...f, now: now(f.part, f.file) })).filter((f) => f.now !== f.sha256)
    .map((f) => ({ part: f.part, file: f.file, now: f.now == null ? 'missing' : 'changed' }));
  return { schema: 'thunder-passport-check-v1', current: items.filter((x) => x.freshness === 'current').length, stale: items.filter((x) => x.freshness === 'stale').length, items, changedFiles: files };
}

const MARK = { passed: '✓', failed: '✗', read: '○' };
const STATUS_WORDS = { passed: 'ran and passed', failed: 'ran and failed', read: 'read from code, not run' };

/** A passport as short plain text for the terminal: the counts, then each evidence item with a mark and words. */
export function renderPassportSummary(p) {
  const s = p.summary;
  const L = [`Thunder passport (${p.subject.kind}): ${p.subject.parts.map((x) => x.name).join(', ')}`,
    `Purpose: ${p.purpose.stated ? p.purpose.text : 'not stated'}`,
    `${s.claims} claim${s.claims === 1 ? '' : 's'} with evidence (${s.passed} passed, ${s.failed} failed, ${s.readFromCode} read from code), ${s.unknowns} unknown${s.unknowns === 1 ? '' : 's'}, ${s.notVerified} not verified`, '', 'Evidence'];
  for (const e of p.evidence) L.push(`  ${MARK[e.status] ?? '○'} ${STATUS_WORDS[e.status] ?? e.status}: ${e.claim}`);
  if (!p.evidence.length) L.push('  (none: nothing in this passport is verified)');
  L.push('', 'Not verified');
  for (const x of p.unknowns.notVerified) L.push(`  ○ ${x}`);
  if (p.unknowns.untested.length) for (const x of p.unknowns.untested) L.push(`  ○ ${x.what}`);
  return L.join('\n');
}

/** The whole passport as Markdown, for a pull request or a folder. */
export function renderPassportMarkdown(p) {
  const s = p.summary;
  const L = [`# Thunder passport: ${p.subject.parts.map((x) => x.name).join(', ')}`, '',
    `A ${p.subject.kind === 'change' ? `change${p.history.base ? ` from \`${String(p.history.base).slice(0, 12)}\`` : ''}` : 'snapshot'}. **${s.claims} claims with evidence** (${s.passed} passed, ${s.failed} failed, ${s.readFromCode} read from code), **${s.unknowns} unknowns**, **${s.notVerified} not verified**. This is an evidence record, not a certificate: each claim says what it rests on and what it does not cover.`, '',
    '## Purpose', '', p.purpose.stated ? `${p.purpose.text}\n\n(Source: ${p.purpose.source}.)` : 'Not stated. Thunder never guesses what a change is for.', ''];
  const evidenceList = (list) => {
    for (const e of list) {
      L.push(`- ${MARK[e.status] ?? '○'} ${e.claim}`);
      const b = e.basis;
      L.push(`  - Basis: ${b.command ? `\`${b.command}\` in \`${b.cwd}\`, exit ${b.exitCode}, output ${String(b.outputDigest).slice(0, 19)}…` : b.from ? `${b.from} → ${b.to}` : b.base ? `review of ${String(b.base).slice(0, 12)} → ${String(b.head ?? 'working tree').slice(0, 12)}` : JSON.stringify(b)}`);
      L.push(`  - Does not cover: ${e.scope}`);
      L.push(`  - Depends on ${e.inputs.length} file${e.inputs.length === 1 ? '' : 's'} (by content hash)`);
    }
  };
  const ran = p.evidence.filter((e) => e.status === 'passed'), failedRuns = p.evidence.filter((e) => e.status === 'failed'), readOnly = p.evidence.filter((e) => e.status !== 'passed' && e.status !== 'failed');
  L.push('## Verified by running (ran and passed)', '');
  if (ran.length) evidenceList(ran); else L.push('Nothing was run, so nothing here is verified by running.');
  if (failedRuns.length) { L.push('', '## Ran and failed', ''); evidenceList(failedRuns); }
  L.push('', '## Read from code (not run)', '');
  if (readOnly.length) evidenceList(readOnly); else L.push('None.');
  L.push('', '## Not verified', '', ...p.unknowns.notVerified.map((x) => `- ${x}`), ...p.unknowns.untested.map((x) => `- ${x.what}`), '');
  L.push('## Behavior', '');
  for (const b of p.behavior) {
    L.push(`### ${b.name} (${b.part}/${b.file}, lines ${b.lines[0]}–${b.lines[1]}${b.change ? `, ${b.change}` : ''})`, '', '```text', b.text || '(no reading)', '```', '');
  }
  if (p.unknowns.notShown) L.push(p.unknowns.notShown, '');
  L.push('## Effects (detected in code, not observed)', '');
  for (const e of p.effects) L.push(`- ${e.in} **${e.kind}**: ${e.says} (${e.part}/${e.file}:${e.line})`);
  if (!p.effects.length) L.push('None detected.');
  L.push('', '## Dependencies', '', ...p.dependencies.links.map((l) => `- ${l.says} (${l.from} → ${l.to})`));
  if (p.dependencies.packages.length) L.push(...p.dependencies.packages.map((x) => `- package ${x.name}${x.version ? ` ${x.version}` : ''} (${x.from})`));
  if (p.dependencies.services.length) L.push(...p.dependencies.services.map((x) => `- calls ${x.calls} (${x.at})`));
  L.push(`- ${p.dependencies.files.length} files read, each recorded by content hash`, '');
  L.push('## Unknowns', '');
  for (const x of p.unknowns.notRead) L.push(`- not read: ${x.what} (${x.part}/${x.file}:${x.line})`);
  for (const x of p.unknowns.notLinked) L.push(`- not linked: ${x.call}: ${x.why} (${x.at})`);
  if (!p.unknowns.notRead.length && !p.unknowns.notLinked.length) L.push('Nothing Thunder failed to read or link.');
  L.push('', '## History', '', `- Base: ${p.history.base ?? '(none: a snapshot)'}`, `- Head: ${p.history.head ?? '(working tree)'}`, ...p.history.changedFiles.map((c) => `- ${c.status}: ${c.part}/${c.file}`), `- Built: ${p.history.builtAt}${p.history.thunder ? ` with Thunder ${p.history.thunder}` : ''}`, `- Fingerprint: ${p.fingerprint}`, '');
  return L.join('\n');
}
