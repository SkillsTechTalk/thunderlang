#!/usr/bin/env node
// Doc-consistency guard for CI. Keeps the docs honest against the shipped compiler so the
// staleness class (dead links, non-existent diagnostic codes, snippets that do not compile,
// unregistered docs) cannot creep back. Exits 1 on any failure, 0 when clean.
//
// Checks:
//   1. Every internal /docs/<slug> link resolves to a docs/<slug>.md file.
//   2. Every `examples/...` path referenced in docs exists.
//   3. Every IL-* diagnostic code cited in docs is one the compiler can emit.
//   4. Every intent-like fenced code block parses with no `unknown-block` diagnostic.
//   5. Every docs/*.md is registered in src/lib/docs.ts (DOC_ORDER), and vice versa.
//
// No dependencies beyond Node (>=18) + the sibling compiler.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../compiler/src/parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DOCS = join(ROOT, 'docs');

const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

const docFiles = readdirSync(DOCS).filter((f) => f.endsWith('.md'));
const docSlugs = new Set(docFiles.map((f) => f.replace(/\.md$/, '')));

// Codes the compiler can actually emit (from the compiler source).
const emittableCodes = new Set();
const compilerSrc = join(ROOT, 'compiler', 'src');
for (const f of readdirSync(compilerSrc).filter((x) => x.endsWith('.mjs'))) {
  const txt = readFileSync(join(compilerSrc, f), 'utf8');
  for (const m of txt.matchAll(/IL-[A-Z]+(?:-[A-Z]+)?-\d+/g)) emittableCodes.add(m[0]);
}

// Intent-source top-level keywords, to identify which fenced blocks are `.intent`.
const KW = new Set(['mission', 'use', 'goal', 'why', 'requires', 'input', 'output', 'guarantees', 'guarantee', 'never', 'metric', 'outcome', 'decision', 'lifecycle', 'command', 'on', 'capability', 'interface', 'release', 'result', 'learning', 'component', 'artifact', 'outcome_contract', 'test', 'data', 'waiver', 'evidence', 'experience', 'pattern', 'style_intent', 'conflict', 'persona', 'customer', 'problem', 'title', 'for', 'assumption', 'unknown', 'question', 'constraints', 'scope', 'non_goal', 'always', 'eventually', 'service', 'api', 'event']);

let blocksChecked = 0;
for (const file of docFiles) {
  const rel = `docs/${file}`;
  const txt = readFileSync(join(DOCS, file), 'utf8');

  // 1. internal /docs links
  for (const m of txt.matchAll(/\/docs\/([a-z0-9-]+)/g)) {
    if (!docSlugs.has(m[1])) fail(rel, `broken internal link /docs/${m[1]}`);
  }
  // 2. example-file references
  for (const m of txt.matchAll(/examples\/[A-Za-z0-9_./-]+\.(?:intent|json|md)/g)) {
    if (!existsSync(join(ROOT, m[0]))) fail(rel, `missing example reference ${m[0]}`);
  }
  // 3. IL-* diagnostic codes
  for (const m of txt.matchAll(/IL-[A-Z]+(?:-[A-Z]+)?-\d+/g)) {
    if (!emittableCodes.has(m[0])) fail(rel, `cites diagnostic code ${m[0]} the compiler never emits`);
  }
  // 4. intent-like code blocks parse
  for (const m of txt.matchAll(/```([a-zA-Z]*)\n([\s\S]*?)```/g)) {
    const lang = m[1];
    if (['js', 'json', 'ts', 'tsx', 'bash', 'sh', 'yaml', 'yml', 'xml', 'html'].includes(lang)) continue;
    const lines = m[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) continue;
    const firstWord = lines[0].split(/\s+/)[0];
    if (!KW.has(firstWord)) continue; // not intent source (prose / CLI output)
    blocksChecked += 1;
    const src = firstWord === 'mission' ? m[2] : `mission DocExample\n${m[2]}`;
    let ast;
    try { ast = parseIntent(src); } catch (e) { fail(rel, `code block threw on parse: ${e.message}`); continue; }
    for (const d of ast.diagnostics.filter((x) => x.code === 'unknown-block')) fail(rel, `code block: ${d.message}`);
  }
}

// 5. doc <-> DOC_ORDER registration
const docsTs = readFileSync(join(ROOT, 'src', 'lib', 'docs.ts'), 'utf8');
const orderMatch = docsTs.match(/const DOC_ORDER = \[([\s\S]*?)\]/);
const ordered = new Set(orderMatch ? [...orderMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []);
for (const slug of docSlugs) if (!ordered.has(slug)) fail('src/lib/docs.ts', `docs/${slug}.md is not in DOC_ORDER`);
for (const slug of ordered) if (!docSlugs.has(slug)) fail('src/lib/docs.ts', `DOC_ORDER entry "${slug}" has no docs/${slug}.md`);

if (problems.length) {
  console.error(`docs-check: ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`docs-check: OK , ${docFiles.length} docs, ${blocksChecked} intent code blocks parsed, ${emittableCodes.size} diagnostic codes, all links + refs resolve.`);
