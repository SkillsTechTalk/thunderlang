// Words for the commands, expressions, and schedules that infrastructure and delivery files are made of, shared by
// the Dockerfile and GitHub Actions readers: `npm ci` -> "Installs what it needs (npm ci)", `${{ secrets.NPM_TOKEN }}`
// -> "the secret NPM_TOKEN", `0 2 * * *` -> "every day at 02:00 UTC". Unknown commands are kept ("Runs `x`"), never
// dropped; a secret is only ever named. Walks text character by character: no regex here can backtrack.

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const lc = (s) => (s && !/^[A-Z]{2}|^[A-Z][a-z]*[A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
export const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs.at(-1)}`);
export const orWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} or ${xs.at(-1)}`);
const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Names that hold secrets: passwords, tokens, keys, credentials. */
export const SECRET_NAME = /(pass(word|wd)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential|auth|pwd)(?![a-z])/i;

// ── GitHub Actions expressions: ${{ … }} ───────────────────────────────────────────────────────────────────

const GITHUB_WORDS = {
  'github.ref': 'the branch or tag', 'github.ref_name': 'the branch or tag name', 'github.head_ref': "the pull request's branch",
  'github.base_ref': 'the branch it will be merged into', 'github.event_name': 'the event that started it', 'github.actor': 'the person who started it',
  'github.triggering_actor': 'the person who started it', 'github.repository': 'the repository', 'github.repository_owner': "the repository's owner",
  'github.sha': 'the commit', 'github.run_id': 'the run', 'github.run_number': 'the run number', 'github.run_attempt': 'the attempt number',
  'github.workspace': 'the working folder', 'github.token': "the workflow's own token", 'github.server_url': 'the GitHub address', 'github.job': 'the job',
  'github.workflow': 'the workflow', 'github.ref_type': 'whether it is a branch or a tag', 'github.event.pull_request.head.sha': "the pull request's latest commit",
  'github.event.pull_request.head.ref': "the pull request's branch", 'github.event.pull_request.number': 'the pull request number',
  'github.event.pull_request.draft': 'whether the pull request is a draft', 'github.event.pull_request.merged': 'whether the pull request was merged',
  'github.event.release.tag_name': "the release's tag", 'github.event.action': 'what happened', 'runner.os': "the computer's system",
  'runner.temp': 'the temporary folder', 'runner.arch': "the computer's processor type", 'job.status': 'how the job is going',
};
const EVENT_WORDS = { push: 'a push', pull_request: 'a pull request', pull_request_target: 'a pull request', workflow_dispatch: 'someone starting it by hand', schedule: 'the schedule', release: 'a release', workflow_call: 'another workflow', workflow_run: 'another workflow finishing', merge_group: 'the merge queue', issues: 'an issue', issue_comment: 'a comment', repository_dispatch: 'another system' };

/** A context value (`steps.check.outputs.version`) in words. Secrets are named, never shown. */
export function valueWords(path) {
  const p = String(path).trim();
  if (GITHUB_WORDS[p]) return GITHUB_WORDS[p];
  let m;
  if ((m = /^secrets\.([\w-]+)$/.exec(p))) return `the secret ${m[1]}`;
  if ((m = /^vars\.([\w-]+)$/.exec(p))) return `the variable ${m[1]}`;
  if ((m = /^env\.([\w-]+)$/.exec(p))) return m[1];
  if ((m = /^(?:github\.event\.)?inputs\.([\w-]+)$/.exec(p))) return `the ${m[1].replace(/[_-]+/g, ' ')} given when it starts`;
  if ((m = /^matrix\.([\w-]+)$/.exec(p))) return `the ${m[1].replace(/[_-]+/g, ' ')} for this run`;
  if ((m = /^steps\.([\w-]+)\.outputs\.([\w-]+)$/.exec(p))) return `the ${m[1].replace(/[_-]+/g, ' ')} step's ${m[2].replace(/[_-]+/g, ' ')}`;
  if ((m = /^steps\.([\w-]+)\.(outcome|conclusion)$/.exec(p))) return `how the ${m[1].replace(/[_-]+/g, ' ')} step went`;
  if ((m = /^needs\.([\w-]+)\.outputs\.([\w-]+)$/.exec(p))) return `the ${m[1].replace(/[_-]+/g, ' ')} job's ${m[2].replace(/[_-]+/g, ' ')}`;
  if ((m = /^needs\.([\w-]+)\.result$/.exec(p))) return `how the ${m[1].replace(/[_-]+/g, ' ')} job went`;
  if ((m = /^github\.event\.([\w.]+)$/.exec(p))) return `the event's ${m[1].split('.').join(' ').replace(/[_-]+/g, ' ')}`;
  return null;
}

/** The secrets an expression or text names: `${{ secrets.NPM_TOKEN }}` -> ['NPM_TOKEN']. */
export function secretsIn(text) {
  const out = [];
  const s = String(text ?? '');
  for (let i = s.indexOf('secrets.'); i >= 0; i = s.indexOf('secrets.', i + 8)) {
    if (i > 0 && /[\w.]/.test(s[i - 1])) continue;
    let j = i + 8;
    while (j < s.length && /[\w-]/.test(s[j])) j++;
    const name = s.slice(i + 8, j);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Each `${{ … }}` in a text, with where it starts and ends. */
export function expressionsIn(text) {
  const out = [];
  const s = String(text ?? '');
  for (let i = s.indexOf('${{'); i >= 0; i = s.indexOf('${{', i + 3)) {
    const end = s.indexOf('}}', i + 3);
    if (end < 0) break;
    out.push({ at: i, end: end + 2, expr: s.slice(i + 3, end).trim() });
    i = end;
  }
  return out;
}
export const hasExpression = (text) => String(text ?? '').includes('${{');

/** A text with each `${{ … }}` in words: a secret by name, anything else "(worked out when it runs)". */
export function sayExpressions(text) {
  const s = String(text ?? '');
  const xs = expressionsIn(s);
  if (!xs.length) return s;
  let out = '', last = 0;
  for (const x of xs) {
    const secret = /^secrets\.[\w-]+$/.exec(x.expr);
    out += s.slice(last, x.at) + (secret ? `‹${valueWords(x.expr)}›` : '(worked out when it runs)');
    last = x.end;
  }
  return out + s.slice(last);
}

// A tiny expression reader for `if:` conditions: ||, &&, !, ==, !=, <, >, calls, literals, context paths, ( ).
function exprTokens(src) {
  const toks = [];
  const s = String(src);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    const two = s.slice(i, i + 2);
    if (['||', '&&', '==', '!=', '<=', '>='].includes(two)) { toks.push({ op: two }); i += 2; continue; }
    if ('!()<>,'.includes(c)) { toks.push({ op: c }); i++; continue; }
    if (c === "'") { let j = i + 1, v = ''; while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") { v += "'"; j += 2; continue; } if (s[j] === "'") break; v += s[j++]; } toks.push({ str: v }); i = j + 1; continue; }
    let j = i;
    while (j < s.length && /[\w.\-*[\]]/.test(s[j])) j++;
    if (j === i) return null; // something this reader does not know
    toks.push({ word: s.slice(i, j) });
    i = j;
  }
  return toks;
}
function exprTree(src) {
  const t = exprTokens(src);
  if (!t) return null;
  let i = 0;
  const peek = (op) => t[i]?.op === op;
  const or = () => { let l = and(); while (l && peek('||')) { i++; const r = and(); l = r && { or: [l, r] }; } return l; };
  const and = () => { let l = not(); while (l && peek('&&')) { i++; const r = not(); l = r && { and: [l, r] }; } return l; };
  const not = () => { if (peek('!')) { i++; const x = not(); return x && { not: x }; } return cmp(); };
  const cmp = () => { const l = prim(); if (l && ['==', '!=', '<', '>', '<=', '>='].includes(t[i]?.op)) { const op = t[i++].op; const r = prim(); return r && { cmp: op, l, r }; } return l; };
  const prim = () => {
    const x = t[i];
    if (!x) return null;
    if (x.op === '(') { i++; const e = or(); if (!peek(')')) return null; i++; return e; }
    if (x.str != null) { i++; return { lit: x.str }; }
    if (x.word) {
      i++;
      if (peek('(')) {
        i++;
        const args = [];
        while (!peek(')')) { const a = or(); if (!a) return null; args.push(a); if (peek(',')) i++; else if (!peek(')')) return null; }
        i++;
        return { call: x.word, args };
      }
      if (/^(true|false|null)$/.test(x.word)) return { lit: x.word === 'null' ? '' : x.word };
      if (/^-?\d+(\.\d+)?$/.test(x.word)) return { lit: x.word };
      return { path: x.word };
    }
    return null;
  };
  const e = or();
  return e && i === t.length ? e : null;
}
const valueOf = (n) => (n.lit != null ? (n.lit === '' ? 'empty' : n.lit) : n.path ? (valueWords(n.path) ?? n.path) : n.call ? callWords(n) : 'a value worked out when it runs');
function callWords(n) {
  const a = n.args.map(valueOf);
  switch (n.call.toLowerCase()) {
    case 'hashfiles': return `a fingerprint of ${listWords(n.args.map((x) => x.lit ?? valueOf(x)))}`;
    case 'format': return 'a text made from several values';
    case 'fromjson': case 'tojson': return a[0] ?? 'a value';
    case 'join': return `${a[0]}, joined`;
    default: return `the result of ${n.call}`;
  }
}

/** One condition as a clause: "the branch is main", "an earlier step failed". */
function clause(n, negate = false) {
  if (n.not) return clause(n.not, !negate);
  if (n.and || n.or) {
    const parts = (n.and ?? n.or).map((x) => clause(x, false));
    const joined = parts.join(n.and ? ' and ' : ' or ');
    return negate ? `not (${joined})` : joined;
  }
  if (n.cmp) {
    const l = n.l, r = n.r;
    const path = l.path ?? r.path, lit = l.path ? r.lit : l.lit;
    const isNot = (n.cmp === '!=') !== negate;
    if (['<', '>', '<=', '>='].includes(n.cmp)) {
      const words = { '<': 'less than', '>': 'more than', '<=': 'at most', '>=': 'at least' }[n.cmp];
      return `${valueOf(l)} is ${negate ? 'not ' : ''}${words} ${valueOf(r)}`;
    }
    if (path === 'github.ref' && lit != null) {
      if (lit.startsWith('refs/heads/')) return `the branch is ${isNot ? 'not ' : ''}${lit.slice(11)}`;
      if (lit.startsWith('refs/tags/')) return `the tag is ${isNot ? 'not ' : ''}${lit.slice(10)}`;
    }
    if (path === 'github.event_name' && lit != null) return `it was ${isNot ? 'not ' : ''}started by ${EVENT_WORDS[lit] ?? `the ${lit.replace(/_/g, ' ')} event`}`;
    if (lit === 'true' || lit === 'false') {
      const v = valueOf(l.path ? l : r);
      const yes = (lit === 'true') !== isNot;
      // "whether the pull request is a draft" == false -> "the pull request is not a draft".
      const w = /^whether (.+?) (is|was) (.+)$/.exec(v);
      if (w) return `${w[1]} ${w[2]} ${yes ? '' : 'not '}${w[3]}`;
      return `${v} is ${yes ? 'true' : 'false'}`;
    }
    return `${valueOf(l)} is ${isNot ? 'not ' : ''}${valueOf(r)}`;
  }
  if (n.call) {
    const name = n.call.toLowerCase();
    const a = n.args.map(valueOf);
    if (name === 'success') return negate ? 'an earlier step failed' : 'every earlier step worked';
    if (name === 'failure') return negate ? 'every earlier step worked' : 'an earlier step failed';
    if (name === 'cancelled') return negate ? 'the run was not cancelled' : 'the run was cancelled';
    if (name === 'always') return negate ? 'never' : 'always';
    if (name === 'contains') return `${a[0]} ${negate ? 'does not contain' : 'contains'} ${a[1]}`;
    if (name === 'startswith') {
      if (n.args[0].path === 'github.ref' && n.args[1].lit === 'refs/tags/') return negate ? 'it is not a tag' : 'it is a tag';
      return `${a[0]} ${negate ? 'does not start' : 'starts'} with ${a[1]}`;
    }
    if (name === 'endswith') return `${a[0]} ${negate ? 'does not end' : 'ends'} with ${a[1]}`;
    return `${callWords(n)} is ${negate ? 'not ' : ''}true`;
  }
  return `${valueOf(n)} is ${negate ? 'not ' : ''}set`;
}

/**
 * An `if:` condition as a question a person can answer with Yes or No. `always: true` means it runs even after a
 * failure (not a question at all); `known: false` means Thunder could not read it, and the question quotes the code.
 */
export function conditionQuestion(raw) {
  const src = String(raw).trim().replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  const tree = exprTree(src);
  if (!tree) return { question: `Is \`${short(src, 60)}\` true?`, known: false };
  if (tree.call && /^always$/i.test(tree.call)) return { always: true, known: true };
  // `always() && x`, `!cancelled() && x`: runs even after a failure, when x.
  const parts = tree.and ? flatAnd(tree) : [tree];
  const always = parts.some((p) => (p.call && /^always$/i.test(p.call)) || (p.not?.call && /^cancelled$/i.test(p.not.call)));
  const rest = parts.filter((p) => !(p.call && /^always$/i.test(p.call)) && !(p.not?.call && /^cancelled$/i.test(p.not.call)) && !(p.call && /^success$/i.test(p.call)));
  if (!rest.length) return always ? { always: true, known: true } : { question: 'Did every earlier step work?', known: true };
  // Each part asked on its own, then joined: "Is the branch main, and was it started by a push?"
  const ask = (p) => (p.or ? flatOr(p).map((x) => ask(x)).map((q, k) => (k ? lc(q) : q)).join(', or ') : questionOf(clause(p)).replace(/\?$/, ''));
  const qs = rest.map(ask);
  const question = `${qs.map((q, k) => (k ? lc(q) : q)).join(', and ')}?`;
  return { question, known: true, ...(always ? { evenAfterFailure: true } : {}) };
}
const flatAnd = (n) => (n.and ? n.and.flatMap(flatAnd) : [n]);
const flatOr = (n) => (n.or ? n.or.flatMap(flatOr) : [n]);
function questionOf(text) {
  let m;
  if ((m = /^(.+?) is (not )?(.+)$/.exec(text))) return `Is ${m[1]} ${m[2] ?? ''}${m[3]}?`;
  if ((m = /^(an earlier step|every earlier step) (failed|worked)$/.exec(text))) return `Did ${m[1]} ${m[2] === 'failed' ? 'fail' : 'work'}?`;
  if ((m = /^the run was (not )?cancelled$/.exec(text))) return `Was the run ${m[1] ?? ''}cancelled?`;
  if ((m = /^it was (not )?started by (.+)$/.exec(text))) return `Was it ${m[1] ?? ''}started by ${m[2]}?`;
  if ((m = /^(.+?) (contains|starts with|ends with|does not contain) (.+)$/.exec(text)) && !/ (and|or) /.test(text)) return `Does ${m[1]} ${m[2] === 'contains' ? 'contain' : m[2] === 'starts with' ? 'start with' : m[2] === 'ends with' ? 'end with' : 'not contain'} ${m[3]}?`;
  if ((m = /^it is (not )?a tag$/.exec(text))) return `Is it ${m[1] ?? ''}a tag?`;
  return `${cap(text)}?`;
}

// ── Schedules: cron in words ─────────────────────────────────────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const dayOf = (d) => (/^\d$/.test(d) ? DAYS[Number(d) % 7] : DAY_ABBR[d.toLowerCase().slice(0, 3)] != null ? DAYS[DAY_ABBR[d.toLowerCase().slice(0, 3)]] : null);
const num = (x) => /^\d{1,2}$/.test(x);
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** A cron schedule in words ("every day at 02:00 UTC"), or null when it is not a simple one. GitHub runs cron in UTC. */
export function cronWords(cron) {
  const f = String(cron).trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [mi, h, dom, mon, dow] = f;
  if (mon !== '*') return null;
  if (num(mi) && num(h)) {
    const at = `at ${hhmm(h, mi)} UTC`;
    if (dom === '*' && dow === '*') return `every day ${at}`;
    if (dom === '*') {
      if (dow === '1-5') return `every weekday (Monday to Friday) ${at}`;
      if (dow === '0,6' || dow === '6,0') return `every Saturday and Sunday ${at}`;
      const days = dow.split(',').map(dayOf);
      if (days.every(Boolean)) return `every ${listWords(days)} ${at}`;
      return null;
    }
    if (dow === '*' && num(dom)) return `on day ${Number(dom)} of every month ${at}`;
    return null;
  }
  if (dom !== '*' || dow !== '*') return null;
  if (num(mi) && h === '*') return `every hour, at ${Number(mi)} minutes past`;
  let m;
  if ((m = /^\*\/(\d+)$/.exec(mi)) && h === '*') return `every ${m[1]} minutes`;
  if (num(mi) && (m = /^\*\/(\d+)$/.exec(h))) return `every ${m[1]} hours, at ${Number(mi)} minutes past`;
  return null;
}

// ── Shell commands in words ──────────────────────────────────────────────────────────────────────────────

/** Split a shell line into words, keeping quotes, $( ), ${ }, and ${{ }} together. */
export function shellWords(line) {
  const out = [];
  let cur = '', i = 0, has = false;
  const s = String(line);
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { if (has) { out.push(cur); cur = ''; has = false; } i++; continue; }
    has = true;
    if (c === '\\' && i + 1 < s.length) { cur += s[i + 1]; i += 2; continue; }
    if (c === "'") { const e = s.indexOf("'", i + 1); const end = e < 0 ? s.length : e; cur += s.slice(i + 1, end); i = end + 1; continue; }
    if (c === '"') { let j = i + 1; while (j < s.length && s[j] !== '"') { if (s[j] === '\\') j++; j++; } cur += s.slice(i + 1, j).replace(/\\(["\\$`])/g, '$1'); i = j + 1; continue; }
    if (c === '$' && (s[i + 1] === '(' || s[i + 1] === '{')) { const close = s[i + 1] === '(' ? ')' : '}'; const open = s[i + 1]; let d = 0, j = i + 1; for (; j < s.length; j++) { if (s[j] === open) d++; else if (s[j] === close && --d === 0) break; } cur += s.slice(i, j + 1); i = j + 1; continue; }
    cur += c; i++;
  }
  if (has) out.push(cur);
  return out;
}

/** Split at top-level `&&`, `||`, `;`, and `|`, outside quotes and $( ). Returns [{ text, op }] where op joins it to the next. */
export function splitCommands(line) {
  const out = [];
  const s = String(line);
  let start = 0, q = null, d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '$' && (s[i + 1] === '(' || s[i + 1] === '{')) { d++; i++; continue; }
    if (d && (c === ')' || c === '}')) { d--; continue; }
    if (d) continue;
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) { out.push({ text: s.slice(start, i).trim(), op: null }); return out.filter((x) => x.text); }
    const two = s.slice(i, i + 2);
    if (two === '&&' || two === '||') { out.push({ text: s.slice(start, i).trim(), op: two }); start = i + 2; i++; continue; }
    if (c === ';' && s[i + 1] !== ';') { out.push({ text: s.slice(start, i).trim(), op: ';' }); start = i + 1; continue; }
    if (c === '|' && s[i - 1] !== '>' ) { out.push({ text: s.slice(start, i).trim(), op: '|' }); start = i + 1; continue; }
    if (c === '&' && s[i + 1] !== '>' && s[i - 1] !== '>' && s[i - 1] !== '&') { out.push({ text: s.slice(start, i).trim(), op: '&' }); start = i + 1; continue; }
  }
  out.push({ text: s.slice(start).trim(), op: null });
  return out.filter((x) => x.text);
}

const pkgList = (args) => args.filter((a) => !a.startsWith('-') && !/^[A-Z_]+=/.test(a));
const firstArg = (args) => pkgList(args)[0];
const installs = (pkgs, how) => (pkgs.length ? `Installs ${listWords(pkgs.map((p) => p.replace(/=.*$/, '')))}` : `Installs what it needs (${how})`);
const hostOf = (url) => { const m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(url); return m ? m[1] : url; };
const scriptName = (w) => w.replace(/^\.\//, '');

const JS_TOOLS = {
  vsce: (a) => (a.includes('publish') ? 'Publishes the extension to the VS Code Marketplace' : a.includes('package') ? 'Packages the extension' : a.includes('show') ? 'Looks up the extension on the VS Code Marketplace' : null),
  tsc: () => 'Checks the types (tsc)', eslint: () => 'Checks the code style (eslint)', prettier: (a) => (a.includes('--check') ? 'Checks the formatting (prettier)' : 'Formats the code (prettier)'),
  jest: () => 'Runs the tests', vitest: () => 'Runs the tests', mocha: () => 'Runs the tests', playwright: (a) => (a.includes('install') ? 'Installs the test browsers' : 'Runs the browser tests'),
  next: (a) => (a.includes('build') ? 'Builds it' : null), vercel: (a) => (a.some((x) => x === 'deploy' || x === '--prod') || !a.length ? 'Deploys to Vercel' : null),
  'semantic-release': () => 'Works out the next version and releases it', changeset: (a) => (a.includes('publish') ? 'Publishes the changed packages' : null),
};

function npmLike(tool, all) {
  // Options that only say where to run (`--prefix compiler`, `-C web`, `--workspace x`) do not change what it does.
  const args = [];
  for (let i = 0; i < all.length; i++) { if (/^(--prefix|-C|--dir|--cwd|--workspace|-w|--filter|-F)$/.test(all[i])) { i++; continue; } if (/^(--prefix|--dir|--cwd|--workspace|--filter)=/.test(all[i]) || all[i] === '--silent' || all[i] === '-s') continue; args.push(all[i]); }
  const [sub, ...rest] = args;
  const run = sub === 'run' || sub === 'run-script' ? rest[0] : null;
  const script = run ?? (tool !== 'npm' && sub && !['install', 'i', 'ci', 'add', 'publish', 'test', 't', 'view', 'info', 'version', 'exec', 'dlx', 'link', 'audit', 'remove', 'uninstall'].includes(sub) && !sub.startsWith('-') ? sub : null);
  if (!sub || (tool !== 'npm' && sub === 'install' && !pkgList(rest).length)) return `Installs what it needs (${tool}${sub ? ` ${sub}` : ''})`;
  if (sub === 'ci') return `Installs what it needs (${tool} ci)`;
  if (sub === 'install' || sub === 'i' || sub === 'add') {
    const pkgs = pkgList(rest).filter((p) => !p.startsWith('$')).map((p) => p.replace(/@\$\(.*$|@\$\{.*$/, ''));
    if (!pkgs.length) return `Installs what it needs (${tool} ${sub})`;
    return `${installs(pkgs)}${rest.includes('-g') || rest.includes('--global') ? ' for the whole computer' : ''}`;
  }
  if (sub === 'test' || sub === 't' || script === 'test') return 'Runs the tests';
  if (script === 'build') return 'Builds it';
  if (script === 'lint') return `Checks the code style (${tool} ${run ? 'run ' : ''}lint)`;
  if (script === 'typecheck' || script === 'type-check' || script === 'types') return `Checks the types (${tool} ${run ? 'run ' : ''}${script})`;
  if (script) return `Runs the ${script} script`;
  if (sub === 'publish') return 'Publishes the package to npm';
  if (sub === 'view' || sub === 'info') return `Looks up ${firstArg(rest) ?? 'a package'} on npm`;
  if (sub === 'version') return "Changes the package's version";
  if (sub === 'prune') return 'Removes packages it no longer needs (npm prune)';
  if (sub === 'audit') return 'Checks what it uses for known security problems';
  if (sub === 'exec' || sub === 'dlx') return commandSays(rest.join(' ')).says;
  return null;
}

/**
 * One shell command in words. Returns { says, kind } where kind is 'call', 'set', 'fail', or 'return'. Anything it
 * does not know reads "Runs `<command>`", so nothing is dropped.
 */
export function commandSays(cmd) {
  let text = String(cmd).trim();
  let tail = '';
  // `name=$(…)` and `name=value`: a value worked out or set, for later commands.
  let m;
  if ((m = /^(?:export\s+|local\s+|readonly\s+)?([A-Za-z_]\w*)=(.*)$/.exec(text)) && shellWords(m[2]).length <= 1) {
    const v = m[2];
    if (/^\$\([\s\S]*\)$/.test(v) || /^"\$\([\s\S]*\)"$/.test(v)) {
      const inner = v.replace(/^"|"$/g, '').slice(2, -1);
      const iw = shellWords(inner);
      if ((iw[0] === 'echo' || iw[0] === 'printf') && !/[|]/.test(inner)) return { kind: 'set', says: `Works out ${m[1]}: the text "${short(iw.slice(1).filter((a) => !/^-[neE]+$/.test(a)).join(' '), 60)}"` };
      return { kind: 'set', says: `Works out ${m[1]}: ${lc(commandSays(inner).says)}` };
    }
    if (SECRET_NAME.test(m[1]) && v && !/\$/.test(v)) return { kind: 'set', says: `Sets ${m[1]} (its value is written here, not shown)` };
    return { kind: 'set', says: `Sets ${m[1]} to ${v.replace(/^["']|["']$/g, '') || 'nothing'}` };
  }
  let words = shellWords(text);
  // Leading settings for one command (`CI=true npm test`) and `sudo` do not change what it does.
  while (words.length > 1 && (/^[A-Za-z_]\w*=/.test(words[0]) || words[0] === 'sudo' || words[0] === 'time' || words[0] === 'exec' || words[0] === 'command')) words.shift();
  // Redirections: GitHub's special files mean "for later steps"; other files say where the output goes.
  const redir = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const r = /^(\d?>>?|&>|<)(.*)$/.exec(w);
    if (!r || w === '>' && false) continue;
    const target = r[2] || words[i + 1] || '';
    redir.push({ op: r[1], target });
    words.splice(i, r[2] ? 1 : 2); i--;
  }
  for (const r of redir) {
    const t = r.target.replace(/^["']|["']$/g, '');
    if (/GITHUB_OUTPUT/.test(t)) tail = 'output';
    else if (/GITHUB_ENV/.test(t)) tail = 'env';
    else if (/GITHUB_PATH/.test(t)) tail = 'path';
    else if (/GITHUB_STEP_SUMMARY/.test(t)) tail = 'summary';
    else if (r.op.includes('>') && !/^\/dev\/(null|stderr|stdout)$|^&\d$/.test(t) && t) tail = tail || `file:${t}`;
  }
  let [tool0, ...args] = words; // eslint-disable-line prefer-const
  if (tool0 === '[' || tool0 === '[[' || tool0 === 'test') return { kind: 'check', says: `Checks: ${lc(shellQuestion(text))}` };
  if (!tool0) return { kind: 'call', says: `Runs \`${short(text)}\`` };
  const tool = tool0.replace(/^.*\//, '');
  const said = (s) => ({ kind: 'call', says: s });
  const echoText = () => args.filter((a) => !/^-[neE]+$/.test(a)).join(' ');
  if (tool === 'echo' || tool === 'printf') {
    const t = echoText();
    if (tail === 'output') { const k = /^([\w-]+)=/.exec(t); return said(k ? `Saves ${k[1]} for later steps` : 'Saves a value for later steps'); }
    if (tail === 'env') { const k = /^([\w-]+)=/.exec(t); return said(k ? `Sets ${k[1]} for later steps` : 'Sets a value for later steps'); }
    if (tail === 'path') return said(`Adds ${t} to the programs later steps can run`);
    if (tail === 'summary') return said("Adds a line to the run's summary");
    let w;
    if ((w = /^::(notice|warning|error)(?:\s[^:]*)?::(.*)$/.exec(t))) return said(`Writes ${w[1] === 'notice' ? 'a note' : w[1] === 'warning' ? 'a warning' : 'an error'} in the log: "${w[2]}"`);
    if (/^::add-mask::/.test(t)) return said('Hides a value in the log');
    if (/^::(end)?group::/.test(t)) return said(t.startsWith('::group') ? 'Starts a group of log lines' : 'Ends a group of log lines');
    if (tail.startsWith('file:')) return said(`Writes "${short(t, 60)}" to ${tail.slice(5)}`);
    return said(`Writes a log line: "${short(t, 70)}"`);
  }
  const fileTail = tail.startsWith('file:') ? ` and writes the output to ${tail.slice(5)}` : '';
  const out = (s) => (s ? said(`${s}${fileTail}`) : null);
  const sub = args[0];
  const r = (() => {
    switch (tool) {
      case 'npm': case 'yarn': case 'pnpm': case 'bun': return npmLike(tool, args);
      case 'npx': case 'bunx': { const rest = args.filter((a) => a !== '--yes' && a !== '-y' && !a.startsWith('--package')); const name = (rest[0] ?? '').replace(/^(@[^/]+\/)?([^@]+).*$/, '$2'); const known = JS_TOOLS[name]?.(rest.slice(1)); return known ?? (name ? `Runs ${name}` : null); }
      case 'node': {
        if (args[0] === '-p' || args[0] === '-e' || args[0] === '--eval' || args[0] === '--print') {
          const code = args[1] ?? '';
          const v = /require\(['"]\.?\/?([\w./-]*package\.json)['"]\)\.(\w+)/.exec(code);
          return v ? `Reads the ${v[2]} from ${v[1].replace(/^\.\//, '')}` : 'Runs a small Node script';
        }
        return args[0] ? `Runs ${scriptName(args.find((a) => !a.startsWith('-')) ?? args[0])}` : null;
      }
      case 'pip': case 'pip3': return pipWords(args);
      case 'python': case 'python3': case 'py': {
        if (args[0] === '-m') { const mod = args[1]; if (mod === 'pip') return pipWords(args.slice(2)); if (mod === 'pytest' || mod === 'unittest') return 'Runs the tests'; if (mod === 'build') return 'Builds the package'; if (mod === 'venv') return 'Makes a separate place for its Python packages'; return `Runs the Python module ${mod}`; }
        if (args[0] === '-c') return 'Runs a small Python script';
        return args[0] ? `Runs ${scriptName(args[0])}` : null;
      }
      case 'pytest': case 'rspec': case 'phpunit': case 'jest': case 'vitest': case 'mocha': return 'Runs the tests';
      case 'tox': case 'nox': return `Runs the tests in several environments (${tool})`;
      case 'twine': return sub === 'upload' ? 'Publishes the package to PyPI' : null;
      case 'poetry': case 'uv': case 'pipenv': case 'pdm': case 'hatch':
        if (sub === 'install' || sub === 'sync') return `Installs what it needs (${tool} ${sub})`;
        if (sub === 'pip') return pipWords(args.slice(2));
        if (sub === 'build') return 'Builds the package';
        if (sub === 'publish') return 'Publishes the package to PyPI';
        if (sub === 'run') return commandSays(args.slice(1).join(' ')).says;
        return null;
      case 'apt-get': case 'apt': case 'yum': case 'dnf': case 'microdnf': case 'zypper': case 'brew': case 'choco': case 'winget': {
        const at = args.findIndex((a) => !a.startsWith('-'));
        const sub = args[at];
        args = args.slice(at);
        if (sub === 'install') return installs(pkgList(args.slice(1)), `${tool} install`);
        if (sub === 'update' && tool !== 'brew') return 'Updates the list of packages it can install';
        if (sub === 'upgrade' || (sub === 'update' && tool === 'brew')) return 'Updates the installed packages';
        if (sub === 'clean' || sub === 'autoremove') return 'Cleans up after installing';
        if (sub === 'remove' || sub === 'purge') return `Removes ${listWords(pkgList(args.slice(1)))}`;
        return null;
      }
      case 'apk':
        if (sub === 'add') return installs(pkgList(args.slice(1)), 'apk add');
        if (sub === 'update') return 'Updates the list of packages it can install';
        if (sub === 'del') return `Removes ${listWords(pkgList(args.slice(1)))}`;
        return null;
      case 'go':
        return { build: 'Builds it', test: 'Runs the tests', vet: 'Checks the code (go vet)', generate: 'Makes generated code (go generate)' }[sub]
          ?? (sub === 'mod' && args[1] === 'download' ? 'Downloads what it needs' : sub === 'mod' && args[1] === 'tidy' ? 'Tidies the list of what it needs' : sub === 'run' ? `Runs ${args[1] ?? 'the program'}` : sub === 'install' ? `Installs ${args[1] ?? 'the program'}` : null);
      case 'cargo':
        return { build: 'Builds it', test: 'Runs the tests', clippy: 'Checks the code (cargo clippy)', publish: 'Publishes the package to crates.io', run: 'Runs the program', check: 'Checks that it compiles' }[sub] ?? (sub === 'fmt' ? (args.includes('--check') ? 'Checks the formatting' : 'Formats the code') : sub === 'install' ? `Installs ${args[1] ?? 'a program'}` : null);
      case 'dotnet':
        if (sub === 'nuget' && args[1] === 'push') return 'Publishes the package to NuGet';
        return { restore: 'Installs what it needs (dotnet restore)', build: 'Builds it', test: 'Runs the tests', publish: 'Packages it for release (dotnet publish)', pack: 'Packages it (dotnet pack)', run: 'Runs the program', format: 'Checks the formatting (dotnet format)' }[sub] ?? null;
      case 'mvn': case 'mvnw': case 'gradle': case 'gradlew': {
        const goals = args.filter((a) => !a.startsWith('-'));
        if (goals.includes('deploy') || goals.includes('publish')) return `Publishes it (${tool} ${goals.join(' ')})`;
        if (goals.some((g) => /^(test|check|verify)$/.test(g))) return goals.some((g) => /^(package|build|install|assemble)$/.test(g)) ? 'Builds it and runs the tests' : 'Runs the tests';
        if (goals.some((g) => /^(package|build|install|assemble|compile|bootJar|jar)$/.test(g))) return 'Builds it';
        return goals.length ? `Runs ${tool} ${goals.join(' ')}` : null;
      }
      case 'make': { const target = args.find((a) => !a.startsWith('-') && !a.includes('=')); return target ? (target === 'test' || target === 'check' ? 'Runs the tests (make test)' : target === 'build' || target === 'all' ? `Builds it (make ${target})` : `Runs the make target ${target}`) : 'Runs make'; }
      case 'bundle': if (sub === 'install') return 'Installs what it needs (bundle install)'; if (sub === 'exec') return commandSays(args.slice(1).join(' ')).says; return null;
      case 'rake': return sub === 'test' || sub === 'spec' || !sub ? 'Runs the tests' : `Runs the rake task ${sub}`;
      case 'composer': return sub === 'install' ? 'Installs what it needs (composer install)' : null;
      case 'docker': case 'podman': return dockerWords(args);
      case 'docker-compose': return composeWords(args);
      case 'az': return azWords(args);
      case 'aws': return awsWords(args);
      case 'gcloud': return sub === 'auth' ? 'Signs in to Google Cloud' : sub === 'run' && args[1] === 'deploy' ? `Deploys ${args[2] ?? 'the service'} to Cloud Run` : `Runs the Google Cloud command gcloud ${args.slice(0, 2).join(' ')}`;
      case 'kubectl': return kubectlWords(args);
      case 'helm': return helmWords(args);
      case 'terraform': case 'tofu':
        return { init: 'Gets Terraform ready (terraform init)', plan: 'Works out what Terraform would change', apply: 'Applies the Terraform changes', destroy: 'Removes everything Terraform made', validate: 'Checks the Terraform files', fmt: 'Checks the Terraform formatting' }[sub] ?? null;
      case 'git': return gitWords(args);
      case 'gh': return sub === 'release' && args[1] === 'create' ? 'Makes a GitHub release' : sub === 'pr' && args[1] === 'create' ? 'Opens a pull request' : `Runs the GitHub command gh ${args.slice(0, 2).join(' ')}`;
      case 'curl': case 'wget': { const url = args.find((a) => /^https?:\/\//i.test(a)); const sends = args.some((a, i) => (a === '-X' && /^(POST|PUT|PATCH|DELETE)$/i.test(args[i + 1] ?? '')) || a === '-d' || a === '--data' || a.startsWith('--data')); return url ? `${sends ? 'Sends a request to' : 'Downloads from'} ${hostOf(url)}` : 'Downloads a file'; }
      case 'cat': if (tail === 'summary') return "Adds text to the run's summary"; if (tail === 'output' || tail === 'env') return 'Saves values for later steps'; return args.length ? `Shows ${listWords(args.filter((a) => !a.startsWith('-')))}` : null;
      case 'mkdir': return `Makes the folder ${listWords(pkgList(args))}`;
      case 'cd': case 'pushd': return `Goes into the folder ${args[0] ?? 'home'}`;
      case 'popd': return 'Goes back to the folder it was in';
      case 'cp': { const p = pkgList(args); return p.length >= 2 ? `Copies ${listWords(p.slice(0, -1))} to ${p.at(-1)}` : null; }
      case 'mv': { const p = pkgList(args); return p.length >= 2 ? `Moves ${listWords(p.slice(0, -1))} to ${p.at(-1)}` : null; }
      case 'rm': { const p = pkgList(args); if (p.length && p.every((x) => x.startsWith('/var/lib/apt/lists') || x.startsWith('/var/cache'))) return 'Cleans up after installing'; return p.length ? `Removes ${listWords(p)}` : null; }
      case 'chmod': { const p = pkgList(args.slice(1)); return /\+x/.test(args[0] ?? '') ? `Lets ${listWords(p)} run as a program` : `Changes who can use ${listWords(p)}`; }
      case 'chown': return `Changes who owns ${listWords(pkgList(args.slice(1)))}`;
      case 'touch': return `Makes the file ${listWords(pkgList(args))}`;
      case 'ln': return `Links ${pkgList(args).join(' to ')}`;
      case 'tar': return /x/.test(args[0] ?? '') ? 'Unpacks an archive' : 'Packs files into an archive';
      case 'unzip': return `Unpacks ${args.find((a) => !a.startsWith('-')) ?? 'an archive'}`;
      case 'ls': return 'Lists the files';
      case 'sleep': return `Waits ${sub ?? 'a moment'} second${sub === '1' ? '' : 's'}`;
      case 'set': return args.some((a) => /^-\w*e/.test(a)) ? 'Stops at the first command that fails' : args.some((a) => /^-\w*x/.test(a)) ? 'Shows each command as it runs' : null;
      case 'true': case ':': return 'Does nothing';
      case 'false': return null;
      case 'continue': return 'Skips to the next one';
      case 'break': return 'Stops repeating';
      case 'bash': case 'sh': case 'zsh': case 'pwsh': case 'powershell': {
        if (args[0] === '-c' || args[0] === '-Command') return args[1] ? commandSays(args[1]).says : null;
        const script = args.find((a) => !a.startsWith('-'));
        return script ? `Runs ${scriptName(script)}` : null;
      }
      case 'source': case '.': return `Loads settings from ${sub}`;
      case 'useradd': case 'adduser': return `Makes the user ${args.filter((a) => !a.startsWith('-')).at(-1)}`;
      case 'groupadd': case 'addgroup': return `Makes the group ${args.filter((a) => !a.startsWith('-')).at(-1)}`;
      case 'export': return args.length ? `Sets ${listWords(args.map((a) => a.split('=')[0]))}` : null;
      default: return null;
    }
  })();
  if (tool === 'exit') {
    const code = Number(sub ?? 0);
    return code ? { kind: 'fail', says: 'Fails with The job fails' } : { kind: 'return', says: 'Stops here, successfully' };
  }
  if (r) return out(r);
  // A script in the repository: ./scripts/deploy.sh -> "Runs scripts/deploy.sh".
  if (/^\.{0,2}\//.test(tool0) || /\.(sh|ps1|py|js|mjs|rb|bash)$/.test(tool0)) return out(`Runs ${scriptName(tool0)}`);
  return said(`Runs \`${short(text)}\``);
}

function pipWords(args) {
  const sub = args[0];
  if (sub !== 'install') return sub ? `Runs pip ${sub}` : null;
  const rest = args.slice(1);
  const req = rest.indexOf('-r') >= 0 ? rest[rest.indexOf('-r') + 1] : rest.find((a) => a.startsWith('--requirement='))?.split('=')[1];
  if (req) return `Installs what ${req} lists`;
  const pkgs = pkgList(rest);
  if (rest.includes('-e') || pkgs.includes('.')) return 'Installs this project';
  if (rest.includes('--upgrade') && pkgs.length === 1 && pkgs[0] === 'pip') return 'Updates pip';
  return installs(pkgs, 'pip install');
}
function dockerWords(args) {
  const sub = args[0] === 'buildx' || args[0] === 'image' ? args[1] : args[0];
  const rest = args[0] === 'buildx' || args[0] === 'image' ? args.slice(2) : args.slice(1);
  const tagAt = rest.findIndex((a) => a === '-t' || a === '--tag');
  const tag = tagAt >= 0 ? rest[tagAt + 1] : rest.find((a) => a.startsWith('--tag='))?.slice(6);
  if (sub === 'build') return `Builds the image${tag ? ` ${tag}` : ''}${rest.includes('--push') ? ' and pushes it to its registry' : ''}`;
  if (sub === 'push') return `Pushes the image ${firstArg(rest) ?? ''} to its registry`.replace('  ', ' ');
  if (sub === 'pull') return `Downloads the image ${firstArg(rest)}`;
  if (sub === 'run') return `Runs the image ${rest.filter((a, i) => !a.startsWith('-') && !(rest[i - 1] ?? '').match(/^-(e|p|v|w|-name|-env|-network|-volume|-publish)$/))[0] ?? ''}`.trim();
  if (sub === 'login') return 'Signs in to the image registry';
  if (sub === 'tag') return `Also names the image ${rest[0]} as ${rest[1]}`;
  if (sub === 'compose') return composeWords(args.slice(1));
  return sub ? `Runs docker ${sub}` : null;
}
function composeWords(args) {
  const sub = args.find((a) => !a.startsWith('-'));
  return sub === 'up' ? 'Starts the services (docker compose up)' : sub === 'down' ? 'Stops the services (docker compose down)' : sub === 'build' ? 'Builds the services\' images' : sub ? `Runs docker compose ${sub}` : null;
}
function azWords(args) {
  const [a, b, c] = args;
  if (a === 'login') return 'Signs in to Azure';
  if (a === 'account' && b === 'set') return 'Chooses the Azure subscription';
  if (a === 'group' && b === 'create') return 'Makes an Azure resource group';
  if (a === 'deployment') return 'Deploys an Azure template';
  if ((a === 'webapp' || a === 'functionapp') && (b === 'deploy' || b === 'up' || (b === 'deployment' && c))) return 'Deploys the app to Azure';
  if (a === 'acr' && b === 'login') return 'Signs in to the Azure image registry';
  if (a === 'acr' && b === 'build') return 'Builds the image in Azure';
  if (a === 'aks' && b === 'get-credentials') return 'Gets the sign-in for the Kubernetes cluster in Azure';
  return `Runs the Azure command az ${args.filter((x) => !x.startsWith('-')).slice(0, 3).join(' ')}`;
}
function awsWords(args) {
  const [a, b] = args;
  if (a === 'configure') return 'Sets up the AWS sign-in';
  if (a === 's3' && (b === 'cp' || b === 'sync')) return 'Copies files to or from Amazon S3';
  if (a === 'ecr' && b === 'get-login-password') return 'Gets a sign-in for the Amazon image registry';
  if (a === 'ecs' && b === 'update-service') return 'Updates the Amazon ECS service';
  if (a === 'cloudformation' && b === 'deploy') return 'Deploys an AWS CloudFormation stack';
  if (a === 'lambda' && b === 'update-function-code') return 'Updates the AWS Lambda function';
  return `Runs the AWS command aws ${args.filter((x) => !x.startsWith('-')).slice(0, 2).join(' ')}`;
}
function kubectlWords(args) {
  const [a, ...rest] = args;
  const f = rest.indexOf('-f') >= 0 ? rest[rest.indexOf('-f') + 1] : null;
  if (a === 'apply') return `Applies ${f ?? 'the files'} to the Kubernetes cluster`;
  if (a === 'rollout' && rest[0] === 'status') return 'Waits for the rollout to finish';
  if (a === 'rollout' && rest[0] === 'restart') return 'Restarts what runs in the cluster';
  if (a === 'set' && rest[0] === 'image') return 'Changes the image the cluster runs';
  if (a === 'delete') return `Removes ${f ?? listWords(pkgList(rest))} from the cluster`;
  if (a === 'create') return `Makes ${listWords(pkgList(rest).slice(0, 2))} in the cluster`;
  if (a === 'get' || a === 'describe') return `Shows ${listWords(pkgList(rest).slice(0, 2))} in the cluster`;
  return `Runs kubectl ${a ?? ''}`.trim();
}
function helmWords(args) {
  const [a, ...rest] = args;
  const p = pkgList(rest);
  if (a === 'upgrade' && rest.includes('--install')) return `Installs or upgrades the Helm release ${p[0]}`;
  if (a === 'upgrade') return `Upgrades the Helm release ${p[0]}`;
  if (a === 'install') return `Installs the Helm release ${p[0]}`;
  if (a === 'repo' && rest[0] === 'add') return `Adds the Helm chart source ${rest[1]}`;
  if (a === 'lint') return 'Checks the Helm chart';
  if (a === 'template') return 'Writes out the Kubernetes files from the chart';
  if (a === 'uninstall') return `Removes the Helm release ${p[0]}`;
  return `Runs helm ${a ?? ''}`.trim();
}
function gitWords(args) {
  const [a, ...rest] = args;
  return { clone: `Downloads the repository ${pkgList(rest)[0] ?? ''}`.trim(), config: 'Sets a git setting', commit: 'Records a commit', push: 'Pushes commits to the repository', tag: 'Tags the commit', add: 'Adds files to the next commit', fetch: 'Fetches the latest changes', pull: 'Pulls the latest changes', diff: 'Shows what changed', status: 'Shows what changed' }[a]
    ?? (a === 'checkout' || a === 'switch' ? `Switches to ${pkgList(rest)[0] ?? 'a branch'}` : a ? `Runs git ${a}` : null);
}

/** Where a shell text leaves off: an open quote and how many `$(` are still open. Comments end the scan. */
function lineState(text, st = { q: null, d: 0 }) {
  let { q, d } = st;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\' && q !== "'") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) break;
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '$' && text[i + 1] === '(') { d++; i++; }
    else if (c === ')' && d) d--;
  }
  return { q, d };
}
const isOpen = (st) => !!st && (st.q || st.d > 0);

/**
 * Join backslash-continued lines and quotes that span lines (an awk or python -c script); skip heredoc bodies
 * (`cat <<EOF … EOF` is one command whose body is text). Returns [{ text, line }], skipping comments and blanks.
 */
export function logicalLines(text, firstLine) {
  const out = [];
  const lines = String(text).split('\n');
  let cur = null;
  let quote = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (cur == null && (!t || t.startsWith('#'))) continue;
    if (cur != null && !isOpen(quote) && t.startsWith('#')) continue;
    if (cur == null) cur = { text: '', line: firstLine + i };
    if (isOpen(quote)) { cur.text = /\\$/.test(cur.text) ? `${cur.text.slice(0, -1).trimEnd()} ${t}` : `${cur.text}\n${raw}`; quote = lineState(raw, quote); if (isOpen(quote)) continue; }
    else {
      quote = lineState(t);
      if (isOpen(quote)) { cur.text += t; continue; }
      if (t.endsWith('\\') && !t.endsWith('\\\\')) { cur.text += `${t.slice(0, -1).trim()} `; continue; }
      cur.text += t;
    }
    const doc = /<<-?\s*["']?([A-Za-z_]\w*)["']?/.exec(cur.text.replace(/'[^']*'|"[^"]*"/g, (m) => (/<</.test(m) ? '' : m)));
    if (doc) {
      // The heredoc body is text the command is given, not commands.
      while (i + 1 < lines.length && lines[i + 1].trim() !== doc[1]) i++;
      i++;
      cur.heredoc = true;
    }
    out.push({ text: cur.text.trim(), line: cur.line, ...(cur.heredoc ? { heredoc: true } : {}) });
    cur = null;
  }
  if (cur) out.push({ text: cur.text.trim(), line: cur.line });
  return out;
}

/** A shell test (`[ "$A" = "$B" ]`) or command used as a condition, as a question. */
function shellQuestion(cond) {
  let c = cond.trim();
  let negate = false;
  if (c.startsWith('! ')) { negate = true; c = c.slice(2).trim(); }
  let m;
  if ((m = /^\[\[?\s+(.*?)\s+\]\]?$/.exec(c)) || (m = /^test\s+(.*)$/.exec(c))) {
    const w = shellWords(m[1]).map((x) => x.replace(/^\$\{?(\w+)\}?$/, '$1'));
    const not = (b) => (b !== negate ? 'not ' : '');
    if (w.length === 3 && ['=', '==', '!='].includes(w[1])) return `Is ${w[0] || 'empty'} ${not(w[1] === '!=')}${w[2] || 'empty'}?`;
    if (w.length === 3 && ['-eq', '-ne', '-lt', '-gt', '-le', '-ge'].includes(w[1])) return `Is ${w[0]} ${negate ? 'not ' : ''}${{ '-eq': '', '-ne': 'not ', '-lt': 'less than ', '-gt': 'more than ', '-le': 'at most ', '-ge': 'at least ' }[w[1]]}${w[2]}?`;
    if (w.length === 2 && w[0] === '-z') return `Is ${w[1]} ${negate ? 'set' : 'empty'}?`;
    if (w.length === 2 && w[0] === '-n') return `Is ${w[1]} ${negate ? 'empty' : 'set'}?`;
    if (w.length === 2 && (w[0] === '-f' || w[0] === '-e')) return `Does the file ${w[1]} ${negate ? 'not ' : ''}exist?`;
    if (w.length === 2 && w[0] === '-d') return `Does the folder ${w[1]} ${negate ? 'not ' : ''}exist?`;
  }
  if (/^(\[\[?|test)(\s|$)/.test(c)) return `Is \`${short(c, 60)}\` true?`;
  const said = commandSays(c).says;
  return `${negate ? 'Does this fail' : 'Does this work'}: ${lc(said)}?`;
}

/**
 * The steps of a shell script (a `run:` block or a Dockerfile RUN): one step per command, `&&` chains split, `if`
 * and `for` read as a question and a repeat. `line` of each step is the line the command starts on.
 */
export function shellSteps(text, firstLine) {
  const stmts = [];
  const lls = logicalLines(text, firstLine);
  for (let n = 0; n < lls.length; n++) {
    const l = lls[n];
    // A shell function (`name() { … }`) runs only when it is called: one step, its body skipped to the closing brace.
    if (/^(function\s+)?[\w-]+\s*\(\)\s*\{?$/.test(l.text) || /^function\s+[\w-]+\s*\{?$/.test(l.text)) {
      let depth = l.text.endsWith('{') ? 1 : 0;
      while (n + 1 < lls.length) { const t = lls[++n].text; if (t === '{' || /\{$/.test(t)) depth++; if (t === '}' || /^\}/.test(t)) depth--; if (depth <= 0 && /^\}/.test(t)) break; }
      stmts.push({ text: l.text, line: l.line, fn: true });
      continue;
    }
    const parts = l.heredoc ? [{ text: l.text, op: null }] : splitCommands(l.text);
    for (let k = 0; k < parts.length; k++) {
      let p = parts[k].text;
      let kw;
      // `then echo x`, `do echo x`, `else echo x`: the keyword and the command after it.
      while ((kw = /^(then|do|else)\s+(.+)$/.exec(p))) { stmts.push({ text: kw[1], line: l.line }); p = kw[2]; }
      // `{` / `}` group commands and `( … )` runs them apart: the commands inside are what matter.
      let open = false, close = false;
      if (/^[{(](\s+|$)/.test(p)) { open = true; p = p.slice(1).trim(); }
      if (/^\}\s*(>|$)/.test(p)) { close = true; p = ''; }
      if (/(^|\s)\}$/.test(p) && !p.includes('{')) { close = true; p = p.slice(0, -1).trim(); }
      if (/(^|\s)\)$/.test(p) && !p.includes('(')) { close = true; p = p.slice(0, -1).trim(); }
      if (open) stmts.push({ text: '{', line: l.line });
      if (p && !/^>>?\s*\S+$/.test(p)) stmts.push({ text: p, line: l.line, op: parts[k].op, next: parts[k + 1]?.text, ...(l.heredoc ? { heredoc: true } : {}) });
      if (close) stmts.push({ text: '}', line: l.line });
    }
  }
  // Skip heredoc bodies: a command with `<<WORD` swallows lines up to WORD.
  let i = 0;
  const block = (stops) => {
    const out = [];
    while (i < stmts.length) {
      const s = stmts[i];
      const head = s.text.split(/\s+/)[0];
      if (stops.includes(head)) return out;
      i++;
      if (s.fn) { out.push({ kind: 'call', says: `Defines the command ${/^(?:function\s+)?([\w-]+)/.exec(s.text)[1]}, for later lines to use`, code: s.text, line: s.line }); continue; }
      if (head === 'case') {
        const what = /^case\s+(.+?)\s+in\b/.exec(s.text)?.[1] ?? 'a value';
        while (i < stmts.length && stmts[i].text !== 'esac' && !/^esac\b/.test(stmts[i].text)) i++;
        i++;
        out.push({ kind: 'call', says: `Chooses what to do by ${shellWords(what)[0]?.replace(/^\$\{?(\w+)\}?$/, '$1') ?? what}`, code: s.text, line: s.line, unknownCommand: true });
        continue;
      }
      if ((head === '[' || head === '[[' || head === 'test') && (s.op === '&&' || s.op === '||') && s.next && !/^\{/.test(s.next)) {
        // `[ -f x ] && cmd`: a question with the command on its Yes side (or its No side for ||).
        const q = shellQuestion(s.op === '||' ? `! ${s.text}` : s.text);
        i++;
        const r = commandSays(s.next);
        out.push({ kind: 'branch', says: q, code: `${s.text} ${s.op} ${s.next}`, line: s.line, children: [{ kind: r.kind, says: r.says, code: s.next, line: s.line, ...(r.kind === 'fail' ? { error: 'The job fails' } : {}), ...(/^Runs `/.test(r.says) ? { unknownCommand: true } : {}) }] });
        continue;
      }
      if (head === 'if' || head === 'elif') {
        const q = shellQuestion(s.text.replace(/^(if|elif)\s+/, ''));
        if (stmts[i]?.text === 'then') i++;
        const step = { kind: 'branch', says: q, code: s.text, line: s.line, children: block(['elif', 'else', 'fi']) };
        if (stmts[i]?.text.startsWith('elif')) step.otherwise = block(['fi']);
        else if (stmts[i]?.text === 'else') { i++; step.otherwise = block(['fi']); }
        if (stmts[i]?.text === 'fi') i++;
        out.push(step);
        continue;
      }
      if (head === 'for' || head === 'while' || head === 'until') {
        const m = /^for\s+(\w+)\s+in\s+(.*)$/.exec(s.text);
        if (stmts[i]?.text === 'do') i++;
        out.push({ kind: 'loop', says: m ? `For each ${m[1]} in ${m[2]}` : `Repeats ${head === 'until' ? 'until' : 'while'} ${s.text.replace(/^(while|until)\s+/, '')}`, code: s.text, line: s.line, children: block(['done']) });
        if (stmts[i]?.text === 'done') i++;
        continue;
      }
      if (['then', 'do', 'fi', 'done', 'else', 'esac', '{', '}'].includes(s.text)) continue;
      // `cmd || { …; exit 1; }` and `cmd && { … }`: a question whose one side is the group.
      if ((s.op === '||' || s.op === '&&') && /^\{/.test(s.next ?? '') && stmts[i]?.text === '{') {
        const r0 = commandSays(s.text);
        i++;
        const inside = block(['}']);
        if (stmts[i]?.text === '}') i++;
        out.push({ kind: 'branch', says: `${s.op === '||' ? 'Does this fail' : 'Does this work'}: ${lc(r0.says)}?`, code: s.text, line: s.line, children: inside, ...(r0.kind === 'set' ? {} : {}) });
        continue;
      }
      const r = commandSays(s.text);
      const step = { kind: r.kind, says: r.says, code: s.text, line: s.line, ...(r.kind === 'call' && /^Runs `/.test(r.says) ? { unknownCommand: true } : {}) };
      if (s.op === '||' && s.next) {
        // `a || true`: a failure is ignored; `a || exit 1`: a failure stops; otherwise the other command runs instead.
        const alt = commandSays(s.next);
        i++;
        if (/^(true|:)$/.test(s.next.trim())) step.says += ' (a failure here is ignored)';
        else if (alt.kind === 'fail') { out.push({ kind: 'branch', says: `Does this fail: ${lc(step.says)}?`, code: `${s.text} || ${s.next}`, line: s.line, children: [{ kind: 'fail', says: alt.says, code: s.next, line: s.line, error: 'The job fails' }] }); continue; }
        else step.says += `; if that fails, ${lc(alt.says)}`;
      } else if (s.op === '|' && s.next) {
        const alt = commandSays(s.next);
        i++;
        step.says += `, then ${lc(alt.says)}`;
      }
      if (r.kind === 'fail') step.error = 'The job fails';
      out.push(step);
    }
    return out;
  };
  return block([]);
}
