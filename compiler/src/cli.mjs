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

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseIntent, slug } from './parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256,
} from './emit.mjs';
import { renderMarkdown, renderMermaid, renderTestplan } from './compile.mjs';
import { getCompletions, getHover } from './intellisense.mjs';
import { liftSource, liftRepo, languageForFile } from './lift.mjs';
import { approveIntent, checkDrift, buildDriftHandoff } from './drift.mjs';
import { buildMissionIndex } from './atlas.mjs';

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
    if (a === '--out') args.out = argv[++i];
    else if (a === '--no-ai') args.noAi = true;
    else if (a === '--position') args.position = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--intent') args.intent = argv[++i];
    else if (a === '--by') args.by = argv[++i];
    else if (a === '--at') args.at = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--targets') args.targets = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--product') args.product = argv[++i];
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

function load(file) {
  const source = readFileSync(file, 'utf8');
  const ast = parseIntent(source);
  return { source, ast, sourceHash: sha256(source), sourceFile: basename(file) };
}

function printDiagnostics(diags) {
  for (const d of diags) {
    console.log(`  [${d.level}] ${d.code}: ${d.message}`);
    if (d.why) console.log(`      why: ${d.why}`);
    if (d.fix && d.fix.length) console.log(`      fix: ${d.fix[0].label}`);
  }
  const errors = diags.filter((d) => d.level === 'error').length;
  const warnings = diags.filter((d) => d.level === 'warning').length;
  console.log(`  ${errors} error(s), ${warnings} warning(s)`);
  return errors;
}

function main() {
  const [cmd, ...restArgv] = process.argv.slice(2);
  const args = parseArgs(restArgv);
  const file = args._[0];
  if (!cmd || !file) {
    console.error('usage: intent <check|graph|proof|build> <file.intent> [--out .intent] [--no-ai]');
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

  const { source, ast, sourceHash, sourceFile } = load(file);
  const generatedAt = new Date().toISOString();
  const diagnostics = semanticDiagnostics(ast);
  const outDir = join(args.out, slug(ast.mission || basename(file, '.intent')));

  if (cmd === 'completions' || cmd === 'hover') {
    const [ln, coln] = (args.position || '1:1').split(':').map(Number);
    const out = cmd === 'completions'
      ? getCompletions(source, { line: ln, column: coln })
      : getHover(source, { line: ln, column: coln });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'check') {
    console.log(`intent check ${sourceFile} (mission: ${ast.mission})`);
    process.exit(printDiagnostics(diagnostics) > 0 ? 1 : 0);
  }

  const generated = [];
  if (cmd === 'graph' || cmd === 'build') {
    generated.push(writeJson(outDir, 'contract-graph.json', buildContractGraph(ast, generatedAt)));
    generated.push(writeJson(outDir, 'architecture-graph.json', buildArchitectureGraph(ast, generatedAt)));
    generated.push(writeJson(outDir, 'implementation-plan.json', buildImplementationPlan(ast, generatedAt)));
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
