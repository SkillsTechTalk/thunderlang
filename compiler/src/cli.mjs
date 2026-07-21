#!/usr/bin/env node
// ThunderLang CLI (MVP, deterministic). Commands: check | graph | proof | build.
//
// The emit stage writes the artifacts the ecosystem consumes to `.intent/<mission>/` by DEFAULT,
// NOT `dist/` , OpenThunder's scanner excludes dist/node_modules, so proof artifacts must live in a
// committed, scannable location. `.intent/` mirrors the ecosystem's dot-dir convention (.openthunder/).
//
//   thunder check   <file>                      parse + semantic diagnostics (exit 1 on error)
//   thunder graph   <file> [--out .intent]      contract-graph.json + architecture-graph.json
//   intent proof   <file> [--out .intent]      .thunder-proof.json
//   intent build   <file> [--out .intent] [--no-ai]   all artifacts + docs + mermaid + testplan
//
// --no-ai is the default and only mode today; the flag is accepted for forward-compatibility.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, relative, dirname } from 'node:path';
import { parseIntent, slug, subjectName, KNOWN_LENSES } from './parse.mjs';
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
import { VIEWS } from './scan-queries.mjs';
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
import { buildIntentGraph, safeGraph } from './intent-graph.mjs';
import { buildAtlas, searchAtlas, expandNode } from './intent-atlas.mjs';
import { buildFocusGraph, intentBrief, makeScope } from './focus.mjs';
import { comprehensionLevel, comprehensionReport, LEVELS as COMPREHENSION_LEVELS } from './comprehension.mjs';
import { twelveFactorReport } from './twelve-factor.mjs';
import { GENERATORS } from './codegen.mjs';
import { changeReport } from './changes.mjs';
import { execSync, spawnSync } from 'node:child_process';
import { diffGraphs, mergeGraphs } from './semantic-diff.mjs';
import { applyWaivers, governanceDiagnostics } from './governance.mjs';
import { exportIntent, EXPORT_FORMATS } from './exporters.mjs';
import { evaluateDecision, simulateLifecycle } from './runtime.mjs';
import { runProperties } from './property.mjs';
import { runMutations } from './mutate.mjs';
import { buildConformance } from './conformance.mjs';
import { semanticCoverage } from './coverage.mjs';
import { runTypescriptTarget } from './target-ts.mjs';
import { runPythonTarget, pythonAvailable } from './target-py.mjs';
import { runCSharpTarget, csharpAvailable } from './target-cs.mjs';
import { runJavaTarget, javaAvailable } from './target-java.mjs';

// The live-target registry: one entry per canonical target that can be compiled + executed.
// `available()` is a (cached) toolchain probe; TypeScript/JS runs in-process so it is always live.
const LIVE_TARGETS = [
  { key: 'typescript', run: runTypescriptTarget, available: () => true },
  { key: 'python', run: runPythonTarget, available: pythonAvailable },
  { key: 'csharp', run: runCSharpTarget, available: csharpAvailable },
  { key: 'java', run: runJavaTarget, available: javaAvailable },
];
const LIVE_BY_KEY = new Map(LIVE_TARGETS.map((t) => [t.key, t]));
LIVE_BY_KEY.set('javascript', LIVE_BY_KEY.get('typescript')); // js is the same in-process runner
// All canonical targets available to run right now (used by --all-targets).
const availableLiveTargets = () => LIVE_TARGETS.filter((t) => t.available());
const RUNNABLE_TARGETS = new Set(['typescript', 'ts', 'javascript', 'js', 'python', 'py', 'csharp', 'cs', 'c#', 'java']);
// Map an alias to its canonical target key + the adapter that executes it.
const TARGET_ALIASES = { ts: 'typescript', js: 'javascript', py: 'python', cs: 'csharp', 'c#': 'csharp' };
const canonicalTarget = (t) => TARGET_ALIASES[String(t).toLowerCase()] || String(t).toLowerCase();
// Execute a live target. Returns { "Test / case": actual } or null if the target can't run
// (e.g. the runtime/SDK is not installed). Unknown targets return null.
function runLiveTarget(ast, target) {
  const entry = LIVE_BY_KEY.get(canonicalTarget(target));
  return entry ? entry.run(ast) : null;
}
import { importIntent, importReport, detectFormat, IMPORT_FORMATS } from './importers.mjs';
import { runTests } from './testing.mjs';
import { toEvidenceEvents, verifyDiffToEvidence, conformToEvidence, driftToEvidence } from './evidence.mjs';
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
// Kept in sync with lift.mjs languageForFile(): every language the lift adapters support,
// so repo-mode discovery matches the advertised multi-language lift surface.
const LIFT_EXTS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs', '.pl', '.pm', '.t',
  '.py', '.pyi', '.java', '.cs', '.go', '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.c', '.h',
  '.php', '.rb', '.kt', '.kts', '.scala', '.sc', '.ex', '.exs',
];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.intent', 'coverage', '.vercel']);
// ThunderLang source files. `.thunder` is the canonical public extension; `.tl` is an
// accepted shorthand; `.intent` stays supported so legacy IntentLang sources keep working.
const SOURCE_EXTS = ['.thunder', '.tl', '.intent'];
const isSourceFile = (name) => SOURCE_EXTS.some((e) => name.endsWith(e));
const stripSourceExt = (name) => name.replace(/\.(thunder|tl|intent)$/i, '');
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

// Walk a directory for authored source files (skips the .intent/ output dir).
function collectIntents(root, acc = []) {
  const st = statSync(root);
  if (!st.isDirectory()) return isSourceFile(root) ? [root] : acc;
  for (const name of readdirSync(root)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    if (statSync(full).isDirectory()) collectIntents(full, acc);
    else if (isSourceFile(name)) acc.push(full);
  }
  return acc;
}

// Resolve every guarantee/never obligation against the SPECIFIC test that verifies it.
// Shared by `thunder test --contracts` and `thunder prove` so both agree per-claim.
// States: verified (proven by a passing named test), failed (its test fails), declared
// (a verification is named/classified but not runnable in-file), unverified (nothing).
function resolveObligations(ast) {
  const t = runTests(ast);
  const testPass = new Map();
  for (const res of (t.results || [])) {
    const cur = testPass.get(res.target);
    testPass.set(res.target, cur === undefined ? !!res.pass : cur && !!res.pass);
  }
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchTest = (verifyText) => {
    const v = norm(verifyText); if (!v) return null;
    for (const [name, pass] of testPass) { const n = norm(name); if (n && (n === v || n.includes(v) || v.includes(n))) return { name, pass }; }
    return null;
  };
  const build = (kind, o) => {
    const verify = o.verify || [];
    const kinds = [...new Set((o.verifications || []).map((v) => v.kind).filter((k) => k && k !== 'unclassified'))];
    let status, provenBy = null;
    if (!verify.length) status = 'unverified';
    else {
      let m = null;
      for (const vt of verify) { const x = matchTest(vt); if (x) { m = x; if (!x.pass) break; } }
      if (m) { status = m.pass ? 'verified' : 'failed'; provenBy = m.name; } else status = 'declared';
    }
    return { kind, id: o.id, text: o.statement, status, verify, kinds, provenBy };
  };
  const obligations = [
    ...ast.guarantees.map((g) => build('guarantee', g)),
    ...ast.neverRules.map((n) => build('prohibition', n)),
  ];
  const count = (s) => obligations.filter((o) => o.status === s).length;
  return { obligations, tests: t, verified: count('verified'), declared: count('declared'), unverified: count('unverified'), failed: count('failed') };
}

// Proof freshness: a proof is valid only for a specific (intent, implementation, dependencies,
// compiler, environment) tuple. These helpers capture that tuple so `verify` can mark a proof STALE.
const gitCmd = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() || null; } catch { return null; } };
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'poetry.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock'];
function findLockfile(startDir) {
  let dir = startDir || '.';
  for (let i = 0; i < 6; i++) {
    for (const lf of LOCKFILES) { const p = join(dir, lf); if (existsSync(p)) return p; }
    const parent = dirname(dir); if (parent === dir) break; dir = parent;
  }
  return null;
}
function freshnessFor(file, proof, envName) {
  const dir = dirname(file) || '.';
  const lock = findLockfile(dir);
  return {
    intentHash: proof.sourceHash,
    compilerVersion: proof.compilerVersion,
    implementation: gitCmd('rev-parse HEAD'),
    dependencies: lock ? { file: basename(lock), hash: sha256(readFileSync(lock, 'utf8')) } : null,
    environment: envName || null,
    generatedAt: proof.generatedAt,
  };
}
// Given a proof's recorded freshness, recompute the current tuple and list what has drifted.
function stalenessReasons(freshness, srcDir) {
  const reasons = [];
  if (!freshness) return reasons;
  if (freshness.implementation) { const now = gitCmd('rev-parse HEAD'); if (now && now !== freshness.implementation) reasons.push(`implementation moved: proof at ${freshness.implementation.slice(0, 7)}, now ${now.slice(0, 7)}`); }
  if (freshness.dependencies) { const lock = findLockfile(srcDir); const now = lock ? sha256(readFileSync(lock, 'utf8')) : null; if (now && now !== freshness.dependencies.hash) reasons.push(`dependency lockfile changed (${freshness.dependencies.file})`); }
  if (freshness.compilerVersion && freshness.compilerVersion !== COMPILER_VERSION) reasons.push(`compiler upgraded: proof ${freshness.compilerVersion}, now ${COMPILER_VERSION}`);
  return reasons;
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
    else if (a === '--contracts') args.contracts = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--changed') args.changed = true;
    else if (a === '--properties') args.properties = true;
    else if (a === '--scenarios') args.scenarios = true;
    else if (a === '--mutate') args.mutate = true;
    else if (a === '--safe') args.safe = true;
    else if (a === '--evals') args.evals = true;
    else if (a === '--coverage') args.coverage = true;
    else if (a === '--run') args.run = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--results') args.results = argv[++i];
    else if (a === '--cases') args.cases = argv[++i];
    else if (a === '--seed') args.seed = argv[++i];
    else if (a === '--ir') args.ir = argv[++i];
    else if (a === '--subject') args.subject = argv[++i];
    else if (a === '--lens') args.lens = argv[++i];
    else if (a === '--nodes') args.nodes = argv[++i];
    else if (a === '--depth') args.depth = argv[++i];
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--observed') args.observed = true;
    else if (a === '--learning') args.learning = true;
    else if (a === '--governed') args.governed = true;
    else if (a === '--target') args.target = argv[++i];
    else if (a === '--all-targets') args.allTargets = true;
    else if (a === '--evidence') args.evidence = true;
    else if (a === '--env') args.env = argv[++i];
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

const HELP = `thunder , the ThunderLang compiler + engine (deterministic, no AI required)

The flow: author intent, inspect it, run and prove it, then keep real code aligned with it.

usage: thunder <command> <file> [options]
       thunder mission <Name> <command>     run any command on a mission by name

Author
  new [Name]                 scaffold a runnable starter mission (Name.thunder)   [alias: init]
  mission <Name> [cmd]       resolve a mission by name and run a command on it (list | <Name> | <Name> <cmd>)
  draft --brief <json|->     scaffold a rigorous intent draft + gap checklist from a brief
  edit <file> [--edits <json|->] [--set-goal ..] [--add-guarantee ..] [--write]   structural edits, comments kept
  fmt <file|dir> [--write|--check]   canonical formatting (whitespace only; comments kept)
  source <file|graph.json>   regenerate .thunder from a persisted graph

Inspect
  check <file|dir> [--json|--format sarif]   parse + lint + explainable diagnostics; gate a whole dir
  report [dir] [--json]      repo-wide intent health: severity + area counts, coverage
  risks | gaps | unverified | coverage | unknowns | contradictions [dir] [--json]   focused scan queries
  focus <mission|query|--nodes a,b> [--depth N] [--dir <d>] [--json]   Intent Lens: focused graph + brief
  comprehension <file|dir> [--observed] [--learning] [--governed] [--json]   the C0..C7 understanding level
  twelve-factor <file> [--json]   score against the 13 humanlayer/12-factor-agents principles   [alias: 12factor]
  explain <IL-CODE>          explain a diagnostic code (area, severity, what it blocks)
  rules [--json]             list the whole canonical diagnostic catalog
  notes <file> [--lens <lens>] [--json]   ThunderLens: the compiled note blocks by lens (not verification)
  docs <file> [--lens <lens>] [--out <dir>]   render a mission as Markdown docs (per-audience with --lens)
  index <dir>                the Mission Atlas inventory
  atlas <dir> [--search q | --expand id]   the whole-system Atlas

Run & test
  run <file> --inputs '<json>'   execute the decision(s) deterministically
  test <file> [--contracts | --properties | --scenarios | --mutate | --evals | --changed | --coverage] [--strict]
  test <file> --target typescript|python|csharp|java   run the tests against the EXECUTED generated code
  test <file> --all-targets  run the tests against every AVAILABLE target in one pass
  simulate <file> --events a,b,c   walk the lifecycle(s) over events
  outcomes <file>            evaluate outcome contracts vs delivery results
  style <file>               resolve style intents vs the canonical token space
  gen <file> [--target typescript|csharp|java|python] [--out <dir>]   deterministic code scaffold (types + decision logic + TODOs)
  build <file>               generate docs, contract graph, test plan, and .thunder-proof.json

Prove & verify intent
  prove <file>               emit an intent-proof-v1 artifact (honest verdicts + freshness)
  proof <file>               the .thunder-proof.json artifact (see also: prove, which emits verdicts)
  proof --schema             emit the canonical proof envelope JSON Schema (intent-proof-v1)
  verify <proof.json> [src]  re-check a proof; reports STALE when impl/deps/compiler moved
  evidence <file>            emit evidence-event-v1 JSON (tool_verified) for the shared proof spine
                             (also: prove/verify-diff/conform/drift accept --evidence to emit their own event)
  conform <file> [--targets a,b] [--run typescript,python,csharp,java | --all-targets] [--results <json>]   conformance matrix across targets

Real code vs intent (drift)
  lift <file> [--from <lang>]    lift source code into inferred intent
  drift <codeFile> --intent <file.intent> [--from <lang>]   check intent vs code drift
  approve <file> --by <name>     approve intent (drift baseline)
  verify-diff <intent> --after <code> [--before <code>]   gate a code change against its intent
  changes [<base>..<head> | <base>] [--json]   Change Lens: what a branch/PR changed by meaning
  guardian <before> <after>      drift: what changed, what risk, what to reverify, what learning is stale
  impact <base> <proposed>       Simulator: estimate a change's blast radius + risk BEFORE building it
  diff <before> <after>          semantic diff (by meaning)
  merge <base> <ours> <theirs>   deterministic 3-way semantic merge
  handoff <file>                 the OpenThunder drift handoff
  ledger <file.json> [--subject <id>]   verify the tamper-evident history + explain why/who/what changed
  guard <file> [--json]          preview the runtime guard (redacted fields, enforced decisions)

Graph & IR
  graph <file> [--safe]      the canonical Intent Graph (intent-graph-v1); --safe = display-safe on stdout
  migrate <graph.json> [--to <version>]   upgrade a persisted graph
  validate <graph.json> [--json]   check a graph is canonical (anti-fork)
  schema                     emit the canonical graph schema + diagnostic catalog

Interop
  export <file> --format <dmn|bpmn|smv|jsonschema|openapi|tokens|mermaid|css|playwright>   render to a standard format
  import <file> [--format dmn|bpmn] [--json]   lift DMN/BPMN into intent

Fix
  scan [dir] [--json] [--ir <path>]   Scanner: intent -> Intent IR -> Fable findings -> risk themes
  code-actions <file> [--json]   available quick-fixes, safety-graded (safe | reviewable)
  apply-fix <file> [--write]     apply the SAFE autocorrects (header aliases, stray colons)

Servers
  lsp                        start the Language Server (LSP over stdio, for editors)
  mcp                        start the MCP server (for AI coding agents; stdio)

Common options: --out <dir>, --json, --no-ai. See https://thunderlang.dev/docs`;

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
  // `thunder proof --schema` emits the canonical proof envelope JSON Schema (no file needed).
  // This is the "shared envelope" schema siblings sign (STW) and re-verify (RM/OT) against.
  if (cmd === 'proof' && args.schema) {
    console.log(JSON.stringify(intentProofJsonSchema(), null, 2));
    return;
  }
  // Verify a .thunder-proof.json against its source: the source hash still matches (no
  // drift / tampering) and the proof's claims re-derive from the source.
  if (cmd === 'verify') {
    const proofPath = args._[0];
    if (!proofPath) { console.error('usage: thunder verify <proof.json> [<source.intent>]'); process.exit(2); return; }
    let proof;
    try { proof = JSON.parse(readFileSync(proofPath, 'utf8')); } catch { console.error('thunder verify: proof is not valid JSON'); process.exit(2); return; }
    const srcPath = args._[1] || proof.sourceFile;
    if (!srcPath || !existsSync(srcPath)) { console.error(`thunder verify: source not found (${srcPath || 'none'}). Pass it: thunder verify <proof.json> <source.intent>`); process.exit(2); return; }
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
    // Freshness: even if the intent still matches, the proof is STALE if the implementation,
    // dependencies, or compiler moved since it was generated. A stale proof must not read green.
    const staleReasons = valid ? stalenessReasons(proof.freshness, dirname(srcPath) || '.') : [];
    const stale = staleReasons.length > 0;
    const status = !valid ? 'FAILED' : stale ? 'STALE' : 'VALID';
    const result = { schema: 'intent-verify-v1', proof: proofPath, source: srcPath, valid, stale, status, staleReasons, checks: { wellFormed: structure.valid, hashMatch, semanticMatch, guaranteesMatch, neverMatch }, structureErrors: structure.errors };
    if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(valid && !stale ? 0 : 1); return; }
    console.log(`thunder verify ${basename(proofPath)}: ${status} (source ${basename(srcPath)})`);
    if (!structure.valid) { console.log(`  X proof is not a well-formed intent-proof-v1 document:`); for (const e of structure.errors) console.log(`      ${e.path || '(root)'}: ${e.message}`); }
    if (!hashMatch) console.log('  X source hash does not match , the source has changed since the proof was generated (drift or tampering).');
    if (!semanticMatch) console.log('  X the proof claims a different semantic result than the source produces now.');
    if (!guaranteesMatch) console.log('  X guarantee count differs from the proof.');
    if (!neverMatch) console.log('  X never-rule count differs from the proof.');
    if (stale) { console.log('  ! proof is STALE , the intent still matches, but the world moved since it was generated:'); for (const r of staleReasons) console.log(`      ${r}`); console.log('    regenerate: thunder prove ' + basename(srcPath)); }
    if (valid && !stale) console.log(`  ok proof matches source and is fresh (hash + ${(proof.guarantees || []).length} guarantee(s), ${(proof.neverRules || []).length} never-rule(s)).`);
    process.exit(valid && !stale ? 0 : 1);
    return;
  }

  // Explain a diagnostic code from the canonical catalog. `thunder explain IL-DEC-001`.
  if (cmd === 'explain') {
    const code = file;
    if (!code) { console.error('usage: thunder explain <IL-CODE>'); process.exit(2); return; }
    const rule = ALL_DIAGNOSTICS.find((r) => r.ruleId.toLowerCase() === code.toLowerCase());
    if (args.json) { console.log(JSON.stringify(rule || { ruleId: code, found: false }, null, 2)); process.exit(rule ? 0 : 1); return; }
    if (!rule) { console.error(`thunder explain: "${code}" is not in the diagnostic catalog. Run "intent rules" for the full list.`); process.exit(1); return; }
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
    console.log(`thunder rules: ${ALL_DIAGNOSTICS.length} diagnostics in ${Object.keys(byArea).length} areas\n`);
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

  // `thunder notes <file> [--lens <lens>] [--json]` , the ThunderLens report: the compiled
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
    console.log(`thunder notes ${basename(file)}${scope}: ${notes.length} note${notes.length === 1 ? '' : 's'}`);
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

  // `thunder docs <file> [--lens <lens>] [--out <dir>]` , render a mission as Markdown docs.
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

  // `thunder code-actions <file> [--json]` , the available quick-fixes, each safety-graded
  // (safe autocorrects + reviewable diagnostic fixes). The IDE lightbulb's data source.
  if (cmd === 'code-actions') {
    if (!file) { console.error('usage: intent code-actions <file> [--json]'); process.exit(2); return; }
    const source = readFileSync(file, 'utf8');
    const actions = getCodeActions(source, semanticDiagnostics(parseIntent(source)));
    if (args.json) { console.log(JSON.stringify({ schema: 'intent-code-actions-v1', count: actions.length, actions }, null, 2)); return; }
    console.log(`thunder code-actions ${basename(file)}: ${actions.length} action${actions.length === 1 ? '' : 's'}`);
    for (const a of actions) console.log(`  [${a.safety}] ${a.kind}${a.line ? ` (line ${a.line})` : ''}  ${a.title}`);
    return;
  }

  // `thunder apply-fix <file> [--write]` , apply the SAFE autocorrects only (header aliases,
  // stray colons). Reviewable quick-fixes are reported, never applied blindly.
  if (cmd === 'apply-fix') {
    if (!file) { console.error('usage: intent apply-fix <file> [--write]'); process.exit(2); return; }
    const source = readFileSync(file, 'utf8');
    const { fixed, changes } = autocorrectSource(source);
    const reviewable = getCodeActions(source, semanticDiagnostics(parseIntent(source))).filter((a) => a.safety !== 'safe');
    if (args.json) { console.log(JSON.stringify({ applied: changes, reviewableRemaining: reviewable.length, changed: fixed !== source }, null, 2)); }
    else {
      console.log(`thunder apply-fix ${basename(file)}: ${changes.length} safe fix${changes.length === 1 ? '' : 'es'}${args.write ? ' applied' : ' (dry run; pass --write)'}`);
      for (const c of changes) console.log(`  line ${c.line}: "${c.from}" -> "${c.to}"  [${c.rule}]`);
      if (reviewable.length) console.log(`  ${reviewable.length} reviewable quick-fix(es) left for a human (run: intent code-actions ${basename(file)})`);
    }
    if (args.write && fixed !== source) { writeFileSync(file, fixed); if (!args.json) console.log(`  wrote ${basename(file)}`); }
    return;
  }

  // `thunder focus <mission|query|--nodes a,b> [--depth N] [--dir <d>] [--json]` , Intent Lens:
  // a focused Focus Graph + Intent Brief around a selected scope, built over the Atlas.
  if (cmd === 'focus') {
    const dir = args.dir || '.';
    const files = existsSync(dir) && statSync(dir).isDirectory() ? collectIntents(dir) : (file && existsSync(file) ? [file] : []);
    if (!files.length) { console.error(`thunder focus: no .intent files under ${dir}`); process.exit(2); return; }
    const atlas = buildAtlas(files.map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8')))));
    // Resolve seeds: --nodes ids, or a mission/feature query, or (default) all missions.
    let seeds = [];
    let scopeType = 'custom';
    let scopeTitle = null;
    if (args.nodes) { seeds = args.nodes.split(',').map((s) => s.trim()).filter(Boolean); scopeType = 'custom'; scopeTitle = `${seeds.length} selected node(s)`; }
    else if (file && !existsSync(file)) {
      const hit = searchAtlas(atlas, file)[0];
      if (!hit) { console.error(`thunder focus: no Atlas node matches "${file}"`); process.exit(1); return; }
      seeds = [hit.id]; scopeType = hit.type === 'Mission' ? 'mission' : 'feature'; scopeTitle = hit.title || hit.id;
    } else { seeds = atlas.missions.map((m) => m.id); scopeType = 'capability'; scopeTitle = 'whole project'; }
    const scope = makeScope({ type: scopeType, title: scopeTitle, seeds, createdAt: null });
    const focus = buildFocusGraph(atlas, { seeds, depth: args.depth ? Number(args.depth) : 2, scope });
    const brief = intentBrief(focus);
    if (args.json) { console.log(JSON.stringify({ scope, brief, focus }, null, 2)); return; }
    console.log(`thunder focus , ${scope.title}  [${scope.type}]  (${scope.scopeId})`);
    console.log(`  what: ${brief.what || '(unnamed)'}${brief.confidence ? `   confidence: ${brief.confidence}` : ''}`);
    if (brief.who.length) console.log(`  who: ${brief.who.join(', ')}`);
    console.log(`  focus graph: ${focus.overview.nodes} node(s), ${focus.overview.relationships} edge(s), depth ${focus.depth}`);
    const br = focus.overview.byReason;
    console.log(`  by reason: ${Object.entries(br).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    if (brief.guarantees.length) console.log(`  guarantees: ${brief.guarantees.length}   prohibitions: ${brief.prohibitions.length}   verification: ${brief.verification}`);
    if (brief.risks) console.log(`  risks in scope: ${brief.risks}`);
    if (brief.unknowns.length) console.log(`  unknowns: ${brief.unknowns.join('; ')}`);
    if (brief.needsReview) console.log('  note: scope includes low-confidence inferred intent , review before trusting.');
    return;
  }

  // `thunder comprehension <file|dir> [--observed] [--learning] [--governed] [--json]` , the C0..C7
  // understanding level of each mission (Comprehension Contract). IL scores the intent side (C1..C4);
  // --observed (OpenThunder/runtime), --learning (Skills Tech Talk), --governed (Guardian) lift the
  // joint level to C5/C6/C7 when a sibling attaches its evidence.
  if (cmd === 'comprehension') {
    const root = file || '.';
    const files = existsSync(root) && statSync(root).isDirectory() ? collectIntents(root) : (existsSync(root) ? [root] : []);
    if (!files.length) { console.error(`thunder comprehension: no .intent files under ${root}`); process.exit(2); return; }
    const opts = { observed: !!args.observed, learningPath: !!args.learning, governed: !!args.governed };
    const asts = files.map((f) => parseIntent(readFileSync(f, 'utf8')));
    const report = comprehensionReport(asts, opts);
    if (args.json) { console.log(JSON.stringify(report, null, 2)); return; }
    console.log(`thunder comprehension ${root}: ${report.count} mission(s)`);
    console.log(`  distribution: ${COMPREHENSION_LEVELS.map((l) => `${l.level}:${report.byLevel[l.level]}`).join('  ')}`);
    for (const m of report.missions) {
      console.log(`\n  ${m.mission || '(unnamed)'}  ,  ${m.level} ${m.levelName}`);
      console.log(`    ${m.means}`);
      if (m.missing.length) {
        const next = m.missing[0];
        console.log(`    next: reach ${next.level} ${next.name} , ${next.need}  [${next.owner}]`);
      }
    }
    return;
  }

  // `thunder twelve-factor <file> [--json]` , score an intent against the 13 principles of
  // humanlayer/12-factor-agents (deterministic conformance lens). Per-factor verdict + score.
  if (cmd === 'twelve-factor' || cmd === '12factor') {
    if (!file) { console.error('usage: intent twelve-factor <file> [--json]'); process.exit(2); return; }
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const report = twelveFactorReport(ast);
    if (args.json) { console.log(JSON.stringify(report, null, 2)); return; }
    const mark = { satisfied: 'ok  ', partial: '~   ', absent: 'MISS' };
    console.log(`12-factor conformance: ${report.subject || '(unnamed)'}  ,  ${report.score}/100 (${report.grade})`);
    console.log(`  ${report.counts.satisfied} satisfied · ${report.counts.partial} partial · ${report.counts.absent} absent\n`);
    for (const f of report.factors) {
      console.log(`  [${mark[f.verdict]}] F${String(f.factor).padStart(2)} ${f.name}`);
      console.log(`         ${f.evidence}`);
      if (f.fix) console.log(`         fix: ${f.fix}`);
    }
    return;
  }

  // `thunder gen <file> [--target typescript|csharp|java|python] [--out <dir>]` , deterministic code scaffold from
  // intent. Generates the typed contract + the decision logic (already executable) and leaves
  // honest TODO markers for business logic. No AI. Prints, or writes with --out.
  if (cmd === 'gen') {
    if (!file) { console.error(`usage: intent gen <file> [--target ${Object.keys(GENERATORS).join('|')}] [--out <dir>]`); process.exit(2); return; }
    const target = (args.target || 'typescript').toLowerCase();
    const generate = GENERATORS[target];
    if (!generate) { console.error(`thunder gen: unknown target "${target}" (have: ${Object.keys(GENERATORS).join(', ')})`); process.exit(2); return; }
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const code = generate(ast);
    if (args.outExplicit) {
      const ext = target.startsWith('ts') || target === 'typescript' ? 'ts' : target === 'python' ? 'py' : target === 'csharp' ? 'cs' : target;
      const p = writeText(args.out, `${slug(subjectName(ast) || 'intent')}.${ext}`, code.endsWith('\n') ? code : code + '\n');
      console.log(`wrote ${p.replace(process.cwd() + '/', '')}`);
      return;
    }
    console.log(code);
    return;
  }

  // `thunder changes [<base>..<head> | <base>] [--json]` , Change Lens: what a branch / PR / commit
  // range changed BY MEANING. git-diffs the .intent files, semantic-diffs each, and reports the
  // behavior-level changes + regression risk. Default: HEAD vs the working tree.
  if (cmd === 'changes') {
    const git = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return null; } };
    if (git('rev-parse --is-inside-work-tree') === null) { console.error('thunder changes: not a git repository'); process.exit(2); return; }
    const range = file || '';
    let base, head; // head === null means "the working tree"
    if (range.includes('..')) { [base, head] = range.split('..'); head = head || 'HEAD'; }
    else if (range) { base = range; head = null; }
    else { base = 'HEAD'; head = null; }
    const diffSpec = head ? `${base} ${head}` : base;
    const names = (git(`diff --name-only ${diffSpec} -- "*.thunder" "*.tl" "*.intent"`) || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!names.length) { console.log(`thunder changes ${range || `${base}..working-tree`}: no source files changed`); return; }
    const readAt = (ref, p) => (ref === null ? (existsSync(p) ? readFileSync(p, 'utf8') : null) : git(`show ${ref}:${p}`));
    const toGraph = (src) => (src != null ? buildIntentGraph(parseIntent(src)) : null);
    const pairs = names.map((p) => ({ path: p, before: toGraph(readAt(base, p)), after: toGraph(readAt(head, p)) }));
    const report = changeReport(pairs);
    if (args.json) { console.log(JSON.stringify(report, null, 2)); process.exit(report.verdict === 'review' ? 1 : 0); return; }
    const t = report.totals;
    console.log(`thunder changes ${range || `${base}..working-tree`}: ${report.verdict.toUpperCase()}`);
    console.log(`  ${t.files} file(s) , +${t.added} / -${t.removed} / ~${t.changed} nodes${t.invalidatedApprovals ? `, ${t.invalidatedApprovals} approval(s) invalidated` : ''}`);
    if (report.regressions.length) {
      console.log('  regression risk (a promise or its proof was removed or weakened):');
      for (const r of report.regressions) console.log(`    - ${r.kind === 'weakened' ? 'weakened' : 'removed'} ${r.thing}: ${r.title}`);
    }
    const nonReg = report.highlights.filter((h) => !(h.kind === 'removed' && report.regressions.includes(h)));
    for (const h of nonReg.slice(0, 12)) console.log(`  ${h.kind === 'added' ? '+' : h.kind === 'removed' ? '-' : '~'} ${h.kind} ${h.thing}: ${h.title}`);
    process.exit(report.verdict === 'review' ? 1 : 0);
    return;
  }

  // Language Server (LSP over stdio) for editors. Long-running; no file argument.
  if (cmd === 'lsp') {
    startLspServer();
    return; // keep the process alive on stdin
  }

  // MCP server (Model Context Protocol over stdio) , makes ThunderLang a native tool for AI
  // coding agents. Long-running; no file argument. Point an MCP client at `thunder mcp`.
  if (cmd === 'mcp') {
    startMcpServer();
    return; // keep the process alive on stdin
  }

  // Scaffold a runnable starter mission (deterministic, no AI). `thunder init [Name]`.
  if (cmd === 'init' || cmd === 'new') {
    const name = stripSourceExt(file || 'Mission');
    const target = join(args.out && args.out !== '.intent' ? args.out : '.', `${name}.thunder`);
    if (existsSync(target) && !args.force) {
      console.error(`thunder init: ${target} already exists (use --force to overwrite).`);
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

# A runnable decision. Try: thunder run ${name}.intent --inputs '{"age":20}'
decision Example
  inputs
    age
  rule adult
    when age >= 18
    return Allowed
  default
    return Blocked

# Tests live in the file. Try: thunder test ${name}.intent
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
    console.log(`thunder ${cmd}: wrote ${target}`);
    console.log(`  next: thunder check ${target}  |  thunder run ${target} --inputs '{"age":20}'  |  thunder test ${target}`);
    return;
  }

  if (!file && cmd !== 'draft' && cmd !== 'mission' && !(cmd === 'test' && args.changed)) {
    console.error(`thunder ${cmd}: missing a file argument. Run "intent help" for usage.`);
    process.exit(2);
  }

  // `thunder mission <Name> [<verb> ...]` , noun-first ergonomics: resolve a mission by name
  // anywhere in the project, then run any verb on it without typing a path.
  // `thunder mission list` lists every mission. `thunder mission <Name>` prints a summary.
  if (cmd === 'mission') {
    const scanRoot = process.cwd();
    const parsed = collectIntents(scanRoot)
      .map((f) => { try { return { file: f, ast: parseIntent(readFileSync(f, 'utf8')) }; } catch { return null; } })
      .filter((x) => x && x.ast && x.ast.mission);
    const raw = process.argv.slice(3); // [Name|list, verb?, ...passthrough]
    const nameArg = raw[0];

    if (!nameArg || nameArg === 'list') {
      if (!parsed.length) { console.log('thunder mission list: no missions found under the current directory.'); return; }
      console.log(`thunder mission list: ${parsed.length} mission(s)`);
      for (const { file: f, ast } of parsed.sort((a, b) => (a.ast.mission || '').localeCompare(b.ast.mission || ''))) {
        const g = (ast.guarantees || []).length, n = (ast.neverRules || []).length, t = (ast.tests || []).length;
        console.log(`  ${(ast.mission || '(unnamed)').padEnd(26)} ${relative(scanRoot, f)}  (${g} guarantee(s), ${n} never, ${t} test(s))`);
      }
      return;
    }

    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const matches = parsed.filter((x) => x.ast.mission === nameArg);
    const hit = matches[0] || parsed.find((x) => norm(x.ast.mission) === norm(nameArg));
    if (!hit) { console.error(`thunder mission: no mission named "${nameArg}". Try: thunder mission list`); process.exit(2); return; }
    if (matches.length > 1) console.error(`thunder mission: ${matches.length} missions named "${nameArg}"; using ${relative(scanRoot, hit.file)}`);

    const verb = raw[1];
    if (!verb) {
      const a = hit.ast;
      console.log(`mission ${a.mission}   (${relative(scanRoot, hit.file)})`);
      if (a.goal) console.log(`  goal: ${a.goal}`);
      if ((a.guarantees || []).length) { console.log('  guarantees:'); for (const g of a.guarantees) console.log(`    - ${g.statement}`); }
      if ((a.neverRules || []).length) { console.log('  never:'); for (const nr of a.neverRules) console.log(`    - ${nr.statement}`); }
      if ((a.targets || []).length) console.log(`  targets: ${a.targets.join(', ')}`);
      if ((a.tests || []).length) console.log(`  tests: ${a.tests.length}`);
      console.log(`  try: thunder mission ${a.mission} check | run | test | prove | build`);
      return;
    }

    // Delegate to `thunder <verb> <file> <passthrough>` in a child so every flag is honored exactly.
    const res = spawnSync(process.execPath, [process.argv[1], verb, hit.file, ...raw.slice(2)], { stdio: 'inherit' });
    process.exit(res.status == null ? 0 : res.status);
    return;
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
        console.log(`thunder lift repo ${root} -> ${res.missionsGenerated} mission(s) in ${args.out}`);
        console.log(`  confidence: ${JSON.stringify(res.confidenceSummary)} | ${res.unknowns} unknown(s) total`);
      } else {
        console.log(`thunder lift repo ${root}: ${res.missionsGenerated} mission(s)`);
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
      console.log(`thunder lift --all ${basename(file)}: ${res.count} mission(s) inferred`);
      for (const m of res.missions) console.log(`  ${m.mission}  (${m.fn}, confidence ${m.confidence})`);
      return;
    }

    // Single-file mode. Auto-detect language by extension (consistent with --all / repo modes).
    const src = readFileSync(file, 'utf8');
    const res = liftSource(src, { language: args.from || languageForFile(file), file: basename(file) });
    if (!res.ok) { console.error(res.error); process.exit(1); }
    if (args.json) { console.log(JSON.stringify(res.summary, null, 2)); return; }
    if (args.out) {
      const p = writeText(args.out, `${slug(res.lifted.mission)}.thunder`, res.intentText);
      console.log(`thunder lift ${basename(file)} -> ${p.replace(process.cwd() + '/', '')}`);
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
    console.log(`thunder approve ${basename(file)} -> reviewed: true (${res.approval.source_hash.slice(0, 24)}...)`);
    return;
  }

  // Handoff: emit the il-to-ot-drift-v1 pack OpenThunder consumes for deep verification.
  if (cmd === 'handoff') {
    const text = readFileSync(file, 'utf8');
    const pack = buildDriftHandoff(text, { generatedAt: args.at || null });
    const out = JSON.stringify(pack, null, 2);
    if (args.out && args.out !== '.intent') {
      const p = writeText(args.out, `${slug(pack.mission)}.drift-handoff.json`, out);
      console.log(`thunder handoff ${basename(file)} -> ${p.replace(process.cwd() + '/', '')} (kind ${pack.kind}, approved ${pack.approved})`);
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
    if (args.evidence) {
      const ctx = { compilerVersion: COMPILER_VERSION, occurredAt: new Date().toISOString(), missionName: parseIntent(intentText).mission || null, intentHash: sha256(intentText), codeHash: sha256(codeText) };
      console.log(JSON.stringify(driftToEvidence(res, ctx), null, 2));
      process.exit(res.status === 'drift' ? 1 : 0); return;
    }
    if (args.json) { console.log(JSON.stringify(res, null, 2)); }
    else {
      console.log(`thunder drift: ${res.status.toUpperCase()} (${res.summary.blocking} blocking)`);
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
      console.log(`thunder ai list ${root}: ${manifest.summary.total} AI implementation(s)`);
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
      if (!ast.implementation) { console.error(`thunder ai generate: ${basename(file)} has no "implement with ai" block.`); process.exit(2); return; }
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
      console.log(`thunder ai gate ${root} (${args.mode || 'production'}): ${gate.ok ? 'PASS' : 'BLOCKED'} , ${resolved.length} implementation(s)`);
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
      if (!res) { console.error(`thunder ai adopt: no AI-managed region "${id}" in ${basename(file)}.`); process.exit(2); return; }
      writeFileSync(file, res.code);
      console.log(`thunder ai adopt ${id} -> human-owned (origin="ai" ownership="human") in ${basename(file)}`);
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
      if (!im || !ast) { console.error(`thunder ai ${sub}: no implementation "${id}" found under ${root}.`); process.exit(2); return; }
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
      if (error) { console.error(`thunder ai ${sub}: ${error}`); process.exit(2); return; }
      writeJson(join(root, '.intent'), 'ai-approvals.json', next);
      const event = makeEvent(sub === 'approve' ? 'IntentAiImplementationApproved' : 'IntentAiImplementationRejected', {
        implementationId: id, missionId: ast.mission, contractHash: contractHash(ast), implementationHash: implementationHash(region.code),
        timestamp: at, toolVersion: 'thunderlang', actorType: 'human', actorId: args.by || null, previousStatus: state.status,
        newStatus: sub === 'approve' ? 'APPROVED' : 'REJECTED',
      });
      const logPath = sinkEvent(root, event);
      console.log(`thunder ai ${sub} ${id} by ${args.by || '(anonymous)'}${args.role ? ` [${args.role}]` : ''} -> ${sub === 'approve' ? 'APPROVED' : 'REJECTED'} (bound to current hashes)`);
      console.log(`  logged ${event.type} to ${logPath.replace(process.cwd() + '/', '')}`);
      if (args.json) console.log(JSON.stringify(event, null, 2));
      return;
    }
    // `thunder ai events [dir] [--subject <implId>] [--json]` , read the append-only audit log.
    if (sub === 'events') {
      const root = args._[1] || '.';
      const log = readEventLog(root);
      const events = args.subject ? log.events.filter((e) => e.implementationId === args.subject) : log.events;
      if (args.json) { console.log(JSON.stringify({ ...log, events }, null, 2)); return; }
      console.log(`thunder ai events ${root}: ${events.length} event${events.length === 1 ? '' : 's'}${args.subject ? ` for ${args.subject}` : ''}`);
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
      if (!existsSync(cdir)) { console.error(`thunder ai select: no candidates at ${relative(process.cwd(), cdir)}.`); process.exit(2); return; }
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
      console.log(`thunder ai select ${id}: ${result.winner ? result.winner.id : '(none eligible)'} wins (${result.eligibleCount}/${candidates.length} eligible)`);
      console.log(`  policy: prefer ${result.prefer.map((p) => `${p.direction} ${p.metric}`).join(', ')}${policy.requireAllChecks ? '; require all checks' : ''}`);
      for (const c of result.ranking) console.log(`  ${c.id.padEnd(20)} ${JSON.stringify(c.metrics)}${c.checksPassed === false ? ' [checks FAILED]' : ''}`);
      return;
    }
    console.error(`thunder ai ${sub || ''}: IL supports list | generate | gate | adopt | approve | reject | select. OpenThunder runs verification.`);
    process.exit(2);
    return;
  }

  // Semantic diff: compare two snapshots (dirs or .intent files) by meaning.
  if (cmd === 'diff') {
    const b = args._[0]; const a = args._[1];
    if (!b || !a) { console.error('usage: thunder diff <before-dir|file> <after-dir|file> [--json]'); process.exit(2); return; }
    const snap = (p) => {
      if (statSync(p).isDirectory()) return buildAtlas(collectIntents(p).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8')))));
      return buildIntentGraph(parseIntent(readFileSync(p, 'utf8')));
    };
    const diff = diffGraphs(snap(b), snap(a));
    if (args.json) { console.log(JSON.stringify(diff, null, 2)); return; }
    console.log(`thunder diff ${b} -> ${a}: +${diff.summary.added} / -${diff.summary.removed} / ~${diff.summary.changed} node(s), +${diff.summary.relationshipsAdded} / -${diff.summary.relationshipsRemoved} edge(s)`);
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
    console.log(`thunder merge: ${res.clean ? 'CLEAN' : 'CONFLICTS'} , ${res.summary.nodes} node(s), ${res.summary.conflicts} conflict(s)`);
    for (const c of res.conflicts) console.log(`  conflict: ${c.type} ${c.id} (changed differently on both sides)`);
    process.exit(res.clean ? 0 : 1);
    return;
  }

  // Intent Runtime: EXECUTE intent , evaluate decisions against concrete inputs.
  if (cmd === 'run') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    let inputs = {};
    if (args.inputs) { try { inputs = JSON.parse(args.inputs); } catch { console.error('thunder run: --inputs must be JSON'); process.exit(2); return; } }
    let decisions = ast.decisions || [];
    if (args.decision) decisions = decisions.filter((d) => slug(d.name) === slug(args.decision));
    if (!decisions.length) { console.error('thunder run: no decision to run' + (args.decision ? ` matching "${args.decision}"` : '')); process.exit(2); return; }
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
    if (r.total === 0) { console.log(`thunder outcomes ${basename(file)}: no outcome contracts found.`); return; }
    console.log(`thunder outcomes ${basename(file)}: ${r.met} met, ${r.missed} missed, ${r.pending} pending`);
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
    if (r.styleIntents.length === 0) { console.log(`thunder style ${basename(file)}: no style intents found.`); return; }
    console.log(`thunder style ${basename(file)}: ${r.styleIntents.length} style intent(s)`);
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
    // Change-impact selection: run the tests for what a diff actually affects, using the Intent
    // Graph (not just the modified files). Selects changed intents plus any intent that shares an
    // event / service / api symbol with a changed one. `thunder test --changed [<range>]`.
    if (args.changed) {
      const gitc = (c) => { try { return execSync(`git ${c}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return null; } };
      const top = gitc('rev-parse --show-toplevel');
      if (top === null) { console.error('thunder test --changed: not a git repository'); process.exit(2); return; }
      const root = top.trim();
      const range = file || '';
      let base, head;
      if (range.includes('..')) { [base, head] = range.split('..'); head = head || 'HEAD'; }
      else if (range) { base = range; head = null; }
      else { base = 'HEAD'; head = null; }
      const diffSpec = head ? `${base} ${head}` : base;
      const changed = (gitc(`diff --name-only ${diffSpec} -- "*.thunder" "*.tl" "*.intent"`) || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const label = range || `${base}..working-tree`;
      if (!changed.length) { console.log(`thunder test --changed ${label}: no source files changed`); return; }

      const symbolsOf = (ast) => {
        const s = new Set();
        if (!ast) return s;
        if (ast.mission) s.add(`system:${ast.mission}`);
        for (const e of ast.events || []) s.add(`event:${e.name}`);
        for (const sv of ast.services || []) { s.add(`service:${sv.name}`); (sv.publishes || []).forEach((p) => s.add(`event:${p}`)); (sv.consumes || []).forEach((p) => s.add(`event:${p}`)); }
        for (const ap of ast.apis || []) s.add(`api:${ap.name}`);
        return s;
      };
      const rel = (p) => relative(root, p);
      const astAt = (relpath) => { const abs = join(root, relpath); if (!existsSync(abs)) return null; try { return parseIntent(readFileSync(abs, 'utf8')); } catch { return null; } };

      // Seed symbols from the changed intents, then find every repo intent that shares one.
      const changedAsts = new Map(changed.map((p) => [p, astAt(p)]));
      const seed = new Set();
      for (const ast of changedAsts.values()) for (const sym of symbolsOf(ast)) seed.add(sym);
      const selected = new Map();
      for (const p of changed) selected.set(p, 'changed');
      for (const abs of collectIntents(root)) {
        const p = rel(abs);
        if (selected.has(p)) continue;
        const shared = [...symbolsOf(parseIntent(readFileSync(abs, 'utf8')))].filter((x) => seed.has(x));
        if (shared.length) selected.set(p, `impacted via ${shared[0].replace(':', ' ')}`);
      }

      let anyFail = false;
      const results = [];
      for (const [p, reason] of selected) {
        const ast = changedAsts.get(p) || astAt(p);
        if (!ast) { results.push({ file: p, reason, deleted: true }); continue; }
        const r = runTests(ast);
        const res = resolveObligations(ast);
        const testsOk = r.total === 0 || r.ok;
        if (!testsOk || res.failed > 0) anyFail = true;
        results.push({ file: p, reason, tests: { passed: r.passed, total: r.total, ok: testsOk }, unverified: res.unverified, failedClaims: res.failed });
      }
      if (args.json) { console.log(JSON.stringify({ schema: 'thunder-changed-v1', range: label, changed, selected: results }, null, 2)); process.exit(anyFail ? 1 : 0); return; }
      console.log(`thunder test --changed ${label}: ${changed.length} changed, ${selected.size} intent(s) selected`);
      for (const r of results) {
        if (r.deleted) { console.log(`  , ${r.file}  [${r.reason}, deleted]`); continue; }
        const mark = r.tests.ok && !r.failedClaims ? 'PASS' : 'FAIL';
        console.log(`  ${mark.padEnd(6)} ${r.file}  [${r.reason}]  tests ${r.tests.passed}/${r.tests.total}${r.unverified ? `, ${r.unverified} unverified` : ''}`);
      }
      process.exit(anyFail ? 1 : 0);
      return;
    }

    const ast = parseIntent(readFileSync(file, 'utf8'));

    // Property-based testing: generate many cases for each `property`, evaluate the decision,
    // assert the `expect` clauses, and shrink failures. `thunder test <file> --properties`.
    if (args.properties) {
      const cases = Number.isFinite(Number(args.cases)) && Number(args.cases) > 0 ? Math.min(Math.floor(Number(args.cases)), 100000) : 100;
      const seed = Number.isFinite(Number(args.seed)) ? Math.floor(Number(args.seed)) : 424242;
      const rep = runProperties(ast, { cases, seed });
      const bad = rep.passed !== rep.total;
      if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(bad ? 1 : 0); return; }
      if (!rep.total) { console.log(`thunder test ${basename(file)} --properties: no property blocks found.`); return; }
      console.log(`thunder test ${basename(file)} --properties: ${rep.total} propert${rep.total === 1 ? 'y' : 'ies'}, ${rep.passed} passed`);
      for (const r of rep.results) {
        if (r.error) { console.log(`  FAIL  ${r.property} , ${r.error}`); continue; }
        if (r.ok) { console.log(`  PASS  ${r.property}  (${r.cases} cases, seed ${r.seed})`); continue; }
        const f = r.failure;
        const inputs = Object.entries(f.inputs).map(([k, v]) => `${k}=${v}`).join(', ');
        console.log(`  FAIL  ${r.property}  (seed ${r.seed})`);
        console.log(`        smallest failure: ${inputs}  ->  ${f.expect} (got ${f.actual})`);
      }
      process.exit(bad ? 1 : 0);
      return;
    }

    // Scenario tests: workflow-level given/when/then/never. Deterministically flags a scenario
    // that both expects and prohibits the same outcome; otherwise DECLARED (needs runtime evidence).
    if (args.scenarios) {
      const scenarios = ast.scenarios || [];
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const results = scenarios.map((sc) => {
        const neverSet = new Set(sc.never.map(norm));
        const positives = [...sc.then, ...sc.eventually.flatMap((e) => e.clauses)];
        const contradictions = positives.filter((p) => neverSet.has(norm(p)));
        return { scenario: sc.name, status: contradictions.length ? 'failed' : 'declared', given: sc.given.length, then: positives.length, never: sc.never.length, contradictions };
      });
      const failed = results.filter((r) => r.status === 'failed').length;
      const rep = { schema: 'thunder-scenarios-v1', mission: ast.mission, file: basename(file), total: results.length, failed, results };
      if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(failed ? 1 : 0); return; }
      if (!rep.total) { console.log(`thunder test ${basename(file)} --scenarios: no scenario blocks found.`); return; }
      console.log(`thunder test ${basename(file)} --scenarios: ${rep.total} scenario(s), ${rep.total - failed} consistent${failed ? `, ${failed} contradictory` : ''}`);
      for (const r of results) {
        if (r.status === 'failed') console.log(`  FAIL      ${r.scenario} , contradiction: ${r.contradictions.map((c) => `"${c}"`).join(', ')} both expected and prohibited`);
        else console.log(`  DECLARED  ${r.scenario}  (${r.given} given, ${r.then} then, ${r.never} never) , needs runtime evidence`);
      }
      process.exit(failed ? 1 : 0);
      return;
    }

    // All-targets mode: run the tests against EVERY target whose toolchain is available, in one
    // pass, and report each target's pass count side by side. `thunder test <file> --all-targets`.
    if (args.allTargets) {
      const gradeCases = (actual) => {
        const cs = [];
        for (const t of ast.tests || []) {
          if (!(ast.decisions || []).some((d) => d.name === t.name)) continue;
          for (const c of t.cases || []) {
            const key = `${t.name} / ${c.name || 'case'}`;
            const act = actual[key];
            cs.push({ key, expected: c.expect, actual: act, pass: c.expect == null || String(act) === String(c.expect) });
          }
        }
        return cs;
      };
      const report = LIVE_TARGETS.map((t) => {
        const actual = t.available() ? t.run(ast) : null;
        if (actual === null) return { target: t.key, status: 'skipped', reason: `${t.key} toolchain not available` };
        const cases = gradeCases(actual);
        const passed = cases.filter((c) => c.pass).length;
        return { target: t.key, status: passed === cases.length ? 'pass' : 'fail', total: cases.length, passed, cases };
      });
      const bad = report.some((r) => r.status === 'fail');
      if (args.json) { console.log(JSON.stringify({ schema: 'thunder-all-targets-v1', mission: ast.mission, file: basename(file), targets: report }, null, 2)); process.exit(bad ? 1 : 0); return; }
      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const ran = report.filter((r) => r.status !== 'skipped');
      console.log(`thunder test ${basename(file)} --all-targets: ${ran.length}/${report.length} target(s) executed`);
      for (const r of report) {
        if (r.status === 'skipped') { console.log(`  SKIP  ${cap(r.target).padEnd(12)} (toolchain not available)`); continue; }
        console.log(`  ${r.status === 'pass' ? 'PASS' : 'FAIL'}  ${cap(r.target).padEnd(12)} ${r.passed}/${r.total} passed (executed generated code)`);
        for (const c of r.cases) if (!c.pass) console.log(`          FAIL ${c.key} , expected ${c.expected}, got ${c.actual}`);
      }
      process.exit(bad ? 1 : 0);
      return;
    }

    // Target mode: run the tests against the GENERATED TypeScript (executed for real), not the
    // semantic engine. Proves the generated implementation is faithful to the intent.
    // `thunder test <file> --target typescript`.
    if (args.target && RUNNABLE_TARGETS.has(String(args.target).toLowerCase())) {
      const targetKey = canonicalTarget(args.target);
      const actual = runLiveTarget(ast, targetKey);
      // Live target could not run (e.g. python3 not installed) , skip cleanly, don't fail.
      if (actual === null) {
        if (args.json) { console.log(JSON.stringify({ schema: 'thunder-target-v1', target: targetKey, skipped: true, reason: `${targetKey} runtime unavailable` }, null, 2)); return; }
        console.log(`thunder test ${basename(file)} --target ${targetKey}: skipped (the ${targetKey} runtime is not available on this machine).`);
        return;
      }
      const cases = [];
      for (const t of ast.tests || []) {
        const dec = (ast.decisions || []).find((d) => d.name === t.name);
        if (!dec) continue;
        for (const c of t.cases || []) {
          const key = `${t.name} / ${c.name || 'case'}`;
          const act = actual[key];
          cases.push({ key, expected: c.expect, actual: act, pass: c.expect == null || String(act) === String(c.expect) });
        }
      }
      const passed = cases.filter((c) => c.pass).length;
      const bad = passed !== cases.length;
      if (args.json) { console.log(JSON.stringify({ schema: 'thunder-target-v1', target: targetKey, total: cases.length, passed, cases }, null, 2)); process.exit(bad ? 1 : 0); return; }
      if (!cases.length) { console.log(`thunder test ${basename(file)} --target ${targetKey}: no decision test cases to run.`); return; }
      console.log(`thunder test ${basename(file)} --target ${targetKey}: ${passed}/${cases.length} passed (executed generated code)`);
      for (const c of cases) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.key}${c.pass ? '' : `  , expected ${c.expected}, got ${c.actual}`}`);
      process.exit(bad ? 1 : 0);
      return;
    }

    // Semantic coverage: which goals, decision rules, guarantees, prohibitions, scenarios, and
    // targets are actually exercised , meaning-level, not lines. `thunder test <file> --coverage`.
    if (args.coverage) {
      const rep = semanticCoverage(ast);
      const bad = args.strict && rep.unverified.length > 0;
      if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(bad ? 1 : 0); return; }
      console.log(`thunder test ${basename(file)} --coverage: ${rep.overall}% overall`);
      console.log('');
      for (const m of rep.metrics) console.log(`  ${m.name.padEnd(16)} ${`${m.covered}/${m.total}`.padStart(7)}   ${String(m.pct).padStart(3)}%`);
      if (rep.unverified.length) {
        console.log('');
        console.log('  Unverified:');
        for (const u of rep.unverified) console.log(`    - ${u}`);
      }
      process.exit(bad ? 1 : 0);
      return;
    }

    // AI evaluations: probabilistic behavior graded against a dataset by metric thresholds.
    // Declare the bar in ThunderLang; feed measured metrics via --results to gate on them.
    // `thunder test <file> --evals [--results <json|path>] [--strict]`.
    if (args.evals) {
      let results = null;
      if (args.results) {
        try { results = existsSync(args.results) ? JSON.parse(readFileSync(args.results, 'utf8')) : JSON.parse(args.results); }
        catch { console.error('thunder test --evals: --results must be a JSON file path or inline JSON of {metric: value}'); process.exit(2); return; }
      }
      const cmp = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b, '!=': (a, b) => a !== b };
      const evals = (ast.evaluations || []).map((ev) => {
        if (!results) return { name: ev.name, dataset: ev.dataset, status: 'declared', requires: ev.requires };
        const checks = ev.requires.map((r) => {
          const have = results[r.metric];
          if (have === undefined) return { ...r, actual: null, pass: false, missing: true };
          return { ...r, actual: Number(have), pass: cmp[r.op](Number(have), r.threshold) };
        });
        return { name: ev.name, dataset: ev.dataset, status: checks.every((c) => c.pass) ? 'passed' : 'failed', checks };
      });
      const failed = evals.filter((e) => e.status === 'failed').length;
      const declared = evals.filter((e) => e.status === 'declared').length;
      const bad = failed > 0 || (args.strict && declared > 0);
      const rep = { schema: 'thunder-evals-v1', mission: ast.mission, file: basename(file), total: evals.length, passed: evals.filter((e) => e.status === 'passed').length, declared, failed, results: evals };
      if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(bad ? 1 : 0); return; }
      if (!rep.total) { console.log(`thunder test ${basename(file)} --evals: no evaluation blocks found.`); return; }
      console.log(`thunder test ${basename(file)} --evals: ${rep.total} evaluation(s)${results ? `, ${rep.passed} passed${failed ? `, ${failed} failed` : ''}` : ' (declared , provide --results to grade)'}`);
      for (const e of evals) {
        const label = e.status === 'passed' ? 'PASS' : e.status === 'failed' ? 'FAIL' : 'DECLARED';
        console.log(`  ${label.padEnd(9)} ${e.name}${e.dataset ? `  (dataset ${e.dataset})` : ''}`);
        for (const r of (e.checks || e.requires)) {
          const mark = e.checks ? (r.pass ? '✓' : '✗') : '·';
          const actual = e.checks ? (r.missing ? '  (metric not in results)' : `  (${r.actual})`) : '';
          console.log(`    ${mark} ${r.metric} ${r.op} ${r.threshold}${actual}`);
        }
      }
      process.exit(bad ? 1 : 0);
      return;
    }

    // Mutation testing: inject faults into decisions and check the tests catch them.
    // A survived mutant is a weak spot. `thunder test <file> --mutate [--strict]`.
    if (args.mutate) {
      const rep = runMutations(ast);
      const bad = args.strict && rep.survived > 0;
      if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(bad ? 1 : 0); return; }
      if (rep.total === 0) { console.log(`thunder test ${basename(file)} --mutate: ${rep.note}`); return; }
      console.log(`thunder test ${basename(file)} --mutate: mutation score ${rep.score}%  (${rep.killed} killed, ${rep.survived} survived of ${rep.total})`);
      const survivors = rep.results.filter((r) => !r.killed);
      if (survivors.length) { console.log('  survived , the tests did not catch these (weak spots):'); for (const s of survivors) console.log(`    - ${s.describe}`); }
      process.exit(bad ? 1 : 0);
      return;
    }

    // Contract-test derivation: every `guarantee` and `never` is a test obligation.
    // Honest resolution: no verification -> UNVERIFIED (never silently PASS); a declared
    // verification with the file's checks green -> PASS; a failing in-file check -> FAIL.
    // `--strict` also fails the run on any UNVERIFIED obligation (CI: nothing left unproven).
    if (args.contracts) {
      const res = resolveObligations(ast);
      const obligations = res.obligations;
      const rep = { schema: 'thunder-contracts-v1', mission: ast.mission, file: basename(file),
        total: obligations.length, verified: res.verified, declared: res.declared,
        unverified: res.unverified, failed: res.failed, obligations };
      const bad = rep.failed > 0 || (args.strict && rep.unverified > 0);
      if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(bad ? 1 : 0); return; }
      if (!rep.total) { console.log(`thunder test ${basename(file)} --contracts: no guarantees or prohibitions declared.`); return; }
      console.log(`thunder test ${basename(file)} --contracts: ${rep.total} obligation(s), ${rep.verified} verified, ${rep.declared} declared, ${rep.unverified} unverified${rep.failed ? `, ${rep.failed} failed` : ''}`);
      const LABEL = { verified: 'PASS', failed: 'FAIL', declared: 'DECLARED', unverified: 'UNVERIFIED' };
      for (const o of obligations) {
        const by = o.kinds.length ? `  by ${o.kinds.join('+')}` : '';
        const detail = o.provenBy ? `  proven by test ${o.provenBy}`
          : o.status === 'declared' ? '  (declared, runs in target mode)'
          : o.status === 'unverified' ? '  (nothing verifies this)' : '';
        console.log(`  ${LABEL[o.status].padEnd(10)} ${o.kind} ${o.id}: ${o.text}${by}${detail}`);
      }
      if (args.strict && rep.unverified) console.log(`\n  strict: ${rep.unverified} unverified obligation(s) , run fails until every claim carries a verification.`);
      process.exit(bad ? 1 : 0);
      return;
    }

    const r = runTests(ast);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); return; }
    if (r.total === 0) { console.log(`thunder test ${basename(file)}: no test blocks found.`); return; }
    console.log(`thunder test ${basename(file)}: ${r.passed}/${r.total} passed`);
    for (const c of r.results) {
      const detail = c.error ? `  ${c.error}`
        : c.kind === 'lifecycle' ? `expected ${c.expected ?? '(any)'}, got ${c.actual} (valid=${c.valid})`
        : `expected ${c.expected}, got ${c.actual}`;
      console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.target} / ${c.case}${c.pass ? '' : `  , ${detail}`}`);
    }
    process.exit(r.ok ? 0 : 1);
    return;
  }

  // PROVE: run the tests, evaluate guarantee / prohibition obligations, and emit a durable
  // intent-proof-v1 artifact with honest statuses. Unverified claims never read as passed.
  // `thunder prove <file> [--out <dir>] [--json]`.
  if (cmd === 'prove') {
    if (!file || !existsSync(file)) { console.error('usage: thunder prove <file> [--out <dir>] [--json]'); process.exit(2); return; }
    const source = readFileSync(file, 'utf8');
    const ast = parseIntent(source);
    const diagnostics = semanticDiagnostics(ast);
    const resolved = resolveObligations(ast);
    const tests = resolved.tests;
    const proof = buildProof(ast, {
      sourceFile: basename(file),
      sourceHash: sha256(source),
      targetsRequested: ast.targets || [],
      targetsGenerated: [],
      diagnostics,
      generatedAt: new Date().toISOString(),
    });
    // Fold per-claim verdicts into the proof so it records real status, not just planned/needs_verification.
    const CLAIM_MAP = { verified: 'verified', failed: 'failed', declared: 'planned', unverified: 'needs_verification' };
    const byId = new Map(resolved.obligations.map((o) => [o.id, o]));
    const applyStatus = (claim) => { const o = byId.get(claim.id); return o ? { ...claim, status: CLAIM_MAP[o.status], provenBy: o.provenBy || null } : claim; };
    proof.guarantees = proof.guarantees.map(applyStatus);
    proof.neverRules = proof.neverRules.map(applyStatus);
    // Freshness tuple: what `thunder verify` recomputes to mark this proof STALE later.
    proof.freshness = freshnessFor(file, proof, args.env);
    const proofId = `proof-${proof.sourceHash.replace('sha256:', '').slice(0, 6)}`;
    const fail = !proof.verification.semanticPassed || !tests.ok || resolved.failed > 0;

    if (args.json) {
      console.log(JSON.stringify({ proofId, ...proof, tests }, null, 2));
      process.exit(fail ? 1 : 0);
      return;
    }

    console.log(`Proof created: ${proofId}`);
    console.log('');
    console.log(`  Intent:        ${proof.missionName || stripSourceExt(basename(file))}`);
    console.log(`  Intent hash:   ${proof.sourceHash}`);
    console.log(`  Compiler:      ThunderLang ${proof.compilerVersion}`);
    console.log(`  Generated:     ${proof.generatedAt}`);
    console.log(`  Syntax:        ${proof.verification.syntaxPassed ? 'PASS' : 'FAIL'}`);
    console.log(`  Semantics:     ${proof.verification.semanticPassed ? 'PASS' : 'FAIL'}`);
    console.log(`  Tests:         ${tests.total ? `${tests.passed}/${tests.total} passed` : 'none'}`);
    console.log(`  Claims:        ${resolved.verified} verified, ${resolved.declared} declared, ${resolved.unverified} UNVERIFIED${resolved.failed ? `, ${resolved.failed} FAILED` : ''}  (of ${resolved.obligations.length})`);
    console.log(`  Proof status:  ${String(proof.proofStatus).toUpperCase()}${(resolved.unverified || resolved.failed) ? '  (not fully proven)' : ''}`);
    const fr = proof.freshness;
    console.log(`  Bound to:      commit ${fr.implementation ? fr.implementation.slice(0, 7) : 'n/a'}${fr.dependencies ? ` · deps ${fr.dependencies.hash.replace('sha256:', '').slice(0, 7)} (${fr.dependencies.file})` : ''}${fr.environment ? ` · env ${fr.environment}` : ''}`);
    const problems = resolved.obligations.filter((o) => o.status === 'unverified' || o.status === 'failed');
    if (problems.length) {
      console.log('');
      console.log('  Not proven (this is where drift hides , a claim like this never counts as proven):');
      for (const o of problems) console.log(`    - ${o.status === 'failed' ? 'FAILED    ' : 'UNVERIFIED'} ${o.kind} ${o.id}: ${o.text}`);
    }
    const outName = `${slug(ast.mission || stripSourceExt(basename(file)))}.thunder-proof.json`;
    const outDir = args.out && args.out !== '.intent' ? args.out : dirname(file);
    const outPath = join(outDir, outName);
    writeFileSync(outPath, JSON.stringify(proof, null, 2));
    console.log('');
    console.log(`  wrote ${relative(process.cwd(), outPath)}`);
    process.exit(fail ? 1 : 0);
    return;
  }

  // `thunder evidence <file>` , project the intent's proof into evidence-event-v1 events for the
  // shared SkillsTech evidence graph (STW spine). Deterministic, offline, safe-derived; prints JSON.
  // The network push to the spine belongs to the org-layer/CI, not this CLI.
  if (cmd === 'evidence') {
    if (!file || !existsSync(file)) { console.error('usage: thunder evidence <file>  # emit evidence-event-v1 JSON for the shared proof spine'); process.exit(2); return; }
    const source = readFileSync(file, 'utf8');
    const ast = parseIntent(source);
    const diagnostics = semanticDiagnostics(ast);
    const resolved = resolveObligations(ast);
    const proof = buildProof(ast, {
      sourceFile: basename(file),
      sourceHash: sha256(source),
      targetsRequested: ast.targets || [],
      targetsGenerated: [],
      diagnostics,
      generatedAt: new Date().toISOString(),
    });
    const CLAIM_MAP = { verified: 'verified', failed: 'failed', declared: 'planned', unverified: 'needs_verification' };
    const byId = new Map(resolved.obligations.map((o) => [o.id, o]));
    const applyStatus = (claim) => { const o = byId.get(claim.id); return o ? { ...claim, status: CLAIM_MAP[o.status], provenBy: o.provenBy || null } : claim; };
    proof.guarantees = proof.guarantees.map(applyStatus);
    proof.neverRules = proof.neverRules.map(applyStatus);
    proof.freshness = freshnessFor(file, proof, args.env);
    const events = toEvidenceEvents(proof);
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  // CONFORMANCE: the same test cases run against every target. The engine defines the canonical
  // result each case must produce; target outputs fed via --results are graded against it.
  // `thunder conform <file> [--targets ts,py] [--results <json|path>] [--json]`.
  if (cmd === 'conform') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    let results = null;
    if (args.results) {
      try { results = existsSync(args.results) ? JSON.parse(readFileSync(args.results, 'utf8')) : JSON.parse(args.results); }
      catch { console.error('thunder conform: --results must be JSON of {target: {"Test / case": result}} (file path or inline)'); process.exit(2); return; }
    }
    let targets = (args.targets && args.targets.length ? args.targets : (ast.targets || [])).map((t) => canonicalTarget(t));
    const skippedTargets = [];
    // --all-targets: execute EVERY target whose toolchain is available in one pass, and show all
    // live targets as columns (unavailable ones stay "declared" with a skipped note).
    if (args.allTargets) {
      results = results || {};
      targets = Array.from(new Set([...targets, ...LIVE_TARGETS.map((t) => t.key)]));
      for (const t of LIVE_TARGETS) {
        if (!t.available()) { skippedTargets.push(t.key); continue; }
        const actual = t.run(ast);
        if (actual !== null) results[t.key] = actual; else skippedTargets.push(t.key);
      }
    }
    // --run <targets>: execute specific live targets (TypeScript/JS/Python/C#/Java) and grade real
    // outputs. A null result (e.g. the SDK is not installed) is skipped, leaving it "declared".
    if (args.run && args.run.length) {
      results = results || {};
      for (const rt of args.run) {
        if (!RUNNABLE_TARGETS.has(rt.toLowerCase())) continue;
        const key = canonicalTarget(rt);
        const actual = runLiveTarget(ast, key);
        if (actual !== null) results[key] = actual;
      }
    }
    const rep = buildConformance(ast, { targets, results });
    if (skippedTargets.length) rep.skipped = Array.from(new Set(skippedTargets));
    const bad = rep.semanticFailures > 0 || rep.failures.length > 0;
    if (args.evidence) {
      const ctx = { compilerVersion: COMPILER_VERSION, occurredAt: new Date().toISOString(), missionName: ast.mission || null, intentHash: sha256(readFileSync(file, 'utf8')) };
      console.log(JSON.stringify(conformToEvidence(rep, ctx), null, 2));
      process.exit(bad ? 1 : 0); return;
    }
    if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(bad ? 1 : 0); return; }
    if (!rep.total) { console.log(`thunder conform ${basename(file)}: no test cases to conform.`); return; }

    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const cols = ['Semantic', ...rep.columns.map(cap)];
    const labelW = Math.max(12, ...rep.cases.map((c) => c.key.length));
    const cw = (h) => Math.max(h.length, 8);
    const cell = (v, w) => String(v).padEnd(w);
    console.log(`thunder conform ${basename(file)}: ${rep.total} case(s) · semantic + ${rep.columns.length} target(s)${rep.graded ? '' : ' (declared , provide --results to grade targets)'}`);
    console.log(`  ${cell('', labelW)}  ${cols.map((h) => cell(h, cw(h))).join('  ')}`);
    for (const c of rep.cases) {
      const sem = c.semanticPass ? 'PASS' : 'FAIL';
      const tcells = rep.columns.map((col) => {
        const s = c.targets[col].status;
        return cell(s === 'pass' ? 'PASS' : s === 'fail' ? 'FAIL' : '—', cw(cap(col)));
      });
      console.log(`  ${cell(c.key, labelW)}  ${cell(sem, cw('Semantic'))}  ${tcells.join('  ')}`);
    }
    for (const f of rep.failures) {
      console.log('');
      console.log('  CONFORMANCE FAILURE');
      console.log(`    Target:   ${cap(f.target)}`);
      console.log(`    Case:     ${f.case}`);
      console.log(`    Expected: ${f.expected}`);
      console.log(`    Actual:   ${f.actual}`);
    }
    if (rep.skipped && rep.skipped.length) {
      console.log('');
      console.log(`  Skipped (toolchain not available, left declared): ${rep.skipped.map(cap).join(', ')}`);
    }
    process.exit(bad ? 1 : 0);
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
    console.log(`thunder validate ${basename(file)}: ${v.valid ? 'VALID' : `${v.issues.length} issue(s)`} (${v.version})`);
    for (const i of v.issues) console.log(`  [${i.code}] ${i.message}${i.id ? ` (${i.id})` : ''}`);
    process.exit(v.valid ? 0 : 1);
    return;
  }

  if (cmd === 'migrate') {
    const raw = readFileSync(file, 'utf8');
    let graph;
    try { graph = JSON.parse(raw); } catch { console.error('thunder migrate: input is not valid JSON'); process.exit(2); return; }
    if (!graph || !Array.isArray(graph.nodes)) { console.error('thunder migrate: not an Intent Graph (no nodes[])'); process.exit(2); return; }
    let result;
    try { result = migrateGraph(graph, args.to ? { to: args.to } : {}); }
    catch (e) { console.error(`thunder migrate: ${e instanceof Error ? e.message : e}`); process.exit(2); return; }
    const v = validateGraph(result.graph);
    if (args.json) { console.log(JSON.stringify({ ...result, validation: v }, null, 2)); process.exit(v.valid ? 0 : 1); return; }
    console.log(`thunder migrate: ${result.from} -> ${result.to} (${result.migrated ? result.applied.length + ' step(s)' : 'already current'})`);
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
      console.log(`thunder source: wrote ${writeText(args.out, `${slug(base)}.intent`, src)}`);
    } else {
      process.stdout.write(src);
    }
    return;
  }

  // Import adapters: lift an external DMN / BPMN document back into ThunderLang source.
  if (cmd === 'import') {
    const xml = readFileSync(file, 'utf8');
    const fmt = args.format || detectFormat(xml);
    if (!fmt || !IMPORT_FORMATS.includes(fmt)) {
      console.error(`thunder import: could not detect format; pass --format <${IMPORT_FORMATS.join('|')}>`);
      process.exit(2); return;
    }
    const report = importReport(xml, fmt);
    if (report == null) { console.error(`thunder import: unsupported format "${fmt}"`); process.exit(2); return; }
    if (args.json) { console.log(JSON.stringify(report, null, 2)); return; }
    const src = report.source;
    if (args.out && args.out !== '.intent') {
      const base = basename(file).replace(/\.[^.]+$/, '');
      const p = writeText(args.out, `${slug(base)}.intent`, src);
      console.log(`thunder import: wrote ${p}`);
    } else {
      process.stdout.write(src.endsWith('\n') ? src : src + '\n');
    }
    // Fidelity warnings go to stderr, so stdout stays clean for piping the source.
    for (const w of report.warnings) console.error(`thunder import: [${w.code}] ${w.message}`);
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
      const name = `${slug(ast.mission || stripSourceExt(basename(file)))}.${res.ext}`;
      const p = writeText(args.out, name, res.content);
      console.log(`thunder export: wrote ${p}`);
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
      console.log(`thunder atlas search "${args.search}": ${hits.length} hit(s)`);
      for (const h of hits) console.log(`  ${h.type.padEnd(18)} ${h.id}${h.title ? `  , ${h.title}` : ''}`);
      return;
    }
    if (args.expand) {
      const ex = expandNode(atlas, args.expand);
      if (!ex) { console.error(`thunder atlas: no node "${args.expand}".`); process.exit(2); return; }
      if (args.json) { console.log(JSON.stringify(ex, null, 2)); return; }
      console.log(`${ex.node.type} ${ex.node.id}${ex.node.title ? `  , ${ex.node.title}` : ''}`);
      for (const e of ex.out) console.log(`  -> ${e.rel.padEnd(16)} ${e.node.id}`);
      for (const e of ex.inbound) console.log(`  <- ${e.rel.padEnd(16)} ${e.node.id}`);
      return;
    }
    if (args.json) { console.log(JSON.stringify(atlas, null, 2)); return; }
    console.log(`thunder atlas ${root}: ${atlas.overview.missions} mission(s), ${atlas.overview.nodes} node(s), ${atlas.overview.relationships} edge(s)`);
    console.log(`  ${JSON.stringify(atlas.overview.byType)}`);
    for (const m of atlas.missions) console.log(`  mission  ${m.id}${m.title ? `  , ${m.title}` : ''}`);
    console.log('  expand a node: thunder atlas . --expand <id> | search: --search <query>');
    return;
  }

  // Mission Atlas index: aggregate every .intent under a directory into one inventory.
  if (cmd === 'index') {
    const root = file;
    let intentFiles;
    try {
      intentFiles = collectIntents(root).map((f) => ({ path: relative(root, f), source: readFileSync(f, 'utf8') }));
    } catch (e) {
      console.error(`thunder index: cannot read "${root}": ${e instanceof Error ? e.message : e}`);
      process.exit(2);
      return;
    }
    const index = buildMissionIndex(intentFiles, { product: args.product });
    if (args.json) { console.log(JSON.stringify(index, null, 2)); return; }
    console.log(`thunder index ${root}: ${index.summary.missions} mission(s)`);
    console.log(`  ${JSON.stringify(index.summary.byArea)}`);
    for (const m of index.missions) {
      console.log(`  ${m.mission.padEnd(24)} ${String(m.risk).padEnd(7)} G:${m.guarantees} N:${m.neverRules} verify:${m.verification}${m.reviewed ? ' reviewed' : ''}`);
    }
    console.log(`  ${index.summary.declaredFull} declared-full, ${index.summary.declaredPartial} partial, ${index.summary.unverified} unverified, ${index.summary.highRisk} high-risk`);
    console.log('  note: verification is DECLARED, not proven. Test/drift status needs OpenThunder.');
    return;
  }

  // `thunder verify-diff <intent> --after <code> [--before <code>]` , the AI-loop gate: prove
  // deterministically which of the intent's guarantees/never-rules a code change upholds or breaks.
  if (cmd === 'verify-diff') {
    const intentText = readFileSync(file, 'utf8');
    if (!args.after) { console.error('usage: thunder verify-diff <intent> --after <codeFile> [--before <codeFile>] [--from <lang>]'); process.exit(2); return; }
    const after = readFileSync(args.after, 'utf8');
    const before = args.before ? readFileSync(args.before, 'utf8') : null;
    const language = args.from || languageForFile(args.after);
    const r = verifyDiff(intentText, { before, after, language });
    if (args.evidence) {
      const ctx = { compilerVersion: COMPILER_VERSION, occurredAt: new Date().toISOString(), missionName: parseIntent(intentText).mission || null, intentHash: sha256(intentText), changeHash: sha256(after) };
      console.log(JSON.stringify(verifyDiffToEvidence(r, ctx), null, 2));
      process.exit(r.ok ? 0 : 1); return;
    }
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); return; }
    console.log(`thunder verify-diff ${basename(file)} vs ${basename(args.after)}: ${r.verdict} (${r.blocking} blocking, ${r.summary.regressions} regression(s))`);
    for (const f of r.findings) {
      const tag = f.code === 'INTENT_VERIFY_NEVER_VIOLATED' ? 'VIOLATION' : f.regression ? 'REGRESSION' : f.level.toUpperCase();
      console.log(`  [${tag}] ${f.message}${f.line ? `  (line ${f.line})` : ''}`);
    }
    if (r.ok) console.log('  ok the change upholds the declared contract (deterministic checks; tests + humans still own correctness).');
    process.exit(r.ok ? 0 : 1);
    return;
  }

  // `thunder draft --brief <json|->` , scaffold a rigorous intent draft from a structured brief,
  // plus a review checklist of what a human must still fill in. Prints the draft; --write saves it.
  if (cmd === 'draft') {
    const briefPath = args.brief || (cmd === 'draft' && file && file.endsWith('.json') ? file : null);
    if (!briefPath) { console.error('usage: intent draft --brief <brief.json|-> [--write <out.intent>]'); process.exit(2); return; }
    const raw = briefPath === '-' ? readFileSync(0, 'utf8') : readFileSync(briefPath, 'utf8');
    let brief;
    try { brief = JSON.parse(raw); } catch { console.error('intent draft: --brief is not valid JSON'); process.exit(2); return; }
    const r = draftIntent(brief);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return; }
    if (args.write) { writeFileSync(args.write, r.source); console.error(`thunder draft: wrote ${args.write}`); }
    else process.stdout.write(r.source);
    if (r.review.length) { console.error('\nreview (fill these in , the draft is a proposal, not verified):'); for (const x of r.review) console.error(`  - ${x.message}`); }
    return;
  }

  // `thunder guard <file>` , preview what a runtime guard compiled from this intent enforces:
  // which fields it redacts (secrets/PII) and which decisions it can gate at runtime.
  if (cmd === 'guard') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const g = guardSummary(ast);
    if (args.json) { console.log(JSON.stringify(g, null, 2)); return; }
    console.log(`thunder guard ${basename(file)}:`);
    console.log(`  redacts fields   ${g.redactsFields.length ? g.redactsFields.join(', ') : '(none declared secret/PII)'}`);
    console.log(`  enforces decisions ${g.enforcesDecisions.length ? g.enforcesDecisions.join(', ') : '(none)'}`);
    if (g.neverRules.length) { console.log('  never rules:'); for (const n of g.neverRules) console.log(`    - ${n}`); }
    console.log('  use: import { compileGuard } from "@skillstech/thunderlang/core"');
    return;
  }

  // `thunder ledger <file.json>` , verify the tamper-evident chain, and explain a subject's history
  // (why it was built, who approved it, what was assumed/corrected/verified, which risks accepted).
  if (cmd === 'ledger') {
    if (!file) { console.error('usage: intent ledger <ledger.json> [--subject <id>] [--json]'); process.exit(2); return; }
    let ledger;
    try { ledger = JSON.parse(readFileSync(file, 'utf8')); } catch { console.error('intent ledger: not valid JSON'); process.exit(2); return; }
    const chain = verifyLedger(ledger);
    if (args.subject) {
      const ex = ledgerExplain(ledger, args.subject);
      if (args.json) { console.log(JSON.stringify({ chain, ...ex }, null, 2)); process.exit(chain.valid ? 0 : 1); return; }
      console.log(`thunder ledger ${basename(file)} , ${args.subject}  (chain ${chain.valid ? 'VALID' : 'BROKEN'})`);
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
    console.log(`thunder ledger ${basename(file)}: ${n} entr${n === 1 ? 'y' : 'ies'}, chain ${chain.valid ? 'VALID (tamper-evident)' : `BROKEN at #${chain.brokenAt} , ${chain.reason}`}`);
    process.exit(chain.valid ? 0 : 1);
    return;
  }

  // `thunder impact <base> <proposed>` , the Simulator: estimate a change's impact BEFORE building it
  // , the deterministic blast radius, the risk it would introduce, contradictions, release risk.
  if (cmd === 'impact') {
    const baseArg = args._[0]; const propArg = args._[1];
    if (!baseArg || !propArg) { console.error('usage: intent impact <base.intent|dir> <proposed.intent|dir> [--json]'); process.exit(2); return; }
    const collect = (p) => (existsSync(p) && statSync(p).isDirectory() ? collectIntents(p) : [p]).map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') }));
    const r = simulateChange(collect(baseArg), collect(propArg));
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.summary.safe ? 0 : 1); return; }
    console.log(`thunder impact: ${r.summary.safe ? 'SAFE' : 'REVIEW'}  (${baseArg} -> ${propArg})`);
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

  // `thunder guardian <before> <after>` , drift detection: what a change did to the intent , which
  // intent it affects, what risk it introduced, what must be reverified, what learning is stale.
  if (cmd === 'guardian') {
    const beforeArg = args._[0]; const afterArg = args._[1];
    if (!beforeArg || !afterArg) { console.error('usage: intent guardian <before.intent|dir> <after.intent|dir> [--json]'); process.exit(2); return; }
    const collect = (p) => (existsSync(p) && statSync(p).isDirectory() ? collectIntents(p) : [p]).map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') }));
    const r = guardianReport(collect(beforeArg), collect(afterArg));
    if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.verdict === 'needs-attention' ? 1 : 0); return; }
    const c = r.changed;
    console.log(`thunder guardian: ${r.verdict.toUpperCase()}  (${beforeArg} -> ${afterArg})`);
    console.log(`  changed    +${c.nodesAdded} / -${c.nodesRemoved} / ~${c.nodesChanged} nodes, +${c.relationshipsAdded} / -${c.relationshipsRemoved} relationships`);
    if (r.affectedIntent.length) console.log(`  affected   ${r.affectedIntent.map((n) => n.title || n.id).join(', ')}`);
    if (r.introducedRisk.length) { console.log(`  introduced risk (${r.introducedRisk.length}):`); for (const f of r.introducedRisk.slice(0, 6)) console.log(`    [${f.severity}] ${f.ruleId} , ${f.detected}`); }
    if (r.resolvedRisk.length) console.log(`  resolved risk: ${r.resolvedRisk.length}`);
    if (r.mustReverify.length) { console.log(`  must reverify (${r.mustReverify.length}):`); for (const m of r.mustReverify.slice(0, 6)) console.log(`    ${m.type} ${m.title || m.id} , ${m.reason}`); }
    if (r.staleLearning.length) { console.log('  learning to refresh:'); for (const l of r.staleLearning.slice(0, 6)) console.log(`    ${l.scope} , ${l.reason}`); }
    process.exit(r.verdict === 'needs-attention' ? 1 : 0);
    return;
  }

  // `thunder scan [dir]` , the Scanner spine: intent -> Intent IR -> explainable Fable findings ->
  // risk themes. Deterministic, no AI. --json for the machine report; --ir writes the merged IR.
  // Part 3 focused scan queries , one question each over the Intent IR + Fable findings:
  // `thunder risks | gaps | unverified | coverage | unknowns | contradictions [dir] [--json]`.
  if (VIEWS[cmd]) {
    const root = file || '.';
    const targets = existsSync(root) && statSync(root).isDirectory() ? collectIntents(root) : [root];
    if (!targets.length || !existsSync(targets[0])) { console.error(`thunder ${cmd}: no .intent files under ${root}`); process.exit(2); return; }
    const scan = scanProject(targets.map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') })));
    const v = VIEWS[cmd](scan);
    if (args.json) { console.log(JSON.stringify(v, null, 2)); return; }
    if (cmd === 'coverage') {
      console.log(`thunder coverage ${root}: ${v.verified}/${v.total} claims verified (${v.coverage}%)`);
      for (const c of v.unverified) console.log(`  unverified [${c.type}] ${c.title}`);
      process.exit(v.coverage === 100 ? 0 : 1); return;
    }
    if (cmd === 'risks') {
      const s = v.bySeverity;
      console.log(`thunder risks ${root}: ${v.count} risk theme(s)  ,  ${s.blocker || 0} blocker, ${s.error || 0} error, ${s.warning || 0} warning, ${s.info || 0} info`);
      for (const t of v.themes) console.log(`  ${String(t.count).padStart(3)}  ${t.category}${t.blocker ? `  (${t.blocker} blocker)` : ''}`);
      for (const r of v.remediationSequence.slice(0, 5)) console.log(`  fix [${r.severity}] ${r.ruleId} (${r.count}x) , ${r.remediation}`);
      process.exit((s.blocker || 0) + (s.error || 0) === 0 ? 0 : 1); return;
    }
    // gaps / unverified / unknowns / contradictions , a uniform list
    console.log(`thunder ${cmd} ${root}: ${v.count}`);
    for (const g of v.gaps || []) console.log(`  [${g.severity}] ${g.ruleId} , ${g.detected}`);
    for (const c of v.claims || []) console.log(`  [${c.type}] ${c.title}`);
    for (const u of v.unknowns || []) console.log(`  [${u.type}] ${u.title}${u.confidence ? `  (${u.confidence})` : ''}`);
    for (const c of v.conflicts || []) console.log(`  [Conflict] ${c.title}`);
    for (const l of v.links || []) console.log(`  ${l.from} ${l.type} ${l.to}`);
    for (const f of v.findings || []) console.log(`  ${f.ruleId} , ${f.detected}`);
    process.exit(v.count === 0 ? 0 : 1);
    return;
  }

  if (cmd === 'scan') {
    const root = file || '.';
    const targets = existsSync(root) && statSync(root).isDirectory() ? collectIntents(root) : [root];
    const result = scanProject(targets.map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') })));
    if (args.ir) { writeFileSync(args.ir, JSON.stringify(result.ir, null, 2)); console.error(`thunder scan: wrote Intent IR (${result.ir.nodes.length} nodes) to ${args.ir}`); }
    if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); return; }
    const s = result.bySeverity;
    console.log(`thunder scan ${root}: ${result.totals.findings} finding(s) across ${result.totals.missions} mission(s) in ${result.totals.files} file(s)`);
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

  // `thunder report [dir]` , a repo-wide intent health summary (aggregates every .intent file).
  // Distinct from `check` (pass/fail gate): counts by severity + area, top codes, and coverage.
  if (cmd === 'report') {
    const root = file || '.';
    const targets = existsSync(root) && statSync(root).isDirectory() ? collectIntents(root) : [root];
    const rep = buildReport(targets.map((f) => ({ file: relative(process.cwd(), f) || f, source: readFileSync(f, 'utf8') })));
    if (args.json) { console.log(JSON.stringify(rep, null, 2)); process.exit(0); return; }
    const c = rep.coverage;
    console.log(`thunder report ${root}: ${rep.totals.missions} mission(s) in ${rep.totals.files} file(s), ${rep.totals.diagnostics} diagnostic(s)`);
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

  // `thunder check <file|dir> --format sarif` emits a SARIF 2.1.0 log so ThunderLang
  // diagnostics show up natively in GitHub/GitLab code scanning and SARIF-aware IDEs.
  // This is a REPORT (exit 0); gate the build with a plain `thunder check .` step.
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

  // `thunder check <dir>` recurses and gates every .intent file (self-contained CI, no
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
    console.log(`thunder check ${file}: ${reports.length - failed.length}/${reports.length} passed`);
    for (const r of reports) console.log(`  ${r.ok ? 'ok ' : 'ERR'} ${r.file}${r.errors ? ` , ${r.errors} error(s)` : ''}${r.warnings ? ` (${r.warnings} warning(s))` : ''}`);
    process.exit(failed.length ? 1 : 0);
  }

  // `thunder edit <file>` , apply structural field edits (intent-patch-v1) to the source,
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
      console.error(`thunder edit ${basename(file)}: applied ${result.applied.length}, skipped ${result.skipped.length}.`);
    } else if (!args.json) {
      process.stdout.write(result.source);
    }
    process.exit(0);
    return;
  }

  // `thunder fmt <file|dir>` , canonical formatting (whitespace only; content + comments
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
      if (unformatted.length) { console.error(`thunder fmt --check: ${unformatted.length} file(s) not formatted:`); for (const u of unformatted) console.error(`  ${u}`); process.exit(1); }
      console.log('thunder fmt --check: all formatted.');
      process.exit(0);
    }
    if (args.write) console.log(`thunder fmt: formatted ${changed} file(s), ${targets.length - changed} already clean.`);
    return;
  }

  const { source, ast, sourceHash, sourceFile } = load(file);
  const generatedAt = new Date().toISOString();
  const diagnostics = semanticDiagnostics(ast);
  const outDir = join(args.out, slug(ast.mission || stripSourceExt(basename(file))));

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
    console.log(`thunder check ${sourceFile} (mission: ${ast.mission})`);
    process.exit(printDiagnostics(diags) > 0 ? 1 : 0);
  }

  const generated = [];
  // `thunder graph <file> --safe` , a display-safe intent-graph on stdout, for external viewers
  // (e.g. STT rendering the Intent Atlas). Strips owner/source provenance and redacts sensitive
  // classifications; carries no source code.
  if (cmd === 'graph' && args.safe) {
    console.log(JSON.stringify(safeGraph(buildIntentGraph(ast)), null, 2));
    return;
  }
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
    generated.push(writeJson(outDir, '.thunder-proof.json', proof));
  }
  if (!['graph', 'proof', 'build'].includes(cmd)) {
    console.error(`unknown command: ${cmd}`);
    process.exit(2);
  }
  console.log(`thunder ${cmd} ${sourceFile} -> ${outDir}`);
  for (const p of generated) console.log(`  wrote ${p.replace(process.cwd() + '/', '')}`);
  printDiagnostics(diagnostics);
}

main();
