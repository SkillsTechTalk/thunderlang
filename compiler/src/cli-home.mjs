// The human front door of the thunder CLI: the short home screen, help for one command, typo suggestions,
// a friendly message when a Core command runs outside a project, and `thunder doctor`.
// Every existing command, flag, exit code, and JSON output is unchanged; this file only adds words around them.
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { delimiter, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { findPython, findProjectRoot } from './core/project.mjs';
import { paint, useColor } from './term.mjs';

/** The commands `thunder` understands besides those listed in the full help (kept in sync by a test). */
export const EXTRA_COMMANDS = ['doctor', 'completion', 'plain', 'ai', 'coverage', 'completions', 'hover', 'format', 'help', 'version', 'mission', 'why', 'trace', 'graph', 'proof', 'build'];

/** Every command name: the ones the full help lists, plus EXTRA_COMMANDS. */
export function knownCommands(fullHelp) {
  const listed = [...fullHelp.matchAll(/^ {2}([a-z][a-z0-9-]*(?: \| [a-z][a-z0-9-]*)*)(?=[\s<[]|$)/gm)].flatMap((m) => m[1].split(' | '));
  return [...new Set([...listed, ...EXTRA_COMMANDS])].sort();
}

/** The home screen: the few things most people need, with real examples. */
export function homeText(version, commandCount) {
  return `⚡ Thunder™ ${version}: programming, made human.

Start here
  thunder new hello        create a program
  thunder run hello        run it
  thunder test hello       check that it works
  thunder read app.py      understand code you already have
  thunder try rules.py     try a rule with your own values: the answer, and why
  thunder why run.json     see what an AI agent did, and why

More
  thunder help <command>   help for one command, like: thunder help read
  thunder help --all       all ${commandCount} commands
  thunder doctor           check that your computer is ready
  thunder completion zsh   press Tab to complete commands (also bash, fish)

Programs you write in Thunder run as Python today. Docs: https://thunderlang.dev/docs`;
}

/** The full help's lines for one command (its line and the indented lines under it), or null. */
export function helpFor(cmd, fullHelp) {
  const lines = fullHelp.split('\n');
  const out = [];
  let section = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l) && !l.startsWith('usage')) section = l.trim();
    const m = l.match(/^ {2}([a-z][a-z0-9-]*(?: \| [a-z][a-z0-9-]*)*)/);
    if (m && m[1].split(' | ').includes(cmd)) {
      if (!out.length && section) out.push(section);
      out.push(l);
      while (lines[i + 1] && /^ {6,}\S/.test(lines[i + 1])) out.push(lines[++i]);
    }
  }
  return out.length ? out.join('\n') : null;
}

/** Edit distance, for "did you mean". */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** Commands close to a mistyped one, closest first. */
export function suggest(word, known) {
  const w = String(word).toLowerCase();
  const limit = w.length <= 4 ? 1 : 2;
  const scored = known.map((k) => [k, distance(w, k)]).filter(([, n]) => n <= limit);
  const best = Math.min(...scored.map(([, n]) => n));
  return scored.filter(([, n]) => n === best).map(([k]) => k).sort().slice(0, 3);
}

export function unknownCommandText(cmd, known) {
  const s = suggest(cmd, known);
  return `thunder: there is no command "${cmd}".${s.length ? ` Did you mean ${s.map((x) => `thunder ${x}`).join(' or ')}?` : ''}\nSee the main commands with: thunder help`;
}

/** Thunder Core projects (folders with thunder.toml) up to two levels below `dir`. */
export function nearbyProjects(dir) {
  const found = [];
  const walk = (d, depth) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'generated') continue;
      const p = join(d, e.name);
      if (existsSync(join(p, 'thunder.toml'))) found.push(p);
      else if (depth < 2) walk(p, depth + 1);
    }
  };
  walk(dir, 1);
  return found.sort();
}

/** What to say when a Core command (run, test, build, check) is given no file outside a project. */
export function noProjectText(cmd, cwd) {
  const near = nearbyProjects(cwd);
  const L = [`thunder ${cmd}: there is no Thunder project in this folder.`, '', `You're in: ${cwd}`];
  if (near.length) {
    L.push('', near.length === 1 ? 'There is one here:' : 'There are some here:');
    for (const p of near.slice(0, 5)) L.push(`  thunder ${cmd} ${relative(cwd, p)}`);
  } else {
    L.push('', 'Make one with:', '  thunder new hello', `  thunder ${cmd} hello`);
  }
  L.push('', '(For a mission file, name it: thunder ' + cmd + ' <file>.thunder)');
  return L.join('\n');
}

// ── thunder completion ────────────────────────────────────────────────────────────────────────────────────────

/** A shell completion script: command names first, then files. */
export function completionScript(shell, commands) {
  const words = commands.join(' ');
  if (shell === 'bash') return `# thunder completion for bash. Add to ~/.bashrc:  eval "$(thunder completion bash)"
_thunder() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then COMPREPLY=( $(compgen -W "${words}" -- "$cur") ); fi
}
complete -o default -F _thunder thunder`;
  if (shell === 'zsh') return `# thunder completion for zsh. Add to ~/.zshrc:  eval "$(thunder completion zsh)"
(( $+functions[compdef] )) || { autoload -Uz compinit && compinit }
_thunder() { if (( CURRENT == 2 )); then compadd -- ${words}; else _files; fi }
compdef _thunder thunder`;
  if (shell === 'fish') return `# thunder completion for fish. Save as ~/.config/fish/completions/thunder.fish:  thunder completion fish > ~/.config/fish/completions/thunder.fish
complete -c thunder -n "__fish_use_subcommand" -a "${words}"`;
  return null;
}

export function completionMain(argv, commands) {
  const shell = argv[0];
  const s = completionScript(shell, commands);
  if (!s) { console.error(`thunder completion: name your shell: thunder completion zsh, bash, or fish.${shell ? ` (There is no "${shell}".)` : ''}`); return 2; }
  console.log(s);
  return 0;
}

// ── thunder doctor ────────────────────────────────────────────────────────────────────────────────────────────

const quiet = (cmd, args) => {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 4000 });
    if (r.error || r.status !== 0) return null;
    return `${r.stdout || ''}${r.stderr || ''}`.trim();
  } catch { return null; }
};
const firstVersion = (s) => (s && s.match(/\d+\.\d+(\.\d+)?/)?.[0]) || null;

function onPath(name) {
  const hits = [];
  for (const dir of String(process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, name);
    try { if (statSync(p).isFile()) hits.push(p); } catch { /* not here */ }
  }
  return hits;
}
const real = (p) => { try { return realpathSync(p); } catch { return p; } };

/**
 * Check this computer: offline, nothing installed or changed. Returns { ok, checks, optional, project }.
 * `ok` is false only when something needed to write and run Thunder programs is missing.
 */
export function doctor({ version, cliPath, cwd = process.cwd(), env = process.env } = {}) {
  const checks = [];
  const add = (ok, what, detail, fix) => checks.push({ ok, what, ...(detail ? { detail } : {}), ...(fix ? { fix } : {}) });

  add(true, `Thunder ${version}`, cliPath ? real(cliPath) : null);

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add(nodeMajor >= 18, `Node.js ${process.versions.node}`, 'Thunder needs Node.js 18 or newer', nodeMajor >= 18 ? null : 'Install Node.js 18 or newer from https://nodejs.org');

  const py = findPython();
  if (py.error) add(false, 'Python 3.10 or newer', 'Programs you write in Thunder run with Python', py.error);
  else add(true, `Python ${py.version}`, `runs the programs you write in Thunder; found as ${py.cmd}`);

  const hits = onPath('thunder');
  const mine = cliPath ? real(cliPath) : null;
  if (!hits.length) add(false, 'thunder is not on your PATH', 'A new terminal may say "command not found: thunder"', 'Install it for this shell: npm install -g @skillstech/thunderlang');
  else if (mine && !hits.some((h) => real(h) === mine)) add('warn', 'Another thunder comes first on your PATH', real(hits[0]), 'Check which one you want with: which -a thunder');
  else add(true, 'thunder is on your PATH');

  // nvm installs global commands per Node version: switching versions (an .nvmrc in a folder) can lose `thunder`.
  const nvmDir = env.NVM_DIR || join(homedir(), '.nvm');
  const versionsDir = join(nvmDir, 'versions', 'node');
  if (existsSync(versionsDir)) {
    let versions = [];
    try { versions = readdirSync(versionsDir).filter((v) => /^v\d/.test(v)); } catch { /* unreadable */ }
    const missing = versions.filter((v) => !existsSync(join(versionsDir, v, 'bin', 'thunder')));
    if (missing.length) {
      add('warn', `Thunder isn't installed for Node ${missing.join(', ')}`,
        'When your shell switches to one of these (nvm, .nvmrc), "thunder" will say "command not found"',
        `Install it there too: ${missing.map((v) => `nvm exec ${v.slice(1)} npm install -g @skillstech/thunderlang`).join('; ')}`);
    }
  }

  const root = findProjectRoot(cwd);
  const project = root
    ? { in: true, root, say: `You're in the Thunder project ${relative(cwd, root) || '.'}: thunder run` }
    : (() => { const near = nearbyProjects(cwd); return { in: false, nearby: near, say: near.length ? `Not in a Thunder project. Nearby: ${near.slice(0, 3).map((p) => `thunder run ${relative(cwd, p)}`).join(', ')}` : 'Not in a Thunder project. Make one: thunder new hello' }; })();

  // Only needed to compile rules to these languages (thunder gen / test --target).
  const optional = [
    ['Java', 'javac', ['-version']],
    ['.NET (C#)', 'dotnet', ['--version']],
    ['Go', 'go', ['version']],
    ['Rust', 'rustc', ['--version']],
    ['TypeScript (tsc)', 'tsc', ['--version']],
  ].map(([name, cmd, args]) => { const v = firstVersion(quiet(cmd, args)); return { name, ok: !!v, ...(v ? { version: v } : {}) }; });

  return { ok: checks.every((c) => c.ok !== false), checks, project, optional };
}

export function renderDoctor(r) {
  const mark = (ok) => (ok === true ? '✓' : ok === 'warn' ? '!' : '✗');
  const L = ['Thunder™ doctor', ''];
  for (const c of r.checks) {
    L.push(`  ${mark(c.ok)} ${c.what}${c.detail ? `  (${c.detail})` : ''}`);
    if (c.fix && c.ok !== true) L.push(`      ${c.fix}`);
  }
  L.push(`  · ${r.project.say}`);
  L.push('', 'Optional: only to compile rules to these languages');
  L.push(`  ${r.optional.map((o) => `${o.ok ? '✓' : '·'} ${o.name}${o.version ? ` ${o.version}` : ''}`).join('   ')}`);
  L.push('', r.ok
    ? (r.checks.some((c) => c.ok === 'warn') ? 'Ready to write and run Thunder programs. The ! lines are worth fixing.' : 'Ready to write and run Thunder programs.')
    : 'Not ready yet: fix the ✗ lines above, then run thunder doctor again.');
  return L.join('\n');
}

export function doctorMain(argv, { version, cliPath }) {
  const json = argv.includes('--json');
  const bad = argv.find((a) => a !== '--json');
  if (bad) { console.error(`thunder doctor: there is no option ${bad}. It takes only --json.`); return 2; }
  const r = doctor({ version, cliPath, cwd: resolve(process.cwd()) });
  console.log(json ? JSON.stringify(r, null, 2) : paint(renderDoctor(r)));
  return r.ok ? 0 : 1;
}
