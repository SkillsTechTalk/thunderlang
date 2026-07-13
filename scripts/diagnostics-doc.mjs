#!/usr/bin/env node
// Generate (and CI-guard) docs/diagnostics.md from the compiler's canonical DIAGNOSTIC_RULES
// catalog, so the reference can never drift from what the compiler actually emits.
//
//   node scripts/diagnostics-doc.mjs           # print the generated doc
//   node scripts/diagnostics-doc.mjs --write   # write docs/diagnostics.md
//   node scripts/diagnostics-doc.mjs --check    # exit 1 if the committed doc is stale
//
// No dependencies beyond Node + the sibling compiler.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DIAGNOSTICS as DIAGNOSTIC_RULES } from '../compiler/src/intent-schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DOC = join(ROOT, 'docs', 'diagnostics.md');

const AREA_TITLES = {
  product: 'Product', evidence: 'Evidence', graph: 'Graph', experience: 'Experience',
  conflict: 'Conflict', governance: 'Governance', privacy: 'Data & privacy',
  outcome: 'Outcome contracts', decision: 'Decisions', distributed: 'Distributed & failure',
  lifecycle: 'Lifecycle', temporal: 'Temporal', style: 'Style intent',
  security: 'Security', type: 'Types', core: 'Core checks', architecture: 'Architecture',
  ai: 'AI implementation', note: 'IntentLens notes',
};

function generate() {
  const byArea = {};
  for (const r of DIAGNOSTIC_RULES) (byArea[r.area] ||= []).push(r);
  const areas = Object.keys(byArea).sort();

  const L = [];
  L.push('# Diagnostics catalog');
  L.push('');
  L.push('> This page is generated from the compiler\'s canonical `DIAGNOSTIC_RULES` catalog');
  L.push('> and CI-guarded, so it always matches what the compiler emits. Do not edit by hand;');
  L.push('> run `npm run diagnostics:emit`.');
  L.push('');
  L.push(`Every rule has a stable **code**, a **severity**, and what it **blocks**. Codes are`);
  L.push('the contract: editors, CI, and OpenThunder key off them, and they never change meaning');
  L.push('across versions. Warnings and info never fail a build; errors and blockers do. Get the');
  L.push('same data as JSON with `intent rules --json`, or one rule with `intent explain <CODE>`.');
  L.push('');
  L.push(`${DIAGNOSTIC_RULES.length} canonical diagnostics across ${areas.length} areas.`);
  L.push('');

  for (const area of areas) {
    L.push(`## ${AREA_TITLES[area] || area}`);
    L.push('');
    L.push('| Code | Severity | Blocks | Meaning |');
    L.push('| --- | --- | --- | --- |');
    for (const r of byArea[area]) {
      const blocks = r.blocks && r.blocks.length ? r.blocks.map((b) => `\`${b}\``).join(', ') : '—';
      L.push(`| \`${r.ruleId}\` | ${r.severity} | ${blocks} | ${r.summary} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

const content = generate();
const mode = process.argv.includes('--write') ? 'write'
  : process.argv.includes('--check') ? 'check' : 'print';

if (mode === 'print') { process.stdout.write(content); process.exit(0); }
if (mode === 'write') { writeFileSync(DOC, content); console.log(`diagnostics-doc: wrote docs/diagnostics.md (${DIAGNOSTIC_RULES.length} rules).`); process.exit(0); }

// check
let current = '';
try { current = readFileSync(DOC, 'utf8'); } catch { /* missing */ }
if (current !== content) {
  console.error('diagnostics-doc: docs/diagnostics.md is stale. Run `npm run diagnostics:emit`.');
  process.exit(1);
}
console.log(`diagnostics-doc: OK , docs/diagnostics.md matches the catalog (${DIAGNOSTIC_RULES.length} rules).`);
