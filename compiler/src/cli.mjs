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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseIntent, slug } from './parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256,
} from './emit.mjs';

function parseArgs(argv) {
  const args = { _: [], out: '.intent', noAi: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--no-ai') args.noAi = true;
    else if (a === '--targets') args.targets = (argv[++i] || '').split(',').filter(Boolean);
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

function renderMarkdown(ast) {
  const L = [];
  L.push(`# ${ast.mission}`, '');
  if (ast.goal) L.push(`**Goal.** ${ast.goal}`, '');
  if (ast.why) L.push(`**Why.** ${ast.why}`, '');
  if (ast.guarantees.length) {
    L.push('## Guarantees', '');
    for (const g of ast.guarantees) L.push(`- ${g.statement}${g.because ? ` (because ${g.because})` : ''}`);
    L.push('');
  }
  if (ast.neverRules.length) {
    L.push('## Never', '');
    for (const n of ast.neverRules) L.push(`- ${n.statement}${n.because ? ` (because ${n.because})` : ''}`);
    L.push('');
  }
  if (ast.verify.length) { L.push('## Verification', ''); for (const v of ast.verify) L.push(`- ${v}`); L.push(''); }
  return L.join('\n');
}

function renderMermaid(ast) {
  const L = ['graph TD'];
  const m = slug(ast.mission || 'mission');
  L.push(`  ${m}["${ast.mission}"]`);
  ast.guarantees.forEach((g, i) => L.push(`  ${m} --> g${i}["guarantee: ${g.statement}"]`));
  ast.neverRules.forEach((n, i) => L.push(`  ${m} --> n${i}["never: ${n.statement}"]`));
  ast.events.forEach((e) => L.push(`  ${m} --> ev_${e.id}(["event: ${e.name}"])`));
  return L.join('\n') + '\n';
}

function renderTestplan(ast) {
  const L = [`# Test plan: ${ast.mission}`, ''];
  for (const g of ast.guarantees) L.push(`- [ ] Guarantee holds: ${g.statement}${g.verify.length ? ` (via ${g.verify.join(', ')})` : ''}`);
  for (const n of ast.neverRules) L.push(`- [ ] Never occurs: ${n.statement}${n.verify.length ? ` (via ${n.verify.join(', ')})` : ''}`);
  for (const v of ast.verify) L.push(`- [ ] ${v}`);
  return L.join('\n') + '\n';
}

function load(file) {
  const source = readFileSync(file, 'utf8');
  const ast = parseIntent(source);
  return { source, ast, sourceHash: sha256(source), sourceFile: basename(file) };
}

function printDiagnostics(diags) {
  for (const d of diags) console.log(`  [${d.level}] ${d.code}: ${d.message}`);
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
  const { source, ast, sourceHash, sourceFile } = load(file);
  const generatedAt = new Date().toISOString();
  const diagnostics = semanticDiagnostics(ast);
  const outDir = join(args.out, slug(ast.mission || basename(file, '.intent')));

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
