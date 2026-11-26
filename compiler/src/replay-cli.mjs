// thunder replay: the Thunder Time Machine. Step forward and back through a recording made with
// `thunder run --record <file>`: each statement as it ran, the values it changed, what it printed, what a function
// gave back, and where a choice or a loop went. It replays a recording: going back shows an earlier moment and never
// undoes anything the program did.
//   thunder replay <file> [--step n] [--json]
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { paint, paintThunderLine, useColor } from './term.mjs';

const SCHEMA = 'thunder-time-machine-v1';
const USAGE = `usage: thunder replay <recording.json> [--step n] [--json]
Step through a recording made with: thunder run <program> --record <recording.json>
Keys: Enter or n for the next step, b to go back, j and a number to jump (j 7), q to quit.`;

/** The text of a Thunder line from the recording's copy of the program. */
const lineText = (trace, file, line) => {
  const src = trace.files?.[file] ?? Object.values(trace.files ?? {})[0];
  return src ? (src.split('\n')[line - 1] ?? '').trim() : '';
};

/**
 * Where a choice or a loop went, in words. For When / Otherwise when / Otherwise, the arm whose lines hold the next
 * step answers it: the first arm is "yes"; a later one is "no", then that arm.
 */
function branchText(trace, s) {
  if (s.next == null) return s.kind === 'if' ? '  → no, so nothing inside ran' : '  → the steps inside did not run';
  if (s.kind !== 'if') return `  → goes on to line ${s.next}`;
  const src = (trace.files?.[s.file] ?? '').split('\n');
  const indent = (l) => l.match(/^\s*/)[0].length;
  const base = indent(src[s.line - 1] ?? '');
  const arms = [{ line: s.line, text: (src[s.line - 1] ?? '').trim() }];
  for (let k = s.line; k < src.length; k++) {
    const l = src[k];
    if (!l.trim()) continue;
    if (indent(l) < base || (indent(l) === base && !/^\s*Otherwise\b/.test(l))) break;
    if (indent(l) === base) arms.push({ line: k + 1, text: l.trim() });
  }
  const arm = [...arms].reverse().find((x) => x.line < s.next) ?? arms[0];
  if (arm === arms[0]) return '  → yes';
  if (/^Otherwise:$/.test(arm.text)) return `  → no, so the Otherwise steps (line ${arm.line})`;
  return `  → no; then: ${arm.text.replace(/^Otherwise\s+(when|if)\s+/i, '').replace(/:$/, '')} → yes (line ${arm.line})`;
}

/** One step as a few lines of plain text. */
export function renderStep(trace, i) {
  const steps = trace.steps;
  const s = steps[i];
  if (!s) return `There is no step ${i + 1}. This recording has ${steps.length} step${steps.length === 1 ? '' : 's'}.`;
  const where = s.fn ? `inside "${s.fn.replace(/_/g, ' ')}"` : 'in the program';
  const L = [`⏱ Step ${s.n} of ${steps.length} · ${s.file}, line ${s.line} · ${where}`, `  ${paintThunderLine(lineText(trace, s.file, s.line), useColor())}`];
  // A call: the steps deeper than this one, right after it, belong to the function it called.
  let j = i + 1;
  while (j < steps.length && steps[j].depth > s.depth) j++;
  const calls = j > i + 1 && !('next' in s) ? steps[i + 1] : null;
  if (calls) L.push(`  Calls "${(calls.fn ?? 'a function').replace(/_/g, ' ')}" (step${j - i - 1 === 1 ? '' : 's'} ${i + 2}${j - i - 1 > 1 ? `–${j}` : ''}), then:`);
  if ('next' in s) L.push(branchText(trace, s));
  for (const c of s.changes ?? []) L.push(`  ${c.name}: ${c.before != null ? `${c.before} → ` : '→ '}${c.after}`);
  if (s.gives != null) L.push(`  gives back ${s.gives}`);
  if (s.said) for (const line of s.said.replace(/\n$/, '').split('\n')) L.push(`  says: ${line}`);
  if (s.failed && !('next' in s)) L.push(`  ✗ stopped here${trace.stderr ? `: ${trace.stderr.trim().replace(/^.*?: /, '')}` : ''}`);
  if (!s.changes && s.gives == null && !s.said && !('next' in s) && !s.failed && !calls) L.push('  (nothing changed)');
  return L.join('\n');
}

export function replayMain(argv, { input = process.stdin, output = process.stdout } = {}) {
  const a = { _: [], step: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--step') a.step = argv[++i];
    else if (x === '--json') a.json = true;
    else if (x === '--help' || x === '-h') { console.log(USAGE); return Promise.resolve(0); }
    else if (x.startsWith('--')) { console.error(`thunder replay: there is no option ${x}.\n${USAGE}`); return Promise.resolve(2); }
    else a._.push(x);
  }
  if (a._.length !== 1) { console.error(`thunder replay: name one recording.\n${USAGE}`); return Promise.resolve(2); }
  let trace;
  try { trace = JSON.parse(readFileSync(a._[0], 'utf8')); }
  catch (e) { console.error(`thunder replay: couldn't read ${a._[0]}${e.code === 'ENOENT' ? ': there is no such file' : ': it is not a recording'}. Make one with: thunder run <program> --record ${a._[0]}`); return Promise.resolve(2); }
  if (trace?.schema !== SCHEMA || !Array.isArray(trace.steps)) { console.error(`thunder replay: ${a._[0]} is not a Thunder recording. Make one with: thunder run <program> --record ${a._[0]}`); return Promise.resolve(2); }
  const total = trace.steps.length;
  const say = (s = '') => output.write(`${paint(s, useColor(output))}\n`);
  if (!total) { say('This recording has no steps (the program had nothing to run).'); return Promise.resolve(0); }
  if (a.step != null) {
    const n = Number(a.step);
    if (!Number.isInteger(n) || n < 1 || n > total) { console.error(`thunder replay: --step needs a number from 1 to ${total}.`); return Promise.resolve(2); }
    say(a.json ? JSON.stringify(trace.steps[n - 1], null, 2) : renderStep(trace, n - 1));
    return Promise.resolve(0);
  }
  if (a.json) { say(JSON.stringify(trace, null, 2)); return Promise.resolve(0); }

  // Step through: one step at a time, from the terminal or from piped lines.
  say(`⚡ Replaying ${trace.program}: ${total} step${total === 1 ? '' : 's'}, recorded with Thunder™ ${trace.thunder}.`);
  say('This replays a recording. Going back shows an earlier moment; it never undoes anything the program did.');
  say('');
  const rl = createInterface({ input, terminal: false });
  const it = rl[Symbol.asyncIterator]();
  let i = 0;
  const show = () => { say(renderStep(trace, i)); };
  const ask = async () => {
    output.write(`\n  ${i + 1 < total ? 'Enter/n next' : 'last step'} · b back · j N jump · q quit > `);
    const r = await it.next();
    if (r.done) return null;
    if (!input.isTTY) output.write(`${r.value}\n`);
    return r.value.trim();
  };
  return (async () => {
    show();
    for (;;) {
      const c = await ask();
      if (c == null || /^q/i.test(c)) break;
      if (c === '' || /^n/i.test(c)) { if (i + 1 < total) i++; else { say('\nThat was the last step.'); continue; } }
      else if (/^b/i.test(c)) { if (i > 0) i--; else { say('\nThis is the first step.'); continue; } }
      else if (/^j\s*\d+$/i.test(c)) { const n = Number(c.replace(/\D/g, '')); if (n >= 1 && n <= total) i = n - 1; else { say(`\nJump to a step from 1 to ${total}.`); continue; } }
      else { say('\nType Enter or n (next), b (back), j and a number (jump), or q (quit).'); continue; }
      say('');
      show();
    }
    rl.close();
    say('');
    if (trace.status !== 0) say(`The program stopped with a problem: ${trace.stderr.trim()}`);
    return 0;
  })();
}
