// thunder read --level: the five reading levels in the terminal (big-picture, flow, details, text, original).
// Every level comes from readLevel() in model.mjs, the same compiler model OpenThunder's "Read in Thunder" shows, so
// the terminal never says something the picture doesn't. This file only lays it out as text. A step Thunder could
// not explain is marked, never smoothed over.
import { LEVELS } from './visual.mjs';
import { readLevel } from './model.mjs';

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const at = (file, lines) => (file ? `${file}${lines?.[0] ? `:${lines[0]}` : ''}` : '');
const lineNote = (n) => (n?.line ? `  (line ${n.line})` : '');
const list = (xs) => xs.filter(Boolean).join(', ');

/** Find an action, rule, or Thing by its label (forgiving: case, spaces, and _ do not matter) or by its id. */
/** The level closest to a mistyped one, or null. */
export function nearestLevel(word) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const best = LEVELS.map((l) => [l.id, d(String(word).toLowerCase(), l.id)]).sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= 2 ? best[0] : null;
}

export function findFocus(model, name) {
  if (!name) return { id: null };
  const want = squash(name);
  // A screen and the function or class behind it share a name: the screen is what a person means.
  const screens = model.screens ?? [];
  const pool = [...screens, ...model.members.filter((m) => m.kind !== 'setup' && !m.screen), ...model.things.filter((t) => !t.screen)];
  const exact = pool.filter((x) => x.id === name || squash(x.label) === want || squash(x.name) === want);
  if (exact.length === 1) return { id: exact[0].id };
  if (exact.length > 1) return { error: `"${name}" names ${exact.length} things: ${exact.map((x) => `${x.label} (${at(x.file, x.lines)})`).join(', ')}. Use one of their ids with --focus: ${exact.map((x) => x.id).join(', ')}.` };
  const near = pool.filter((x) => squash(x.label).includes(want)).slice(0, 5);
  return { error: `Nothing here is called "${name}".${near.length ? ` Did you mean: ${near.map((x) => `"${x.label}"`).join(', ')}?` : ''}` };
}

const MARK = { start: '▶', decision: '◆', stop: '✗', end: '■', loop: '↻', step: '•' };

/** A flow as an indented tree: questions with their yes and no branches, repeats, error handlers, and "always". */
function flowLines(flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const L = [];
  const text = (n) => {
    const unexplained = n.explained === false || n.does === 'code';
    return `${MARK[n.kind] ?? '•'} ${n.text}${unexplained ? '  [not read: shown as code]' : ''}`;
  };
  const start = flow.nodes.find((n) => n.kind === 'start');
  if (start) L.push(`  ${text(start)}`);
  const walk = (blocks, pad) => {
    for (const b of blocks || []) {
      const n = byId.get(b.id);
      if (!n) continue;
      L.push(`${pad}${text(n)}${lineNote(n)}`);
      const branch = (label, xs) => {
        if (!xs) return;
        if (!xs.length) { L.push(`${pad}    ${label} → carry on`); return; }
        L.push(`${pad}    ${label} →`);
        walk(xs, `${pad}        `);
      };
      if (b.yes || b.no) { branch('yes', b.yes); branch('no', b.no); }
      if (b.each) walk(b.each, `${pad}    `);
      if (b.body) walk(b.body, `${pad}    `);
      for (const h of b.handlers || []) { const hn = byId.get(h.id); L.push(`${pad}    ${hn ? hn.text.replace(/\?$/, '') : 'if something goes wrong'} →`); walk(h.blocks, `${pad}        `); }
      if (b.always) { L.push(`${pad}    always, at the end →`); walk(b.always.blocks, `${pad}        `); }
    }
  };
  walk(flow.blocks, '  ');
  // The end, when the tree does not already show it.
  const shown = new Set(L.join('\n').match(/■ [^\n]*/g) ?? []);
  for (const n of flow.nodes.filter((x) => x.kind === 'end' && !(flow.blocks || []).some((b) => b.id === x.id))) if (!shown.has(`■ ${n.text}`) && !L.some((l) => l.includes(`■ ${n.text}`))) L.push(`  ${text(n)}`);
  return L;
}

const whenText = (when) => (when?.length ? ` when ${when.map((w) => w.says ?? (/^if /i.test(w.question) && /^yes$/i.test(w.answer) ? w.question.replace(/^if /i, '').replace(/\?$/, '') : `${w.question.replace(/\?$/, '')}: ${w.answer}`)).join(' and ')}` : '');

/** One level as terminal text. `sources` maps a file path to its text (for the original level). */
/** A screen's outline: what it shows, as nested lines (otherwise branches included). */
function outline(items, pad, L) {
  for (const it of items) {
    L.push(`${pad}${it.notRead ? '?' : '•'} ${it.says}${it.line ? `  (line ${it.line})` : ''}`);
    if (it.kids) outline(it.kids, `${pad}    `, L);
    if (it.otherwise) { L.push(`${pad}  ${it.otherwise.says}`); outline(it.otherwise.kids, `${pad}    `, L); }
  }
  return L;
}

function renderScreen(r, next) {
  const L = [`${r.name} · ${r.title}  (${r.framework === 'react' ? 'React' : 'Angular'} screen${r.selector ? ` <${r.selector}>` : ''}, ${r.file}:${r.lines[0]})`, r.question, ''];
  const inputs = (r.inputs ?? []).map((i) => `${i.label}${i.kind ? ` (${i.kind})` : ''}`).join(', ');
  const state = (r.state ?? []).map((x) => `${x.label}${x.start ? ` (${/^(from|worked out)/.test(x.start) ? x.start : `starts as ${x.start}`})` : ''}`).join(', ');
  if (r.level === 'big-picture') {
    L.push(`It receives:  ${inputs || 'nothing'}`, `It remembers: ${state || 'nothing'}`);
    if (r.outputs?.length) L.push(`It sends:     ${r.outputs.map((o) => o.label).join(', ')}`);
    if (r.services?.length) L.push(`It uses:      ${r.services.join(', ')}`);
    if (r.uses?.length) L.push(`It shows:     ${r.uses.map((u) => u.label).join(', ')}`);
    if (r.usedBy?.length) L.push(`Shown by:     ${r.usedBy.map((u) => u.label).join(', ')}`);
    L.push(`Events: ${r.events}${r.notRead ? `   Not read: ${r.notRead}` : ''}`, '', `Next: ${next('flow')}`);
    return L.join('\n');
  }
  if (r.level === 'flow') {
    for (const e of r.early ?? []) { L.push(`  When ${e.when}, it shows only:`); outline(e.shows.length ? e.shows : [{ says: 'nothing' }], '    ', L); }
    if (r.shows.length) { L.push('  It shows:'); outline(r.shows, '    ', L); } else L.push('  It shows nothing Thunder could read.');
    L.push('', `Next: ${next('details')}`);
    return L.join('\n');
  }
  if (r.level === 'details') {
    L.push(`It receives:  ${inputs || 'nothing'}`, `It remembers: ${state || 'nothing'}`);
    if (r.events.length) { L.push('When someone acts:'); for (const e of r.events) L.push(`  • ${e.when}: ${e.runs}${e.line ? `  (line ${e.line})` : ''}`); }
    if (r.effects.length) { L.push('By itself:'); for (const e of r.effects) L.push(`  • ${e.when}: ${e.runs}${e.line ? `  (line ${e.line})` : ''}`); }
    if (r.outputs.length) L.push(`It sends: ${r.outputs.map((o) => o.label).join(', ')}`);
    if (r.notRead.length) { L.push("Can't tell from the code:"); for (const n of r.notRead) L.push(`  ? ${n.line ? `line ${n.line}: ` : ''}\`${n.code}\`: ${n.why}`); }
    L.push('', r.source);
    return L.join('\n');
  }
  if (r.level === 'text') return [...L, r.text.trimEnd()].join('\n');
  return null;
}

export function renderLevel(r, { sources = {}, file = 'file' } = {}) {
  if (r.scope === 'screen' && r.level !== 'original') return renderScreen(r, (lv) => `thunder read ${file} --level ${lv} --focus "${r.title}"`);
  const L = [`${r.name} · ${r.title}${r.file && r.scope !== 'app' ? `  (${at(r.file, r.lines)})` : ''}`, r.question, ''];
  const next = (lv, focus) => `thunder read ${file} --level ${lv}${focus ? ` --focus "${focus}"` : ''}`;

  if (r.needsFocus) {
    L.push(r.says, '');
    for (const c of r.choose.slice(0, 20)) L.push(`  ${next(r.level, c.label.replace(/\?$/, ''))}`);
    if (r.choose.length > 20) L.push(`  …and ${r.choose.length - 20} more`);
    return L.join('\n');
  }

  if (r.level === 'big-picture' && r.scope !== 'member') {
    if (r.purpose) L.push(r.purpose, '');
    for (const t of r.things) {
      L.push(`${t.label}${t.doc ? `: ${t.doc}` : ''}`);
      if (t.knows.length) L.push(`  Knows:   ${list(t.knows.map((k) => `${k.label}${k.start ? ` (${k.start})` : ''}`))}`);
      if (t.can.length) L.push(`  Can do:  ${list(t.can.map((c) => `${c.label}${c.symbol === 'rule' ? ' (rule)' : ''}`))}`);
    }
    for (const x of r.resources) L.push(`${x.label} (${x.resourceType})${x.address ? `: ${x.address}` : ''}`);
    const loose = [...r.actions.filter((a) => !r.things.some((t) => t.can.some((c) => c.id === a.id))), ...r.rules.filter((a) => !r.things.some((t) => t.can.some((c) => c.id === a.id))), ...r.loose];
    if (loose.length) L.push(`Actions and rules: ${list(loose.map((c) => `${c.label}${c.symbol === 'rule' ? ' (rule)' : ''}`))}`);
    if (r.data.length) { L.push('Data'); for (const d of r.data) L.push(`  ${d.label}: ${d.choices ? d.choices.join(' | ') : list(d.knows) || '(nothing it knows)'}`); }
    if (r.permissions?.length) L.push(`Permissions: ${r.permissions.length}`);
    if (r.screens?.length) { L.push('Screens'); for (const x of r.screens) L.push(`  ${x.label} (${x.role === 'page' ? 'page, ' : x.role === 'part' ? 'part, ' : ''}${x.framework === 'react' ? 'React' : 'Angular'}${x.selector ? ` <${x.selector}>` : ''})${x.uses.length ? `: shows ${x.uses.join(', ')}` : ''}`); }
    if (r.unknowns?.length) L.push(`Not read: ${r.unknowns.length} part${r.unknowns.length === 1 ? '' : 's'} Thunder could not explain (see --level details)`);
    const first = r.screens?.[0] ? { label: r.screens[0].label } : r.things[0]?.can[0] ?? loose[0];
    if (first) L.push('', `Next: ${next('flow', first.label.replace(/\?$/, ''))}`);
    return L.join('\n').trimEnd();
  }

  if (r.level === 'big-picture') {
    if (r.doc) L.push(r.doc, '');
    if (r.owner) L.push(`Part of:      ${r.owner.label}`);
    if (r.route) L.push(`Reached at:   ${r.route.method ?? ''} ${r.route.path ?? ''}`.trimEnd());
    L.push(`You give it:  ${list((r.youGive || []).map((g) => g.label ?? g)) || 'nothing'}`);
    if (r.youGetBack) L.push(`You get back: ${typeof r.youGetBack === 'string' ? r.youGetBack : r.youGetBack.label ?? JSON.stringify(r.youGetBack)}`);
    if (r.uses?.length) L.push(`Uses:         ${list(r.uses.map((u) => u.label))}`);
    if (r.usedBy?.length) L.push(`Used by:      ${list(r.usedBy.map((u) => u.label))}`);
    L.push('', `Next: ${next('flow', r.title.replace(/\?$/, ''))}`);
    return L.join('\n');
  }

  if (r.level === 'flow') {
    L.push(...flowLines(r.flow));
    L.push('', `Next: ${next('details', r.title.replace(/\?$/, ''))}`);
    return L.join('\n');
  }

  if (r.level === 'details') {
    L.push(`You give it:  ${list((r.inputs || []).map((i) => `${i.label}${i.kind ? ` (${i.kind})` : ''}`)) || 'nothing'}`);
    // A rule's answers say it best ("Small fee when the days late is at most 7"); otherwise what it gives back.
    if (r.answers?.length) { L.push('Answers:'); for (const x of r.answers) L.push(`  ■ ${x.answer ?? x.value ?? x.text}${x.when && x.when !== 'otherwise' ? ` when ${x.when}` : x.when === 'otherwise' ? ' otherwise' : ''}`); }
    else if (r.givesBack?.length) { L.push('Gives back:'); for (const g of r.givesBack) L.push(`  ■ ${g.text ?? g.value ?? g.label}${whenText(g.when)}${lineNote(g)}`); }
    if (r.stops?.length) { L.push('Stops:'); for (const s of r.stops) L.push(`  ✗ ${s.error}${s.message ? ` "${s.message}"` : ''}${whenText(s.when)}${lineNote(s)}`); }
    if (r.changes?.length) { L.push('Changes:'); for (const c of r.changes) L.push(`  • ${c.text}${whenText(c.when)}${lineNote(c)}`); }
    if (r.reliesOn?.length) L.push(`Relies on:    ${list(r.reliesOn.map((x) => x.label ?? x.text ?? x))}`);
    const open = [...(r.openQuestions || []).map((q) => q.text ?? q.says ?? q), ...(r.notLinked || []).map((x) => `${x.call ?? x.import ?? 'a call'}: ${x.why}`)];
    if (r.notExplained) open.unshift(`${r.notExplained} step${r.notExplained === 1 ? '' : 's'} not read (shown as code; see --level original)`);
    if (open.length) { L.push("Can't tell from the code:"); for (const q of open) L.push(`  ? ${q}`); }
    L.push('', r.source);
    return L.join('\n');
  }

  if (r.level === 'text') return [...L, r.text.trimEnd()].join('\n');

  // original: the exact lines Thunder read.
  const src = sources[r.file];
  if (!src) return [...L, `(The text of ${r.file ?? 'this file'} is not available.)`].join('\n');
  const all = src.split('\n');
  const [a, b] = r.lines ?? [1, all.length];
  const width = String(b).length;
  for (let i = a; i <= Math.min(b, all.length); i++) L.push(`${String(i).padStart(width)} │ ${all[i - 1]}`);
  return L.join('\n');
}

export { LEVELS, readLevel };
