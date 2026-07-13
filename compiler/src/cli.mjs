#!/usr/bin/env node
// IntentLang CLI (MVP, deterministic). Commands: check | graph | proof | build.
//
// The emit stage writes the artifacts the ecosystem consumes to `.intent/<mission>/` by DEFAULT,
// NOT `dist/` , OpenThunder's scanner excludes dist/node_modules, so proof artifacts must live in a
// committed, scannable location. `.intent/` mirrors the ecosystem's dot-dir convention (.openthunder/).
//
//   intent check   <file>                      parse + semantic diagnostics (exit 1 on error)
//   intent graph   <file> [--out .intent]      contract-graph.json + architecture-graph.json
//   intent proof   <file> [--out .intent]      .intent-proof.json
//   intent build   <file> [--out .intent] [--no-ai]   all artifacts + docs + mermaid + testplan
//
// --no-ai is the default and only mode today; the flag is accepted for forward-compatibility.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, relative, dirname } from 'node:path';
import { parseIntent, slug, KNOWN_LENSES } from './parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256, COMPILER_VERSION,
} from './emit.mjs';
import { toSarif } from './sarif.mjs';
import { renderMarkdown, renderLensDoc, renderMermaid, renderTestplan } from './compile.mjs';
import { getCompletions, getHover, getCodeActions, autocorrectSource } from './intellisense.mjs';
import { startLspServer } from './lsp.mjs';
import { startMcpServer } from './mcp.mjs';
import { formatSource } from './format.mjs';
import { applyEdits } from './patch.mjs';
import { buildReport } from './report.mjs';
import { scanProject } from './scan.mjs';
import { guardianReport } from './guardian.mjs';
import { simulateChange } from './simulate.mjs';
import { verifyLedger, explain as ledgerExplain } from './ledger.mjs';
import { verifyDiff } from './verify-diff.mjs';
import { guardSummary } from './guard.mjs';
import { draftIntent } from './draft.mjs';
import { liftSource, liftAll, liftRepo, languageForFile } from './lift.mjs';
import { approveIntent, checkDrift, buildDriftHandoff } from './drift.mjs';
import { buildMissionIndex } from './atlas.mjs';
import { parseSelection, regionMetrics, selectCandidate } from './select.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { buildAtlas, searchAtlas, expandNode } from './intent-atlas.mjs';
import { diffGraphs, mergeGraphs } from './semantic-diff.mjs';
import { applyWaivers, governanceDiagnostics } from './governance.mjs';
import { exportIntent, EXPORT_FORMATS } from './exporters.mjs';
import { evaluateDecision, simulateLifecycle } from './runtime.mjs';
import { importIntent, importReport, detectFormat, IMPORT_FORMATS } from './importers.mjs';
import { runTests } from './testing.mjs';
import { evaluateOutcomes } from './outcome.mjs';
import { analyzeStyle } from './style.mjs';
import { intentProofJsonSchema, validateProof } from './proof-schema.mjs';
import { graphToSource } from './graph-source.mjs';
import { migrateGraph, validateGraph } from './migrate.mjs';
import { SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, DIAGNOSTIC_RULES, ALL_DIAGNOSTICS, intentGraphJsonSchema } from './intent-schema.mjs';
import { CLASSIFICATIONS } from './classification.mjs';
import {
  buildManifest, buildImplementationPrompt, resolveState, productionGate, adoptRegion, parseMarkers,
  contractHash, implementationHash, recordDecision, approvalFor, emptyApprovals, makeEvent,
} from './ai.mjs';
import { parseEventLog, serializeEventLog, recordEvent, timeline } from './ai-events.mjs';

// Recursively collect supported source files, skipping vendored / build dirs.
const LIFT_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.rs', '.pl', '.pm'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.intent', 'coverage', '.vercel']);
function collectFiles(root, acc = []) {
  for (const name of readdirSync(root)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, acc);
    else if (LIFT_EXTS.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

// Walk a directory for authored .intent files (skips the .intent/ output dir).
function collectIntents(root, acc = []) {
  const st = statSync(root);
  if (!st.isDirectory()) return root.endsWith('.intent') ? [root] : acc;
  for (const name of readdirSync(root)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    if (statSync(full).isDirectory()) collectIntents(full, acc);
    else if (name.endsWith('.intent')) acc.push(full);
  }
  return acc;
}

function parseArgs(argv) {
  const args = { _: [], out: '.intent', noAi: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') { args.out = argv[++i]; args.outExplicit = true; }
    else if (a === '--no-ai') args.noAi = true;
    else if (a === '--position') args.position = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--intent') args.intent = argv[++i];
    else if (a === '--by') args.by = argv[++i];
    else if (a === '--at') args.at = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--targets') args.targets = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--product') args.product = argv[++i];
    else if (a === '--allow-pending') args.allowPending = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--role') args.role = argv[++i];
    else if (a === '--note') args.note = argv[++i];
    else if (a === '--search') args.search = argv[++i];
    else if (a === '--expand') args.expand = argv[++i];
    else if (a === '--now') args.now = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--inputs') args.inputs = argv[++i];
    else if (a === '--events') args.events = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--decision') args.decision = argv[++i];
    else if (a === '--to') args.to = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--write' || a === '-w') args.write = true;
    else if (a === '--check') args.check = true;
    else if (a === '--schema') args.schema = true;
    else if (a === '--all') args.all = true;
    else if (a === '--ir') args.ir = argv[++i];
    else if (a === '--subject') args.subject = argv[++i];
    else if (a === '--lens') args.lens = argv[++i];
    else if (a === '--brief') args.brief = argv[++i];
    else if (a === '--after') args.after = argv[++i];
    else if (a === '--before') args.before = argv[++i];
    else if (a === '--edits') args.edits = argv[++i];
    else if (a === '--set-goal') args.setGoal = argv[++i];
    else if (a === '--add-guarantee') (args.addGuarantee ||= []).push(argv[++i]);
    else if (a === '--add-never') (args.addNever ||= []).push(argv[++i]);
    else if (a === '--remove-guarantee') (args.removeGuarantee ||= []).push(argv[++i]);
    else if (a === '--remove-never') (args.removeNever ||= []).push(argv[++i]);
    else args._.push(a);
  }
  return args;
}

const writeJson = (dir, name, obj) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(obj, null, 2) + '\n');
  return join(dir, name);
};
const writeText = (dir, name, text) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
  return join(dir, name);
};

// Persist an intent-ai-v1 event to the append-only sink at .intent/ai-events.jsonl.
// The durable audit trail RM / OpenThunder / Studio can replay. Returns the file path.
const AI_EVENT_LOG = 'ai-events.jsonl';
const sinkEvent = (root, event) => {
  const dir = join(root, '.intent');
  const path = join(dir, AI_EVENT_LOG);
  const log = existsSync(path) ? parseEventLog(readFileSync(path, 'utf8')) : undefined;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, serializeEventLog(recordEvent(log, event)));
  return path;
};
const readEventLog = (root) => {
  const path = join(root, '.intent', AI_EVENT_LOG);
  return existsSync(path) ? parseEventLog(readFileSync(path, 'utf8')) : parseEventLog('');
};

function load(file) {
  const source = readFileSync(file, 'utf8');
  const ast = parseIntent(source);
  return { source, ast, sourceHash: sha256(source), sourceFile: basename(file) };
}

function printDiagnostics(diags) {
  for (const d of diags) {
    const tag = d.waived ? ' (WAIVED)' : '';
    console.log(`  [${d.level}]${tag} ${d.code}: ${d.message}`);
    if (d.waived) console.log(`      waived by: ${d.waiver.approvedBy} , ${d.waiver.reason}`);
    else if (d.why) console.log(`      why: ${d.why}`);
    if (d.fix && d.fix.length) console.log(`      fix: ${d.fix[0].label}`);
  }
  // A waived diagnostic is on the record but does not fail the build (governed exception).
  const errors = diags.filter((d) => d.level === 'error' && !d.waived).length;
  const warnings = diags.filter((d) => d.level === 'warning' && !d.waived).length;
  const waived = diags.filter((d) => d.waived).length;
  console.log(`  ${errors} error(s), ${warnings} warning(s)${waived ? `, ${waived} waived` : ''}`);
  return errors;
}

const HELP = `intent , the deterministic IntentLang compiler (no AI required)

usage: intent <command> <file> [options]

Author & check
  init [Name]              scaffold a runnable starter mission (Name.intent)
  draft --brief <json|->   scaffold a rigorous intent draft + gap checklist from a brief
  check <file|dir> [--json|--format sarif]  diagnostics for one file, or gate a whole dir
  report [dir] [--json]     repo-wide intent health: severity + area counts, coverage
  scan [dir] [--json] [--ir <path>]  Scanner: intent -> Intent IR -> Fable findings -> risk themes
  guardian <before> <after>  drift: what changed, what risk, what to reverify, what learning is stale
  impact <base> <proposed>  Simulator: estimate a change's blast radius + risk BEFORE building it
  ledger <file.json> [--subject <id>]  verify the tamper-evident history + explain why/who/what changed
  guard <file> [--json]     preview the runtime guard (redacted fields, enforced decisions)
  fmt <file|dir> [--write|--check]  canonical formatting (whitespace only; comments kept)
  edit <file> [--edits <json|->] [--set-goal ..] [--add-guarantee ..] [--write]  structural edits, comments kept
  lsp                      start the Language Server (LSP over stdio, for editors)
  mcp                      start the MCP server (for AI coding agents; stdio)
  build <file>              docs, contract graph, test plan, and .intent-proof.json
  graph <file>              the canonical Intent Graph (intent-graph-v1)
  proof <file>              the .intent-proof.json artifact
  proof --schema            emit the canonical proof envelope JSON Schema (intent-proof-v1)
  verify <proof.json> [src]  confirm a proof is well-formed and still matches its source
  schema                    emit the canonical graph schema + diagnostic catalog
  explain <IL-CODE>         explain a diagnostic code (area, severity, what it blocks)
  rules [--json]            list the whole canonical diagnostic catalog
  notes <file> [--lens <lens>] [--json]  IntentLens: the compiled note blocks by lens (not verification)
  docs <file> [--lens <lens>] [--out <dir>]  render a mission as Markdown docs (per-audience with --lens)
  code-actions <file> [--json]  available quick-fixes, safety-graded (safe | reviewable)
  apply-fix <file> [--write]    apply the SAFE autocorrects (header aliases, stray colons)

Execute (no AI, no generated code)
  run <file> --inputs '<json>'      evaluate the decision(s) against inputs
  simulate <file> --events a,b,c    walk the lifecycle(s) over events
  test <file>                       run the in-file test blocks (case/scenario)
  outcomes <file>                   evaluate outcome contracts vs delivery results
  style <file>                      resolve style intents vs the canonical token space

Interop
  export <file> --format <dmn|bpmn|smv|jsonschema|openapi|tokens|mermaid|css|playwright>   render to a standard format
  import <file> [--format dmn|bpmn] [--json]                 lift DMN/BPMN into intent
  source <file|graph.json>                                   regenerate .intent from a graph
  migrate <graph.json> [--to <version>]                      upgrade a persisted graph
  validate <graph.json> [--json]                             check a graph is canonical (anti-fork)

Navigate & compare (over many missions)
  atlas <dir> [--search q | --expand id]   the whole-system Atlas
  index <dir>                              the Mission Atlas inventory
  diff <before> <after>                    semantic diff (by meaning)
  merge <base> <ours> <theirs>             deterministic 3-way semantic merge

Code <-> intent
  lift <file> [--from <lang>]   lift source code into inferred intent
  approve <file> --by <name>    approve intent (drift baseline)
  drift <file> --from <code>    check intent vs code drift
  verify-diff <intent> --after <code> [--before <code>]  gate a code change against its intent
  handoff <file>                the OpenThunder drift handoff

Common options: --out <dir>, --json, --no-ai. See https://intentlanguage.dev/docs`;

function main() {
  const [cmd, ...restArgv] = process.argv.slice(2);
  const args = parseArgs(restArgv);
  const file = args._[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    process.exit(cmd ? 0 : 2);
  }
  // `schema` takes no file (it emits the canonical Intent Graph schema).
  if (cmd === 'schema') {
    const out = {
      schemaVersion: SCHEMA_VERSION, nodeTypes: NODE_TYPES, relationshipTypes: RELATIONSHIP_TYPES,
      classifications: CLASSIFICATIONS, diagnostics: DIAGNOSTIC_RULES, jsonSchema: intentGraphJsonSchema(),
    };
    if (args.out && args.out !== '.intent') { const p = writeJson(args.out, 'intent-graph.schema.json', out); console.log(`wrote ${p.replace(process.cwd() + '/', '')}`); }
    else console.log(JSON.stringify(out, null, 2));
    return;
  }
  // `intent proof --schema` emits the canonical proof envelope JSON Schema (no file needed).
  // This is the "shared envelope" schema siblings sign (STW) and re-verify (RM/OT) against.
  if (cmd === 'proof' && args.schema) {
    console.log(JSON.stringify(intentProofJsonSchema(), null, 2));
    return;
  }
  // Verify a .intent-proof.json against its source: the source hash still matches (no
  // drift / tampering) and the proof's claims re-derive from the source.
  if (cmd === 'verify') {
    const proofPath = args._[0];
    if (!proofPath) { console.error('usage: intent verify <proof.json> [<source.intent>]'); process.exit(2); return; }
    let proof;
    try { proof = JSON.parse(readFileSync(proofPath, 'utf8')); } catch { console.error('intent verify: proof is not valid JSON'); process.exit(2); return; }
    const srcPath = args._[1] || proof.sourceFile;
    if (!srcPath || !existsSync(srcPath)) { console.error(`intent verify: source not found (${srcPath || 'none'}). Pass it: intent verify <proof.json> <source.intent>`); process.exit(2); return; }
    const src = readFileSync(srcPath, 'utf8');
    const ast = parseIntent(src);
    const diags = semanticDiagnostics(ast);
    const hashMatch = sha256(src) === proof.sourceHash;
    const semanticNow = !diags.some((d) => d.level === 'error');
    const semanticMatch = proof.verification ? semanticNow === !!proof.verification.semanticPassed : true;
    const guaranteesMatch = !Array.isArray(proof.guarantees) || proof.guarantees.length === (ast.guarantees || []).length;
    const neverMatch = !Array.isArray(proof.neverRules) || proof.neverRules.length === (ast.neverRules || []).length;
    // Structural gate: the envelope must be a well-formed intent-proof-v1 document first.
    const structure = validateProof(proof);
    const valid = structure.valid && hashMatch && semanticMatch && guaranteesMatch && neverMatch;
    const result = { schema: 'intent-verify-v1', proof: proofPath, source: srcPath, valid, checks: { wellFormed: structure.valid, hashMatch, semanticMatch, guaranteesMatch, neverMatch }, structureErrors: structure.errors };
    if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(valid ? 0 : 1); return; }
    console.log(`intent verify ${basename(proofPath)}: ${valid ? 'VALID' : 'FAILED'} (source ${basename(srcPath)})`);
    if (!structure.valid) { console.log(`  X proof is not a well-formed intent-proof-v1 document:`); for (const e of structure.errors) console.log(`      ${e.path || '(root)'}: ${e.message}`); }
    if (!hashMatch) console.log('  X source hash does not match , the source has changed since the proof was generated (drift or tampering).');
    if (!semanticMatch) console.log('  X the proof claims a different semantic result than the source produces now.');
    if (!guaranteesMatch) console.log('  X guarantee count differs from the proof.');
    if (!neverMatch) console.log('  X never-rule count differs from the proof.');
    if (valid) console.log(`  ok proof matches source (hash + ${(proof.guarantees || []).length} guarantee(s), ${(proof.neverRules || []).length} never-rule(s)).`);
    process.exit(valid ? 0 : 1);
    return;
  }

  // Explain a diagnostic code from the canonical catalog. `intent explain IL-DEC-001`.
  if (cmd === 'explain') {
    const code = file;
    if (!code) { console.error('usage: intent explain <IL-CODE>'); process.exit(2); return; }
    const rule = ALL_DIAGNOSTICS.find((r) => r.ruleId.toLowerCase() === code.toLowerCase());
    if (args.json) { console.log(JSON.stringify(rule || { ruleId: code, found: false }, null, 2)); process.exit(rule ? 0 : 1); return; }
    if (!rule) { console.error(`intent explain: "${code}" is not in the diagnostic catalog. Run "intent rules" for the full list.`); process.exit(1); return; }
    console.log(`${rule.ruleId}  (area: ${rule.area})`);
    console.log(`  ${rule.summary}`);
    console.log(`  severity: ${rule.severity}${rule.blocks && rule.blocks.length ? `  |  blocks: ${rule.blocks.join(', ')}` : '  |  does not block a phase'}`);
    return;
  }

  // The whole canonical diagnostic catalog (IL owns it; editors/CI/OT consume it).
  if (cmd === 'rules') {
    if (args.json) { console.log(JSON.stringify(ALL_DIAGNOSTICS, null, 2)); return; }
    const byArea = {};
    for (const r of ALL_DIAGNOSTICS) (byArea[r.area] ||= []).push(r);
    console.log(`intent rules: ${ALL_DIAGNOSTICS.length} diagnostics in ${Object.keys(byArea).length} areas\n`);
    for (const area of Object.keys(byArea).sort()) {
      console.log(`${area}`);
      for (const r of byArea[area]) {
        const blocks = r.blocks && r.blocks.length ? `blocks ${r.blocks.join(', ')}` : 'non-blocking';
        console.log(`  ${r.ruleId.padEnd(16)} [${r.severity}, ${blocks}]  ${r.summary}`);
      }
      console.log();
    }
    return;
  }

  // `intent notes <file> [--lens <lens>] [--json]` , the IntentLens report: the compiled
  // semantic comments (`note <lens>:`) grouped by lens, each with its target and source
  // line. Notes explain meaning for a reader; they are NEVER verification.
  if (cmd === 'notes') {
    if (!file) { console.error('usage: intent notes <file> [--lens <lens>] [--json]'); process.exit(2); return; }
    const ast = parseIntent(readFileSync(file, 'utf8'));
    let notes = ast.notes || [];
    if (args.lens) notes = notes.filter((n) => n.lens === args.lens);
    if (args.json) {
      console.log(JSON.stringify({ schema: 'intent-notes-v1', mission: ast.mission || null, lens: args.lens || null, count: notes.length, notes }, null, 2));
      return;
    }
    const scope = args.lens ? ` (lens: ${args.lens})` : '';
    console.log(`intent notes ${basename(file)}${scope}: ${notes.length} note${notes.length === 1 ? '' : 's'}`);
    const known = new Set(KNOWN_LENSES);
    const byLens = {};
    for (const n of notes) (byLens[n.lens] ||= []).push(n);
    for (const lens of Object.keys(byLens).sort()) {
      console.log(`\n${lens}${known.has(lens) ? '' : '  (unknown lens)'}`);
      for (const n of byLens[lens]) {
        const label = n.targetKind === 'mission' ? (ast.mission || 'mission') : n.targetPath.split('.').slice(3).join('.');
        console.log(`  [${n.targetKind}] ${label}  , line ${n.sourceSpan.line}`);
        for (const line of String(n.text).split('\n')) console.log(`    ${line.trim()}`);
      }
    }
    return;
  }

  // `intent docs <file> [--lens <lens>] [--out <dir>]` , render a mission as Markdown docs.
  // With --lens, produce an audience-specific doc with that lens's notes woven inline.
  if (cmd === 'docs') {
    if (!file) { console.error('usage: intent docs <file> [--lens <lens>] [--out <dir>]'); process.exit(2); return; }
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const md = args.lens ? renderLensDoc(ast, args.lens) : renderMarkdown(ast);
    if (args.outExplicit) {
      const suffix = args.lens ? `.${args.lens}` : '';
      const p = writeText(args.out, `${slug(ast.mission)}${suffix}.md`, md.endsWith('\n') ? md : md + '\n');
      console.log(`wrote ${p.replace(process.cwd() + '/', '')}`);
      return;
    }
    console.log(md);
    return;
  }

  // `intent code-actions <file> [--json]` , the available quick-fixes, each safety-graded
  // (safe autocorrects + reviewable diagnostic fixes). The IDE lightbulb's data source.
  if (cmd === 'code-actions') {
    if (!file) { console.error('usage: intent code-actions <file> [--json]'); process.exit(2); return; }
    const source = readFileSync(file, 'utf8');
    const actions = getCodeActions(source, semanticDiagnostics(parseIntent(source)));
    if (args.json) { console.log(JSON.stringify({ schema: 'intent-code-actions-v1', count: actions.length, actions }, null, 2)); return; }
    console.log(`intent code-actions ${basename(file)}: ${actions.length} action${actions.length === 1 ? '' : 's'}`);
    for (const a of actions) console.log(`  [${a.safety}] ${a.kind}${a.line ? ` (line ${a.line})` : ''}  ${a.title}`);
    return;
  }

  // `intent apply-fix <file> [--write]` , apply the SAFE autocorrects only (header aliases,
  // stray colons). Reviewable quick-fixes are reported, never applied blindly.
  if (cmd === 'apply-fix') {
    if (!file) { console.error('usage: intent apply-fix <file> [--write]'); process.exit(2); return; }
    const source = readFileSync(file, 'utf8');
    const { fixed, changes } = autocorrectSource(source);
    const reviewable = getCodeActions(source, semanticDiagnostics(parseIntent(source))).filter((a) => a.safety !== 'safe');
    if (args.json) { console.log(JSON.stringify({ applied: changes, reviewableRemaining: reviewable.length, changed: fixed !== source }, null, 2)); }
    else {
      console.log(`intent apply-fix ${basename(file)}: ${changes.length} safe fix${changes.length === 1 ? '' : 'es'}${args.write ? ' applied' : ' (dry run; pass --write)'}`);
      for (const c of changes) console.log(`  line ${c.line}: "${c.from}" -> "${c.to}"  [${c.rule}]`);
      if (reviewable.length) console.log(`  ${reviewable.length} reviewable quick-fix(es) left for a human (run: intent code-actions ${basename(file)})`);
    }
    if (args.write && fixed !== source) { writeFileSync(file, fixed); if (!args.json) console.log(`  wrote ${basename(file)}`); }
    return;
  }

  // Language Server (LSP over stdio) for editors. Long-running; no file argument.
  if (cmd === 'lsp') {
    startLspServer();
    return; // keep the process alive on stdin
  }

  // MCP server (Model Context Protocol over stdio) , makes IntentLang a native tool for AI
  // coding agents. Long-running; no file argument. Point an MCP client at `intent mcp`.
  if (cmd === 'mcp') {
    startMcpServer();
    return; // keep the process alive on stdin
  }

  // Scaffold a runnable starter mission (deterministic, no AI). `intent init [Name]`.
  if (cmd === 'init') {
    const name = (file || 'Mission').replace(/\.intent$/i, '');
    const target = join(args.out && args.out !== '.intent' ? args.out : '.', `${name}.intent`);
    if (existsSync(target) && !args.force) {
      console.error(`intent init: ${target} already exists (use --force to overwrite).`);
      process.exit(1); return;
    }
    const starter = `mission ${name}
use product

goal
  Describe what this mission must achieve.

guarantee an example property that must always hold
  because state why it matters
  verify a test that proves it

never
  do something this mission must never do

# A runnable decision. Try: intent run ${name}.intent --inputs '{"age":20}'
decision Example
  inputs
    age
  rule adult
    when age >= 18
    return Allowed
  default
    return Blocked

# Tests live in the file. Try: intent test ${name}.intent
test Example
  case adult
    given age 20
    expect Allowed
  case minor
    given age 10
    expect Blocked
`;
    if (target.includes('/')) mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, starter);
    console.log(`intent init: wrote ${target}`);
    console.log(`  next: intent check ${target}  |  intent run ${target} --inputs '{"age":20}'  |  intent test ${target}`);
    return;
  }

  if (!file && cmd !== 'draft') {
    console.error(`intent ${cmd}: missing a file argument. Run "intent help" for usage.`);
    process.exit(2);
  }
  // IntentLift: lift source CODE into inferred .intent drafts (not intent parsing).
  if (cmd === 'lift') {
    // Repo mode: walk a directory, lift each file, emit drafts + a repo summary.
    if (args.from === 'repo') {
      const root = file;
      const files = collectFiles(root).map((f) => ({ file: relative(root, f), source: readFileSync(f, 'utf8') }));
      // Per-file language auto-detection (unless --from overrides). "repo" is not a language.
      const override = args.from && args.from !== 'repo' ? args.from : undefined;
      const res = liftRepo(files, { language: override });
      const outputs = res.missions.map((m) => ({
        mission: m.mission,
        file: args.out ? join(args.out, m.outName) : null,
        confidence: m.summary.confidence, reviewed: false,
        evidenceCount: m.summary.evidenceCount, unknowns: m.summary.unknowns,
      }));
      if (args.json) {
        const { missions, ...rest } = res; void missions;
        console.log(JSON.stringify({ sourceRoot: root, ...rest, outputs }, null, 2));
        return;
      }
      if (args.out) {
        for (const m of res.missions) writeText(args.out, m.outName, m.intentText);
        console.log(`intent lift repo ${root} -> ${res.missionsGenerated} mission(s) in ${args.out}`);
        console.log(`  confidence: ${JSON.stringify(res.confidenceSummary)} | ${res.unknowns} unknown(s) total`);
      } else {
        console.log(`intent lift repo ${root}: ${res.missionsGenerated} mission(s)`);
        for (const m of res.missions) console.log(`  ${m.mission} (${m.summary.confidence}) <- ${m.sourceFile}`);
      }
      return;
    }

    // --all: lift EVERY function into its own mission (the Intent Atlas view of a file).
    if (args.all) {
      const src = readFileSync(file, 'utf8');
      const res = liftAll(src, { language: args.from || languageForFile(file), file: basename(file) });
      if (!res.ok) { console.error(res.error); process.exit(1); }
      if (args.json) { console.log(JSON.stringify(res, null, 2)); return; }
      console.log(`intent lift --all ${basename(file)}: ${res.count} mission(s) inferred`);
      for (const m of res.missions) console.log(`  ${m.mission}  (${m.fn}, confidence ${m.confidence})`);
      return;
    }

    // Single-file mode.
    const src = readFileSync(file, 'utf8');
    const res = liftSource(src, { language: args.from || 'typescript', file: basename(file) });
    if (!res.ok) { console.error(res.error); process.exit(1); }
    if (args.json) { console.log(JSON.stringify(res.summary, null, 2)); return; }
    if (args.out) {
      const p = writeText(args.out, `${slug(res.lifted.mission)}.intent`, res.intentText);
      console.log(`intent lift ${basename(file)} -> ${p.replace(process.cwd() + '/', '')}`);
    } else {
      console.log(res.intentText);
    }
    printDiagnostics(res.diagnostics);
    return;
  }

  // Approve an inferred/reviewed intent: reviewed:true + source hash + reviewer.
  if (cmd === 'approve') {
    const text = readFileSync(file, 'utf8');
    const res = approveIntent(text, { approvedBy: args.by || null, approvedAt: args.at || null });
    // args.out defaults to '.intent'; approve writes back to the file unless a real --out was given.
    const target = args.out && args.out !== '.intent' ? args.out : file;
    writeFileSync(target, res.text);
    console.log(`intent approve ${basename(file)} -> reviewed: true (${res.approval.source_hash.slice(0, 24)}...)`);
    return;
  }

  // Handoff: emit the il-to-ot-drift-v1 pack OpenThunder consumes for deep verification.
  if (cmd === 'handoff') {
    const text = readFileSync(file, 'utf8');
    const pack = buildDriftHandoff(text, { generatedAt: args.at || null });
    const out = JSON.stringify(pack, null, 2);
    if (args.out && args.out !== '.intent') {
      const p = writeText(args.out, `${slug(pack.mission)}.drift-handoff.json`, out);
      console.log(`intent handoff ${basename(file)} -> ${p.replace(process.cwd() + '/', '')} (kind ${pack.kind}, approved ${pack.approved})`);
    } else {
      console.log(out);
    }
    return;
  }

  // Drift: does the implementation still satisfy the approved intent?
  if (cmd === 'drift') {
    if (!args.intent) { console.error('usage: intent drift <codeFile> --intent <file.intent> [--from <lang>] [--json]'); process.exit(2); }
    const intentText = readFileSync(args.intent, 'utf8');
    const codeText = readFileSync(file, 'utf8');
    const language = args.from && args.from !== 'repo' ? args.from : languageForFile(file);
    const res = checkDrift(intentText, codeText, { language });
    if (args.json) { console.log(JSON.stringify(res, null, 2)); }
    else {
      console.log(`intent drift: ${res.status.toUpperCase()} (${res.summary.blocking} blocking)`);
      for (const f of res.findings) console.log(`  [${f.level}] ${f.code}: ${f.message}`);
    }
    process.exit(res.status === 'drift' ? 1 : 0);
  }

  // Intent AI implementations (intent-ai-v1): declare + list + manifest + prompt handoff.
  if (cmd === 'ai') {
    const sub = args._[0];
    const target = args._[1] || '.';
    if (sub === 'list') {
      const root = target;
      const parsed = collectIntents(root).map((f) => {
        const source = readFileSync(f, 'utf8');
        return { path: relative(root, f), source, ast: parseIntent(source) };
      });
      const manifest = buildManifest(parsed, { projectId: args.product });
      if (args.json) { console.log(JSON.stringify(manifest, null, 2)); return; }
      console.log(`intent ai list ${root}: ${manifest.summary.total} AI implementation(s)`);
      for (const im of manifest.implementations) {
        console.log(`  ${im.id.padEnd(28)} ${im.status.padEnd(9)} risk:${im.risk} approval:${im.approval} scope:${im.scope}`);
      }
      console.log(`  ${JSON.stringify(manifest.summary.byStatus)} | ${manifest.summary.approvalRequired} require approval`);
      console.log('  note: PENDING = declared, no target region yet. OpenThunder verifies + advances state.');
      return;
    }
    if (sub === 'generate') {
      // Provider-neutral: emit the structured handoff prompt for one mission's .intent file.
      const file = args._[1];
      if (!file) { console.error('usage: intent ai generate <file.intent> [--from <lang>]'); process.exit(2); return; }
      const ast = parseIntent(readFileSync(file, 'utf8'));
      if (!ast.implementation) { console.error(`intent ai generate: ${basename(file)} has no "implement with ai" block.`); process.exit(2); return; }
      const prompt = buildImplementationPrompt(ast, { language: args.from || 'typescript' });
      if (args.out && args.out !== '.intent') { const p = writeText(args.out, `${slug(ast.mission)}.prompt.md`, prompt); console.log(`wrote ${p.replace(process.cwd() + '/', '')}`); }
      else console.log(prompt);
      return;
    }
    if (sub === 'gate') {
      // Production gate: resolve each implementation's real state (declaration + region + proof).
      const root = target;
      const parsed = collectIntents(root).map((f) => ({ file: f, ast: parseIntent(readFileSync(f, 'utf8')) }));
      const manifest = buildManifest(parsed.map((p) => ({ path: relative(root, p.file), source: '', ast: p.ast })), { projectId: args.product });
      const apf = join(root, '.intent', 'ai-approvals.json');
      const approvals = existsSync(apf) ? JSON.parse(readFileSync(apf, 'utf8')) : emptyApprovals();
      const resolved = manifest.implementations.map((im) => {
        const ast = parsed.find((p) => (p.ast.implementation?.id || slug(p.ast.mission || '')) === im.id)?.ast;
        let region = null;
        if (im.targetLocation) {
          const tp = join(root, im.targetLocation);
          if (existsSync(tp)) region = parseMarkers(readFileSync(tp, 'utf8')).regions.find((r) => r.id === im.id) || null;
        }
        const pf = join(root, im.proofLocation);
        const proof = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
        const st = resolveState({ ast, region, proof, approval: approvalFor(approvals, im.id) });
        return { id: im.id, status: st.status, approvalRequired: im.approval !== 'none', reasons: st.reasons };
      });
      const gate = productionGate(resolved, { allowPending: args.allowPending });
      if (args.json) { console.log(JSON.stringify({ ...gate, mode: args.mode || 'production', resolved }, null, 2)); process.exit(gate.ok ? 0 : 1); return; }
      console.log(`intent ai gate ${root} (${args.mode || 'production'}): ${gate.ok ? 'PASS' : 'BLOCKED'} , ${resolved.length} implementation(s)`);
      for (const r of resolved) console.log(`  ${r.id.padEnd(28)} ${r.status}${r.reasons?.[0] ? ` , ${r.reasons[0].code}: ${r.reasons[0].message}` : ''}`);
      if (!gate.ok) console.log(`  ${gate.blocking.length} implementation(s) block production. Use --allow-pending for dev builds.`);
      process.exit(gate.ok ? 0 : 1);
      return;
    }
    if (sub === 'adopt') {
      // Rewrite an AI-managed region to human-owned, preserving provenance.
      const file = args._[1]; const id = args._[2];
      if (!file || !id) { console.error('usage: intent ai adopt <targetFile> <id> [--from <lang>]'); process.exit(2); return; }
      const code = readFileSync(file, 'utf8');
      const res = adoptRegion(code, id, args.from || languageForFile(file));
      if (!res) { console.error(`intent ai adopt: no AI-managed region "${id}" in ${basename(file)}.`); process.exit(2); return; }
      writeFileSync(file, res.code);
      console.log(`intent ai adopt ${id} -> human-owned (origin="ai" ownership="human") in ${basename(file)}`);
      return;
    }
    if (sub === 'approve' || sub === 'reject') {
      // Record a human decision bound to the reviewed hashes. Refuses stale/unverified.
      const root = args._[1] || '.'; const id = args._[2];
      if (!id) { console.error(`usage: intent ai ${sub} <dir> <id> --by <reviewer> [--role <role>] [--note <note>]`); process.exit(2); return; }
      const parsed = collectIntents(root).map((f) => ({ file: f, ast: parseIntent(readFileSync(f, 'utf8')) }));
      const manifest = buildManifest(parsed.map((p) => ({ path: relative(root, p.file), source: '', ast: p.ast })), {});
      const im = manifest.implementations.find((x) => x.id === id);
      const ast = parsed.find((p) => (p.ast.implementation?.id || slug(p.ast.mission || '')) === id)?.ast;
      if (!im || !ast) { console.error(`intent ai ${sub}: no implementation "${id}" found under ${root}.`); process.exit(2); return; }
      let region = null;
      if (im.targetLocation && existsSync(join(root, im.targetLocation))) region = parseMarkers(readFileSync(join(root, im.targetLocation), 'utf8')).regions.find((r) => r.id === id) || null;
      const pf = join(root, im.proofLocation);
      const proof = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
      const state = resolveState({ ast, region, proof });
      if (!region) { console.error(`INTENT-AI-501: cannot ${sub} "${id}" , no generated region yet (state ${state.status}).`); process.exit(1); return; }
      if (sub === 'approve' && !['VERIFIED', 'VERIFIED_AWAITING_APPROVAL'].includes(state.status)) {
        console.error(`INTENT-AI-502: cannot approve "${id}" in state ${state.status}${state.reasons?.[0] ? ` (${state.reasons[0].code})` : ''}. Approve only verified, non-stale work.`);
        process.exit(1); return;
      }
      const apf = join(root, '.intent', 'ai-approvals.json');
      const store = existsSync(apf) ? JSON.parse(readFileSync(apf, 'utf8')) : emptyApprovals();
      const at = new Date().toISOString();
      const { store: next, error } = recordDecision(store, id, {
        decision: sub === 'approve' ? 'approved' : 'rejected',
        by: args.by, role: args.role, note: args.note,
        contractHash: contractHash(ast), implementationHash: implementationHash(region.code), at,
      });
      if (error) { console.error(`intent ai ${sub}: ${error}`); process.exit(2); return; }
      writeJson(join(root, '.intent'), 'ai-approvals.json', next);
      const event = makeEvent(sub === 'approve' ? 'IntentAiImplementationApproved' : 'IntentAiImplementationRejected', {
        implementationId: id, missionId: ast.mission, contractHash: contractHash(ast), implementationHash: implementationHash(region.code),
        timestamp: at, toolVersion: 'intentlang', actorType: 'human', actorId: args.by || null, previousStatus: state.status,
        newStatus: sub === 'approve' ? 'APPROVED' : 'REJECTED',
      });
      const logPath = sinkEvent(root, event);
      console.log(`intent ai ${sub} ${id} by ${args.by || '(anonymous)'}${args.role ? ` [${args.role}]` : ''} -> ${sub === 'approve' ? 'APPROVED' : 'REJECTED'} (bound to current hashes)`);
      console.log(`  logged ${event.type} to ${logPath.replace(process.cwd() + '/', '')}`);
      if (args.json) console.log(JSON.stringify(event, null, 2));
      return;
    }
    // `intent ai events [dir] [--subject <implId>] [--json]` , read the append-only audit log.
    if (sub === 'events') {
      const root = args._[1] || '.';
      const log = readEventLog(root);
      const events = args.subject ? log.events.filter((e) => e.implementationId === args.subject) : log.events;
      if (args.json) { console.log(JSON.stringify({ ...log, events }, null, 2)); return; }
      console.log(`intent ai events ${root}: ${events.length} event${events.length === 1 ? '' : 's'}${args.subject ? ` for ${args.subject}` : ''}`);
      for (const e of events) {
        const who = e.actorId ? ` by ${e.actorId}` : '';
        const move = e.previousStatus || e.newStatus ? `  (${e.previousStatus || '?'} -> ${e.newStatus || '?'})` : '';
        console.log(`  ${e.timestamp || '(no time)'}  ${e.type}${who}${e.implementationId ? `  [${e.implementationId}]` : ''}${move}`);
      }
      return;
    }
    if (sub === 'select') {
      // Deterministic candidate selection: AI generates N candidates in
      // .intent/candidates/<id>/; IL picks by the mission's selection policy.
      const root = args._[1] || '.'; const id = args._[2];
      if (!id) { console.error('usage: intent ai select <dir> <id> [--json]'); process.exit(2); return; }
      const ast = collectIntents(root).map((f) => parseIntent(readFileSync(f, 'utf8')))
        .find((a) => (a.implementation?.id || slug(a.mission || '')) === id);
      const policy = parseSelection(ast?.selection || []);
      const cdir = join(root, '.intent', 'candidates', id);
      if (!existsSync(cdir)) { console.error(`intent ai select: no candidates at ${relative(process.cwd(), cdir)}.`); process.exit(2); return; }
      const candidates = readdirSync(cdir).filter((n) => !n.endsWith('.proof.json') && !n.endsWith('.json')).map((name) => {
        const code = readFileSync(join(cdir, name), 'utf8');
        const region = parseMarkers(code).regions.find((r) => r.id === id);
        const proofFile = join(cdir, name.replace(/\.[^.]+$/, '') + '.proof.json');
        let checksPassed;
        if (existsSync(proofFile)) { const pr = JSON.parse(readFileSync(proofFile, 'utf8')); checksPassed = Object.values(pr.checks || {}).every((v) => v !== 'failed'); }
        return { id: name, metrics: regionMetrics(region ? region.code : code), checksPassed };
      });
      const result = selectCandidate(candidates, policy);
      if (args.json) { console.log(JSON.stringify({ ...result, policy }, null, 2)); return; }
      console.log(`intent ai select ${id}: ${result.winner ? result.winner.id : '(none eligible)'} wins (${result.eligibleCount}/${candidates.length} eligible)`);
      console.log(`  policy: prefer ${result.prefer.map((p) => `${p.direction} ${p.metric}`).join(', ')}${policy.requireAllChecks ? '; require all checks' : ''}`);
      for (const c of result.ranking) console.log(`  ${c.id.padEnd(20)} ${JSON.stringify(c.metrics)}${c.checksPassed === false ? ' [checks FAILED]' : ''}`);
      return;
    }
    console.error(`intent ai ${sub || ''}: IL supports list | generate | gate | adopt | approve | reject | select. OpenThunder runs verification.`);
    process.exit(2);
    return;
  }

  // Semantic diff: compare two snapshots (dirs or .intent files) by meaning.
  if (cmd === 'diff') {
    const b = args._[0]; const a = args._[1];
    if (!b || !a) { console.error('usage: intent diff <before-dir|file> <after-dir|file> [--json]'); process.exit(2); return; }
    const snap = (p) => {
      if (statSync(p).isDirectory()) return buildAtlas(collectIntents(p).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8')))));
      return buildIntentGraph(parseIntent(readFileSync(p, 'utf8')));
    };
    const diff = diffGraphs(snap(b), snap(a));
    if (args.json) { console.log(JSON.stringify(diff, null, 2)); return; }
    console.log(`intent diff ${b} -> ${a}: +${diff.summary.added} / -${diff.summary.removed} / ~${diff.summary.changed} node(s), +${diff.summary.relationshipsAdded} / -${diff.summary.relationshipsRemoved} edge(s)`);
    if (Object.keys(diff.summary.addedByType).length) console.log(`  added: ${JSON.stringify(diff.summary.addedByType)}`);
    if (Object.keys(diff.summary.removedByType).length) console.log(`  removed: ${JSON.stringify(diff.summary.removedByType)}`);
    for (const c of diff.changedNodes.slice(0, 8)) console.log(`  ~ ${c.type} ${c.id}`);
    if (diff.invalidatedApprovals.length) console.log(`  approvals invalidated by the change: ${diff.invalidatedApprovals.join(', ')}`);
    return;
  }

  // Semantic merge: 3-way merge of two concurrent Intent versions over a common base.
  if (cmd === 'merge') {
    const [bp, op, tp] = [args._[0], args._[1], args._[2]];
    if (!bp || !op || !tp) { console.error('usage: intent merge <base> <ours> <theirs> [--json]'); process.exit(2); return; }
    const snap = (p) => statSync(p).isDirectory()
      ? buildAtlas(collectIntents(p).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8')))))
      : buildIntentGraph(parseIntent(readFileSync(p, 'utf8')));
    const res = mergeGraphs(snap(bp), snap(op), snap(tp));
    if (args.json) { console.log(JSON.stringify(res, null, 2)); process.exit(res.clean ? 0 : 1); return; }
    console.log(`intent merge: ${res.clean ? 'CLEAN' : 'CONFLICTS'} , ${res.summary.nodes} node(s), ${res.summary.conflicts} conflict(s)`);
    for (const c of res.conflicts) console.log(`  conflict: ${c.type} ${c.id} (changed differently on both sides)`);
    process.exit(res.clean ? 0 : 1);
    return;
  }

  // Intent Runtime: EXECUTE intent , evaluate decisions against concrete inputs.
  if (cmd === 'run') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    let inputs = {};
    if (args.inputs) { try { inputs = JSON.parse(args.inputs); } catch { console.error('intent run: --inputs must be JSON'); process.exit(2); return; } }
    let decisions = ast.decisions || [];
    if (args.decision) decisions = decisions.filter((d) => slug(d.name) === slug(args.decision));
    if (!decisions.length) { console.error('intent run: no decision to run' + (args.decision ? ` matching "${args.decision}"` : '')); process.exit(2); return; }
    const runs = decisions.map((d) => evaluateDecision(d, inputs));
    if (args.json) { console.log(JSON.stringify(runs.length === 1 ? runs[0] : runs, null, 2)); return; }
    for (const r of runs) {
      console.log(`decision ${r.decision}: ${r.result === null ? '(undecided)' : r.result}${r.matched ? `  [rule: ${r.matched}]` : ''}`);
      for (const t of r.trace) console.log(`  ${t.matched ? '>' : ' '} ${t.rule || '(rule)'}${t.when ? `: when ${t.when}` : ''}${t.error ? `  !! ${t.error}` : t.matched ? '  (matched)' : ''}`);
    }
    process.exit(runs.some((r) => r.undecided || !r.ok) ? 1 : 0);
    return;
  }

  // Outcome contracts: evaluate each commitment against the delivery result that measures it.
  if (cmd === 'outcomes') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const r = evaluateOutcomes(ast);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.missed > 0 ? 1 : 0); return; }
    if (r.total === 0) { console.log(`intent outcomes ${basename(file)}: no outcome contracts found.`); return; }
    console.log(`intent outcomes ${basename(file)}: ${r.met} met, ${r.missed} missed, ${r.pending} pending`);
    for (const e of r.evaluations) {
      const tag = e.status === 'met' ? 'MET   ' : e.status === 'missed' ? 'MISSED' : 'PENDING';
      const detail = e.comparable ? `actual ${e.actual} vs target ${e.target} (${e.direction})${e.improvement != null ? `, ${e.improvement >= 0 ? '+' : ''}${e.improvement} vs baseline` : ''}` : `no measured result yet (target ${e.target})`;
      console.log(`  ${tag}  ${e.contract}  , ${detail}`);
    }
    process.exit(r.missed > 0 ? 1 : 0);
    return;
  }

  // Style intent: resolve brand/visual language against the canonical token address space.
  if (cmd === 'style') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const r = analyzeStyle(ast);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.diagnostics.some((d) => d.severity === 'blocker') ? 1 : 0); return; }
    if (r.styleIntents.length === 0) { console.log(`intent style ${basename(file)}: no style intents found.`); return; }
    console.log(`intent style ${basename(file)}: ${r.styleIntents.length} style intent(s)`);
    for (const s of r.styleIntents) {
      const a11y = s.accessibility ? `${s.accessibility.target} (${s.accessibility.classification}, verified=${s.accessibility.verified})` : 'no target';
      console.log(`  ${s.name}  , a11y ${a11y}, ${s.tokens.length} token(s)${s.appliesTo ? `, applies_to ${s.appliesTo}` : ''}`);
      for (const t of s.tokens) console.log(`      ${t.canonical ? ' ' : '?'} ${t.path} = ${t.value ?? '(unset)'}`);
    }
    for (const d of r.diagnostics) console.log(`  [${d.severity}] ${d.ruleId}: ${d.message}`);
    process.exit(0);
    return;
  }

  // Self-verifying intent: run the `test` blocks in a .intent file (decisions + lifecycles).
  if (cmd === 'test') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const r = runTests(ast);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); return; }
    if (r.total === 0) { console.log(`intent test ${basename(file)}: no test blocks found.`); return; }
    console.log(`intent test ${basename(file)}: ${r.passed}/${r.total} passed`);
    for (const c of r.results) {
      const detail = c.error ? `  ${c.error}`
        : c.kind === 'lifecycle' ? `expected ${c.expected ?? '(any)'}, got ${c.actual} (valid=${c.valid})`
        : `expected ${c.expected}, got ${c.actual}`;
      console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.target} / ${c.case}${c.pass ? '' : `  , ${detail}`}`);
    }
    process.exit(r.ok ? 0 : 1);
    return;
  }

  // Intent Runtime: SIMULATE a lifecycle against a sequence of events.
  if (cmd === 'simulate') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const lcs = ast.lifecycles || [];
    if (!lcs.length) { console.error('intent simulate: no lifecycle in this mission'); process.exit(2); return; }
    const events = args.events || [];
    const sims = lcs.map((lc) => simulateLifecycle(lc, events));
    if (args.json) { console.log(JSON.stringify(sims.length === 1 ? sims[0] : sims, null, 2)); return; }
    for (const s of sims) {
      console.log(`lifecycle ${s.lifecycle}: ${s.path.join(' -> ')}  (${s.valid ? 'valid' : 'INVALID'}${s.endedTerminal ? ', terminal' : ''})`);
      for (const st of s.steps) console.log(`  ${st.ok ? 'ok ' : 'X  '} ${st.from} --${st.event}--> ${st.to}${st.reason ? `  (${st.reason})` : ''}`);
    }
    process.exit(sims.some((s) => !s.valid) ? 1 : 0);
    return;
  }

  // Schema migration: upgrade a persisted Intent Graph JSON to the current (or a target)
  // schema version, then validate the result against the canonical vocabulary.
  // Validate an Intent Graph against the canonical vocabulary (consumer anti-fork self-check).
  if (cmd === 'validate') {
    const raw = readFileSync(file, 'utf8');
    let graph;
    try { graph = JSON.parse(raw); } catch { console.error('intent validate: input is not valid JSON'); process.exit(2); return; }
    if (!graph || !Array.isArray(graph.nodes)) { console.error('intent validate: not an Intent Graph (no nodes[])'); process.exit(2); return; }
    const v = validateGraph(graph);
    if (args.json) { console.log(JSON.stringify(v, null, 2)); process.exit(v.valid ? 0 : 1); return; }
    console.log(`intent validate ${basename(file)}: ${v.valid ? 'VALID' : `${v.issues.length} issue(s)`} (${v.version})`);
    for (const i of v.issues) console.log(`  [${i.code}] ${i.message}${i.id ? ` (${i.id})` : ''}`);
    process.exit(v.valid ? 0 : 1);
    return;
  }

  if (cmd === 'migrate') {
    const raw = readFileSync(file, 'utf8');
    let graph;
    try { graph = JSON.parse(raw); } catch { console.error('intent migrate: input is not valid JSON'); process.exit(2); return; }
    if (!graph || !Array.isArray(graph.nodes)) { console.error('intent migrate: not an Intent Graph (no nodes[])'); process.exit(2); return; }
    let result;
    try { result = migrateGraph(graph, args.to ? { to: args.to } : {}); }
    catch (e) { console.error(`intent migrate: ${e instanceof Error ? e.message : e}`); process.exit(2); return; }
    const v = validateGraph(result.graph);
    if (args.json) { console.log(JSON.stringify({ ...result, validation: v }, null, 2)); process.exit(v.valid ? 0 : 1); return; }
    console.log(`intent migrate: ${result.from} -> ${result.to} (${result.migrated ? result.applied.length + ' step(s)' : 'already current'})`);
    for (const a of result.applied) console.log(`  applied ${a.from} -> ${a.to}: ${a.description}`);
    console.log(`  validation: ${v.valid ? 'OK' : `${v.issues.length} issue(s)`}`);
    for (const i of v.issues.slice(0, 10)) console.log(`    [${i.code}] ${i.message}`);
    if (args.out && args.out !== '.intent') console.log(`  wrote ${writeText(args.out, `${slug((graph.nodes.find((n) => n.type === 'Mission')?.title) || 'graph')}.graph.json`, JSON.stringify(result.graph, null, 2))}`);
    process.exit(v.valid ? 0 : 1);
    return;
  }

  // Graph -> source: regenerate .intent from an Intent Graph (a graph JSON, or an .intent
  // file which is parsed + built first , a normalizing round-trip).
  if (cmd === 'source') {
    const raw = readFileSync(file, 'utf8');
    let graph;
    if (file.endsWith('.json')) {
      try { graph = JSON.parse(raw); } catch { console.error('intent source: input .json is not valid JSON'); process.exit(2); return; }
      if (!graph || !Array.isArray(graph.nodes)) { console.error('intent source: JSON is not an Intent Graph (no nodes[])'); process.exit(2); return; }
    } else {
      graph = buildIntentGraph(parseIntent(raw));
    }
    const src = graphToSource(graph);
    if (args.out && args.out !== '.intent') {
      const base = (graph.nodes.find((n) => n.type === 'Mission')?.title) || basename(file).replace(/\.[^.]+$/, '');
      console.log(`intent source: wrote ${writeText(args.out, `${slug(base)}.intent`, src)}`);
    } else {
      process.stdout.write(src);
    }
    return;
  }

  // Import adapters: lift an external DMN / BPMN document back into IntentLang source.
  if (cmd === 'import') {
    const xml = readFileSync(file, 'utf8');
    const fmt = args.format || detectFormat(xml);
    if (!fmt || !IMPORT_FORMATS.includes(fmt)) {
      console.error(`intent import: could not detect format; pass --format <${IMPORT_FORMATS.join('|')}>`);
      process.exit(2); return;
    }
    const report = importReport(xml, fmt);
    if (report == null) { console.error(`intent import: unsupported format "${fmt}"`); process.exit(2); return; }
    if (args.json) { console.log(JSON.stringify(report, null, 2)); return; }
    const src = report.source;
    if (args.out && args.out !== '.intent') {
      const base = basename(file).replace(/\.[^.]+$/, '');
      const p = writeText(args.out, `${slug(base)}.intent`, src);
      console.log(`intent import: wrote ${p}`);
    } else {
      process.stdout.write(src.endsWith('\n') ? src : src + '\n');
    }
    // Fidelity warnings go to stderr, so stdout stays clean for piping the source.
    for (const w of report.warnings) console.error(`intent import: [${w.code}] ${w.message}`);
    return;
  }

  // Export adapters: render decisions/lifecycles to DMN / BPMN / NuSMV (interop).
  if (cmd === 'export') {
    const fmt = args.format;
    if (!fmt || !EXPORT_FORMATS.includes(fmt)) {
      console.error(`usage: intent export <file> --format <${EXPORT_FORMATS.join('|')}> [--out <dir>]`);
      process.exit(2); return;
    }
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const res = exportIntent(ast, fmt);
    if (args.out && args.out !== '.intent') {
      const name = `${slug(ast.mission || basename(file, '.intent'))}.${res.ext}`;
      const p = writeText(args.out, name, res.content);
      console.log(`intent export: wrote ${p}`);
    } else {
      process.stdout.write(res.content);
    }
    return;
  }

  // Intent Atlas: the navigable/searchable whole-system map over the Intent Graph.
  if (cmd === 'atlas') {
    const root = file || '.';
    const graphs = collectIntents(root).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8'))));
    const atlas = buildAtlas(graphs, { product: args.product });
    if (args.search) {
      const hits = searchAtlas(atlas, args.search, { type: args.from });
      if (args.json) { console.log(JSON.stringify(hits, null, 2)); return; }
      console.log(`intent atlas search "${args.search}": ${hits.length} hit(s)`);
      for (const h of hits) console.log(`  ${h.type.padEnd(18)} ${h.id}${h.title ? `  , ${h.title}` : ''}`);
      return;
    }
    if (args.expand) {
      const ex = expandNode(atlas, args.expand);
      if (!ex) { console.error(`intent atlas: no node "${args.expand}".`); process.exit(2); return; }
      if (args.json) { console.log(JSON.stringify(ex, null, 2)); return; }
      console.log(`${ex.node.type} ${ex.node.id}${ex.node.title ? `  , ${ex.node.title}` : ''}`);
      for (const e of ex.out) console.log(`  -> ${e.rel.padEnd(16)} ${e.node.id}`);
      for (const e of ex.inbound) console.log(`  <- ${e.rel.padEnd(16)} ${e.node.id}`);
      return;
    }
    if (args.json) { console.log(JSON.stringify(atlas, null, 2)); return; }
    console.log(`intent atlas ${root}: ${atlas.overview.missions} mission(s), ${atlas.overview.nodes} node(s), ${atlas.overview.relationships} edge(s)`);
    console.log(`  ${JSON.stringify(atlas.overview.byType)}`);
    for (const m of atlas.missions) console.log(`  mission  ${m.id}${m.title ? `  , ${m.title}` : ''}`);
    console.log('  expand a node: intent atlas . --expand <id> | search: --search <query>');
    return;
  }

  // Mission Atlas index: aggregate every .intent under a directory into one inventory.
  if (cmd === 'index') {
    const root = file;
    let intentFiles;
    try {
      intentFiles = collectIntents(root).map((f) => ({ path: relative(root, f), source: readFileSync(f, 'utf8') }));
    } catch (e) {
      console.error(`intent index: cannot read "${root}": ${e instanceof Error ? e.message : e}`);
      process.exit(2);
      return;
    }
    const index = buildMissionIndex(intentFiles, { product: args.product });
    if (args.json) { console.log(JSON.stringify(index, null, 2)); return; }
    console.log(`intent index ${root}: ${index.summary.missions} mission(s)`);
    console.log(`  ${JSON.stringify(index.summary.byArea)}`);
    for (const m of index.missions) {
      console.log(`  ${m.mission.padEnd(24)} ${String(m.risk).padEnd(7)} G:${m.guarantees} N:${m.neverRules} verify:${m.verification}${m.reviewed ? ' reviewed' : ''}`);
    }
    console.log(`  ${index.summary.declaredFull} declared-full, ${index.summary.declaredPartial} partial, ${index.summary.unverified} unverified, ${index.summary.highRisk} high-risk`);
    console.log('  note: verification is DECLARED, not proven. Test/drift status needs OpenThunder.');
    return;
  }

  // `intent verify-diff <intent> --after <code> [--before <code>]` , the AI-loop gate: prove
  // deterministically which of the intent's guarantees/never-rules a code change upholds or breaks.
  if (cmd === 'verify-diff') {
    const intentText = readFileSync(file, 'utf8');
    if (!args.after) { console.error('usage: intent verify-diff <intent> --after <codeFile> [--before <codeFile>] [--from <lang>]'); process.exit(2); return; }
    const after = readFileSync(args.after, 'utf8');
    const before = args.before ? readFileSync(args.before, 'utf8') : null;
    const language = args.from || languageForFile(args.after);
    const r = verifyDiff(intentText, { before, after, language });
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); return; }
    console.log(`intent verify-diff ${basename(file)} vs ${basename(args.after)}: ${r.verdict} (${r.blocking} blocking, ${r.summary.regressions} regression(s))`);
    for (const f of r.findings) {
      const tag = f.code === 'INTENT_VERIFY_NEVER_VIOLATED' ? 'VIOLATION' : f.regression ? 'REGRESSION' : f.level.toUpperCase();
      console.log(`  [${tag}] ${f.message}${f.line ? `  (line ${f.line})` : ''}`);
    }
    if (r.ok) console.log('  ok the change upholds the declared contract (deterministic checks; tests + humans still own correctness).');
    process.exit(r.ok ? 0 : 1);
    return;
  }

  // `intent draft --brief <json|->` , scaffold a rigorous intent draft from a structured brief,
  // plus a review checklist of what a human must still fill in. Prints the draft; --write saves it.
  if (cmd === 'draft') {
    const briefPath = args.brief || (cmd === 'draft' && file && file.endsWith('.json') ? file : null);
    if (!briefPath) { console.error('usage: intent draft --brief <brief.json|-> [--write <out.intent>]'); process.exit(2); return; }
    const raw = briefPath === '-' ? readFileSync(0, 'utf8') : readFileSync(briefPath, 'utf8');
    let brief;
    try { brief = JSON.parse(raw); } catch { console.error('intent draft: --brief is not valid JSON'); process.exit(2); return; }
    const r = draftIntent(brief);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return; }
    if (args.write) { writeFileSync(args.write, r.source); console.error(`intent draft: wrote ${args.write}`); }
    else process.stdout.write(r.source);
    if (r.review.length) { console.error('\nreview (fill these in , the draft is a proposal, not verified):'); for (const x of r.review) console.error(`  - ${x.message}`); }
    return;
  }

  // `intent guard <file>` , preview what a runtime guard compiled from this intent enforces:
  // which fields it redacts (secrets/PII) and which decisions it can gate at runtime.
  if (cmd === 'guard') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const g = guardSummary(ast);
    if (args.json) { console.log(JSON.stringify(g, null, 2)); return; }
    console.log(`intent guard ${basename(file)}:`);
    console.log(`  redacts fields   ${g.redactsFields.length ? g.redactsFields.join(', ') : '(none declared secret/PII)'}`);
    console.log(`  enforces decisions ${g.enforcesDecisions.length ? g.enforcesDecisions.join(', ') : '(none)'}`);
    if (g.neverRules.length) { console.log('  never rules:'); for (const n of g.neverRules) console.log(`    - ${n}`); }
    console.log('  use: import { compileGuard } from "@skillstech/intentlang/core"');
    return;
  }

  // `intent ledger <file.json>` , verify the tamper-evident chain, and explain a subject's history
  // (why it was built, who approved it, what was assumed/corrected/verified, which risks accepted).
  if (cmd === 'ledger') {
    if (!file) { console.error('usage: intent ledger <ledger.json> [--subject <id>] [--json]'); process.exit(2); return; }
    let ledger;
    try { ledger = JSON.parse(readFileSync(file, 'utf8')); } catch { console.error('intent ledger: not valid JSON'); process.exit(2); return; }
    const chain = verifyLedger(ledger);
    if (args.subject) {
      const ex = ledgerExplain(ledger, args.subject);
      if (args.json) { console.log(JSON.stringify({ chain, ...ex }, null, 2)); process.exit(chain.valid ? 0 : 1); return; }
      console.log(`intent ledger ${basename(file)} , ${args.subject}  (chain ${chain.valid ? 'VALID' : 'BROKEN'})`);
      if (ex.why.length) { console.log('  why built:'); for (const w of ex.why) console.log(`    - ${w}`); }
      if (ex.approvedBy.length) console.log(`  approved by: ${ex.approvedBy.join(', ')}`);
      if (ex.assumptions.length) console.log(`  assumptions: ${ex.assumptions.length}`);
      if (ex.corrections.length) console.log(`  corrections (inferred intent fixed): ${ex.corrections.length}`);
      if (ex.acceptedRisks.length) console.log(`  accepted risks: ${ex.acceptedRisks.length}`);
      if (ex.verifications.length) console.log(`  verifications: ${ex.verifications.length}`);
      console.log(`  change history: ${ex.changeCount} entries`);
      process.exit(chain.valid ? 0 : 1);
      return;
    }
    if (args.json) { console.log(JSON.stringify(chain, null, 2)); process.exit(chain.valid ? 0 : 1); return; }
    const n = (ledger.entries || []).length;
    console.log(`intent ledger ${basename(file)}: ${n} entr${n === 1 ? 'y' : 'ies'}, chain ${chain.valid ? 'VALID (tamper-evident)' : `BROKEN at #${chain.brokenAt} , ${chain.reason}`}`);
    process.exit(chain.valid ? 0 : 1);
    return;
  }

  // `intent impact <base> <proposed>` , the Simulator: estimate a change's impact BEFORE building it
  // , the deterministic blast radius, the risk it would introduce, contradictions, release risk.
  if (cmd === 'impact') {
    const baseArg = args._[0]; const propArg = args._[1];
    if (!baseArg || !propArg) { console.error('usage: intent impact <base.intent|dir> <proposed.intent|dir> [--json]'); process.exit(2); return; }
    const collect = (p) => (existsSync(p) && statSync(p).isDirectory() ? collectIntents(p) : [p]).map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') }));
    const r = simulateChange(collect(baseArg), collect(propArg));
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.summary.safe ? 0 : 1); return; }
    console.log(`intent impact: ${r.summary.safe ? 'SAFE' : 'REVIEW'}  (${baseArg} -> ${propArg})`);
    console.log(`  change touches ${r.changedNodes} node(s); ripples to ${r.deterministicImpact.total} dependent(s)`);
    const bt = Object.entries(r.deterministicImpact.byType);
    if (bt.length) console.log('  deterministic impact by type:  ' + bt.map(([t, ns]) => `${ns.length} ${t}`).join(', '));
    if (r.ruleDerivedRisk.length) { console.log(`  risk it would introduce (${r.ruleDerivedRisk.length}):`); for (const f of r.ruleDerivedRisk.slice(0, 6)) console.log(`    [${f.severity}] ${f.ruleId} , ${f.detected}`); }
    if (r.contradictions.length) console.log(`  contradictions: ${r.contradictions.length}`);
    if (r.releaseRisks.length) console.log(`  release risk: ${r.releaseRisks.length} blocking finding(s)`);
    if (r.unknownImpact.length) console.log(`  unknown impact: ${r.unknownImpact.length} node(s) where the ripple can't be traced deterministically`);
    process.exit(r.summary.safe ? 0 : 1);
    return;
  }

  // `intent guardian <before> <after>` , drift detection: what a change did to the intent , which
  // intent it affects, what risk it introduced, what must be reverified, what learning is stale.
  if (cmd === 'guardian') {
    const beforeArg = args._[0]; const afterArg = args._[1];
    if (!beforeArg || !afterArg) { console.error('usage: intent guardian <before.intent|dir> <after.intent|dir> [--json]'); process.exit(2); return; }
    const collect = (p) => (existsSync(p) && statSync(p).isDirectory() ? collectIntents(p) : [p]).map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') }));
    const r = guardianReport(collect(beforeArg), collect(afterArg));
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.verdict === 'needs-attention' ? 1 : 0); return; }
    const c = r.changed;
    console.log(`intent guardian: ${r.verdict.toUpperCase()}  (${beforeArg} -> ${afterArg})`);
    console.log(`  changed    +${c.nodesAdded} / -${c.nodesRemoved} / ~${c.nodesChanged} nodes, +${c.relationshipsAdded} / -${c.relationshipsRemoved} relationships`);
    if (r.affectedIntent.length) console.log(`  affected   ${r.affectedIntent.map((n) => n.title || n.id).join(', ')}`);
    if (r.introducedRisk.length) { console.log(`  introduced risk (${r.introducedRisk.length}):`); for (const f of r.introducedRisk.slice(0, 6)) console.log(`    [${f.severity}] ${f.ruleId} , ${f.detected}`); }
    if (r.resolvedRisk.length) console.log(`  resolved risk: ${r.resolvedRisk.length}`);
    if (r.mustReverify.length) { console.log(`  must reverify (${r.mustReverify.length}):`); for (const m of r.mustReverify.slice(0, 6)) console.log(`    ${m.type} ${m.title || m.id} , ${m.reason}`); }
    if (r.staleLearning.length) { console.log('  learning to refresh:'); for (const l of r.staleLearning.slice(0, 6)) console.log(`    ${l.scope} , ${l.reason}`); }
    process.exit(r.verdict === 'needs-attention' ? 1 : 0);
    return;
  }

  // `intent scan [dir]` , the Scanner spine: intent -> Intent IR -> explainable Fable findings ->
  // risk themes. Deterministic, no AI. --json for the machine report; --ir writes the merged IR.
  if (cmd === 'scan') {
    const root = file || '.';
    const targets = existsSync(root) && statSync(root).isDirectory() ? collectIntents(root) : [root];
    const result = scanProject(targets.map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') })));
    if (args.ir) { writeFileSync(args.ir, JSON.stringify(result.ir, null, 2)); console.error(`intent scan: wrote Intent IR (${result.ir.nodes.length} nodes) to ${args.ir}`); }
    if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); return; }
    const s = result.bySeverity;
    console.log(`intent scan ${root}: ${result.totals.findings} finding(s) across ${result.totals.missions} mission(s) in ${result.totals.files} file(s)`);
    console.log(`  severity   ${s.blocker} blocker, ${s.error} error, ${s.warning} warning, ${s.info} info  ,  Intent IR: ${result.ir.nodes.length} nodes`);
    if (result.risks.length) {
      console.log('  risk themes:');
      for (const r of result.risks) console.log(`    ${String(r.count).padStart(3)}  ${r.category}${r.blocker ? `  (${r.blocker} blocker)` : ''}`);
    }
    if (result.remediationSequence.length) {
      console.log('  highest-impact remediation first:');
      for (const r of result.remediationSequence.slice(0, 5)) console.log(`    [${r.severity}] ${r.ruleId} (${r.count}x) , ${r.remediation}`);
    }
    process.exit(result.ok ? 0 : 1);
    return;
  }

  // `intent report [dir]` , a repo-wide intent health summary (aggregates every .intent file).
  // Distinct from `check` (pass/fail gate): counts by severity + area, top codes, and coverage.
  if (cmd === 'report') {
    const root = file || '.';
    const targets = existsSync(root) && statSync(root).isDirectory() ? collectIntents(root) : [root];
    const rep = buildReport(targets.map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') })));
    if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(0); return; }
    const c = rep.coverage;
    console.log(`intent report ${root}: ${rep.totals.missions} mission(s) in ${rep.totals.files} file(s), ${rep.totals.diagnostics} diagnostic(s)`);
    console.log(`  severity   ${rep.bySeverity.blocker} blocker, ${rep.bySeverity.error} error, ${rep.bySeverity.warning} warning, ${rep.bySeverity.info} info`);
    console.log('  coverage   '
      + `guarantees verified ${c.guaranteesVerified}/${c.guarantees}${c.guaranteeVerifyRate != null ? ` (${c.guaranteeVerifyRate}%)` : ''}, `
      + `missions with tests ${c.missionsWithTests}/${rep.totals.missions}${c.testCoverageRate != null ? ` (${c.testCoverageRate}%)` : ''}, `
      + `outcomes contracted ${c.outcomeContracts}/${c.outcomes}${c.outcomeContractRate != null ? ` (${c.outcomeContractRate}%)` : ''}`);
    if (rep.topCodes.length) {
      console.log('  top codes  ' + rep.topCodes.slice(0, 5).map((t) => `${t.code} (${t.count})`).join(', '));
    }
    const worst = rep.files.filter((f) => f.error > 0 || f.warning > 0).slice(0, 8);
    if (worst.length) {
      console.log('  files needing attention:');
      for (const f of worst) console.log(`    ${f.error ? 'ERR' : 'warn'}  ${f.file}  , ${f.error} error(s), ${f.warning} warning(s)`);
    }
    process.exit(0);
    return;
  }

  // `intent check <file|dir> --format sarif` emits a SARIF 2.1.0 log so IntentLang
  // diagnostics show up natively in GitHub/GitLab code scanning and SARIF-aware IDEs.
  // This is a REPORT (exit 0); gate the build with a plain `intent check .` step.
  if (cmd === 'check' && args.format === 'sarif') {
    const targets = existsSync(file) && statSync(file).isDirectory() ? collectIntents(file) : [file];
    const reports = targets.map((f) => {
      const a = parseIntent(readFileSync(f, 'utf8'));
      let diags = semanticDiagnostics(a);
      if (a.waivers && a.waivers.length) {
        const now = args.now || null;
        diags = [...applyWaivers(diags, a.waivers, { now }).diagnostics, ...governanceDiagnostics(a.waivers, diags, { now })];
      }
      return { file: relative(process.cwd(), f) || f, diagnostics: diags.filter((d) => !d.waived) };
    });
    console.log(JSON.stringify(toSarif(reports, { version: COMPILER_VERSION }), null, 2));
    return;
  }

  // `intent check <dir>` recurses and gates every .intent file (self-contained CI, no
  // wrapper script needed). Errors fail the run; warnings do not.
  if (cmd === 'check' && existsSync(file) && statSync(file).isDirectory()) {
    const files = collectIntents(file);
    const reports = files.map((f) => {
      const a = parseIntent(readFileSync(f, 'utf8'));
      let diags = semanticDiagnostics(a);
      if (a.waivers && a.waivers.length) {
        const now = args.now || null;
        diags = [...applyWaivers(diags, a.waivers, { now }).diagnostics, ...governanceDiagnostics(a.waivers, diags, { now })];
      }
      const errors = diags.filter((d) => d.level === 'error' && !d.waived).length;
      return { file: relative(file, f) || f, mission: a.mission || null, errors, warnings: diags.filter((d) => d.level === 'warning' && !d.waived).length, ok: errors === 0 };
    });
    const failed = reports.filter((r) => !r.ok);
    if (args.json) {
      console.log(JSON.stringify({ schema: 'intent-check-batch-v1', root: file, total: reports.length, failed: failed.length, ok: failed.length === 0, files: reports }, null, 2));
      process.exit(failed.length ? 1 : 0);
    }
    console.log(`intent check ${file}: ${reports.length - failed.length}/${reports.length} passed`);
    for (const r of reports) console.log(`  ${r.ok ? 'ok ' : 'ERR'} ${r.file}${r.errors ? ` , ${r.errors} error(s)` : ''}${r.warnings ? ` (${r.warnings} warning(s))` : ''}`);
    process.exit(failed.length ? 1 : 0);
  }

  // `intent edit <file>` , apply structural field edits (intent-patch-v1) to the source,
  // preserving comments + formatting. Edits come from --edits <json|-> and/or convenience
  // flags. Prints the result to stdout, or --write applies it in place.
  if (cmd === 'edit') {
    const src = readFileSync(file, 'utf8');
    const edits = [];
    if (args.edits) {
      const raw = args.edits === '-' ? readFileSync(0, 'utf8') : readFileSync(args.edits, 'utf8');
      let parsed;
      try { parsed = JSON.parse(raw); } catch { console.error('intent edit: --edits is not valid JSON'); process.exit(2); return; }
      if (!Array.isArray(parsed)) { console.error('intent edit: --edits must be a JSON array of edit ops'); process.exit(2); return; }
      edits.push(...parsed);
    }
    if (args.setGoal) edits.push({ op: 'setField', field: 'goal', value: args.setGoal });
    for (const s of args.addGuarantee || []) edits.push({ op: 'addGuarantee', statement: s });
    for (const s of args.addNever || []) edits.push({ op: 'addNever', statement: s });
    for (const m of args.removeGuarantee || []) edits.push({ op: 'removeGuarantee', match: m });
    for (const m of args.removeNever || []) edits.push({ op: 'removeNever', match: m });
    if (!edits.length) { console.error('intent edit: no edits given. Use --edits <file|-> or --set-goal/--add-guarantee/...'); process.exit(2); return; }

    const result = applyEdits(src, edits);
    if (args.json) { console.log(JSON.stringify({ ...result, source: undefined, applied: result.applied.length, skipped: result.skipped }, null, 2)); }
    for (const s of result.skipped) console.error(`  skipped: ${s.reason}`);
    if (args.write) {
      if (result.source !== src.replace(/\r\n?/g, '\n')) writeFileSync(file, result.source);
      console.error(`intent edit ${basename(file)}: applied ${result.applied.length}, skipped ${result.skipped.length}.`);
    } else if (!args.json) {
      process.stdout.write(result.source);
    }
    process.exit(0);
    return;
  }

  // `intent fmt <file|dir>` , canonical formatting (whitespace only; content + comments
  // preserved). Prints to stdout, or --write in place, or --check for CI (exit 1 if any
  // file is not already formatted).
  if (cmd === 'fmt') {
    const targets = statSync(file).isDirectory() ? collectIntents(file) : [file];
    const unformatted = [];
    let changed = 0;
    for (const f of targets) {
      const src = readFileSync(f, 'utf8');
      const formatted = formatSource(src);
      const same = src.replace(/\r\n?/g, '\n') === formatted;
      if (args.check) { if (!same) unformatted.push(relative('.', f) || f); continue; }
      if (args.write) { if (!same) { writeFileSync(f, formatted); changed++; } continue; }
      process.stdout.write(formatted);
    }
    if (args.check) {
      if (unformatted.length) { console.error(`intent fmt --check: ${unformatted.length} file(s) not formatted:`); for (const u of unformatted) console.error(`  ${u}`); process.exit(1); }
      console.log('intent fmt --check: all formatted.');
      process.exit(0);
    }
    if (args.write) console.log(`intent fmt: formatted ${changed} file(s), ${targets.length - changed} already clean.`);
    return;
  }

  const { source, ast, sourceHash, sourceFile } = load(file);
  const generatedAt = new Date().toISOString();
  const diagnostics = semanticDiagnostics(ast);
  const outDir = join(args.out, slug(ast.mission || basename(file, '.intent')));

  // Production gate: a build --mode production refuses to proceed while an AI
  // implementation is not shippable. --allow-pending is for dev builds only.
  if (cmd === 'build' && args.mode === 'production' && ast.implementation) {
    const id = ast.implementation.id || slug(ast.mission || '');
    const pf = join(args.out, 'proofs', `${id}.json`);
    const proof = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
    const st = resolveState({ ast, region: null, proof });
    const approvalRequired = !!ast.implementation.approval && ast.implementation.approval !== 'none';
    const gate = productionGate([{ ...st, id, approvalRequired }], { allowPending: args.allowPending });
    if (!gate.ok) {
      const r = gate.blocking[0];
      console.error(`INTENT-AI-501: production build blocked , implementation "${id}" is ${r.status}${r.reasons?.[0] ? ` (${r.reasons[0].code})` : ''}. Verify + approve, or use --allow-pending for a dev build.`);
      process.exit(1);
    }
  }

  if (cmd === 'completions' || cmd === 'hover') {
    const [ln, coln] = (args.position || '1:1').split(':').map(Number);
    const out = cmd === 'completions'
      ? getCompletions(source, { line: ln, column: coln })
      : getHover(source, { line: ln, column: coln });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'check') {
    // Governance (Gap 5): waivers downgrade matching blockers to on-the-record exceptions.
    let diags = diagnostics;
    if (ast.waivers && ast.waivers.length) {
      const now = args.now || null;
      const applied = applyWaivers(diagnostics, ast.waivers, { now });
      const gov = governanceDiagnostics(ast.waivers, diagnostics, { now });
      diags = [...applied.diagnostics, ...gov];
    }
    const errors = diags.filter((d) => d.level === 'error' && !d.waived).length;
    if (args.json) {
      // Machine-readable diagnostics for editors, CI, and OpenThunder.
      const out = {
        schema: 'intent-check-v1',
        file: sourceFile,
        mission: ast.mission || null,
        ok: errors === 0,
        summary: {
          errors,
          warnings: diags.filter((d) => d.level === 'warning' && !d.waived).length,
          info: diags.filter((d) => d.level === 'info').length,
          waived: diags.filter((d) => d.waived).length,
        },
        diagnostics: diags.map((d) => ({
          level: d.level, code: d.code, message: d.message,
          ...(d.why ? { why: d.why } : {}),
          ...(d.severity ? { severity: d.severity } : {}),
          ...(Array.isArray(d.blocks) && d.blocks.length ? { blocks: d.blocks } : {}),
          ...(d.waived ? { waived: true, waiver: d.waiver } : {}),
        })),
      };
      console.log(JSON.stringify(out, null, 2));
      process.exit(errors > 0 ? 1 : 0);
    }
    console.log(`intent check ${sourceFile} (mission: ${ast.mission})`);
    process.exit(printDiagnostics(diags) > 0 ? 1 : 0);
  }

  const generated = [];
  if (cmd === 'graph' || cmd === 'build') {
    generated.push(writeJson(outDir, 'contract-graph.json', buildContractGraph(ast, generatedAt)));
    generated.push(writeJson(outDir, 'architecture-graph.json', buildArchitectureGraph(ast, generatedAt)));
    generated.push(writeJson(outDir, 'implementation-plan.json', buildImplementationPlan(ast, generatedAt)));
    generated.push(writeJson(outDir, 'intent-graph.json', buildIntentGraph(ast)));
  }
  if (cmd === 'build') {
    generated.push(writeText(outDir, `${slug(ast.mission)}.md`, renderMarkdown(ast)));
    generated.push(writeText(outDir, `${slug(ast.mission)}.mmd`, renderMermaid(ast)));
    generated.push(writeText(outDir, `${slug(ast.mission)}.testplan.md`, renderTestplan(ast)));
  }
  if (cmd === 'proof' || cmd === 'build' || cmd === 'graph') {
    const proof = buildProof(ast, {
      sourceFile, sourceHash, generatedAt,
      targetsRequested: args.targets || ast.targets,
      targetsGenerated: generated.map((p) => p.replace(process.cwd() + '/', '')),
      diagnostics,
    });
    generated.push(writeJson(outDir, '.intent-proof.json', proof));
  }
  if (!['graph', 'proof', 'build'].includes(cmd)) {
    console.error(`unknown command: ${cmd}`);
    process.exit(2);
  }
  console.log(`intent ${cmd} ${sourceFile} -> ${outDir}`);
  for (const p of generated) console.log(`  wrote ${p.replace(process.cwd() + '/', '')}`);
  printDiagnostics(diagnostics);
}

main();
