// thunder why: an AI agent's run explained in plain words (src/why.mjs, docs/why.md).
//   thunder why <run.json> [--step n] [--run id] [--json]
import { readFileSync } from 'node:fs';
import { explainRun, renderWhy, renderFull, renderStep, toolAnnotations, EFFECT_KINDS } from './why.mjs';

const USAGE = `usage: thunder why <run.json> [--steps] [--step n] [--tools tools.json] [--allow read,send] [--run id] [--json]
Explains what an AI agent did, from its OpenTelemetry record: what it was asked, each step, what it changed,
and what went wrong. Nothing is run and no AI is used. Read "-" for standard input.
  --steps              every step, with what happened just before the problem
  --tools tools.json   the agent's MCP tool list: what each tool declares it does beats guessing from its name
  --allow read,send    flag anything else (kinds: ${EFFECT_KINDS.join(', ')}); exits 1 if the run went beyond it`;

export function whyMain(argv) {
  const a = { _: [], json: false, step: null, run: null, steps: false, tools: null, allow: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--json') a.json = true;
    else if (x === '--step') a.step = argv[++i];
    else if (x === '--run') a.run = argv[++i];
    else if (x === '--steps') a.steps = true;
    else if (x === '--tools') a.tools = argv[++i];
    else if (x === '--allow') a.allow = String(argv[++i] ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    else if (x === '--help' || x === '-h') { console.log(USAGE); return 0; }
    else if (x.startsWith('--')) { console.error(`thunder why: there is no option ${x}.\n${USAGE}`); return 2; }
    else a._.push(x);
  }
  if (a._.length !== 1) { console.error(`thunder why: name one file with the agent's record.\n${USAGE}`); return 2; }
  if (a.step != null && !/^\d+$/.test(String(a.step))) { console.error('thunder why: --step needs a step number, like --step 3.'); return 2; }
  let text;
  try { text = readFileSync(a._[0] === '-' ? 0 : a._[0], 'utf8'); }
  catch (e) { console.error(`thunder why: couldn't open ${a._[0]}${e.code === 'ENOENT' ? ': there is no such file' : `: ${e.message}`}.`); return 2; }
  if (a.allow) { const bad = a.allow.filter((k) => !EFFECT_KINDS.includes(k)); if (bad.length || !a.allow.length) { console.error(`thunder why: --allow takes kinds from: ${EFFECT_KINDS.join(', ')}.${bad.length ? ` There is no "${bad[0]}".` : ''}`); return 2; } }
  let tools = null;
  if (a.tools) { try { tools = toolAnnotations(readFileSync(a.tools, 'utf8')); } catch (e) { console.error(`thunder why: couldn't read the tool list ${a.tools}: ${e.code === 'ENOENT' ? 'there is no such file' : e.message}.`); return 2; } }
  const r = explainRun(text, { run: a.run, tools, allow: a.allow });
  if (!r.ok) { console.error(`thunder why: ${r.why}`); return 2; }
  if (a.json) console.log(JSON.stringify(a.step != null ? r.steps.find((s) => s.n === Number(a.step)) ?? null : r, null, 2));
  else console.log(a.step != null ? renderStep(r, a.step) : a.steps ? renderFull(r) : renderWhy(r, { file: a._[0] === '-' ? '-' : a._[0] }));
  return r.notAllowed?.length ? 1 : 0;
}
