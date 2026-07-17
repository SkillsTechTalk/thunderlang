// Guard: the public barrel (`@skillstech/thunderlang`, src/index.mjs) must LOAD and expose its
// documented surface. A duplicate re-export (two modules exporting the same name) makes the
// whole module a SyntaxError at import time , which no other test catches, because they import
// individual modules, not the barrel. This test is that safety net.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as barrel from '../src/index.mjs';
import * as core from '../src/core.mjs';

// The functions the README's "Use as a library" example imports , the public contract.
const README_EXPORTS = [
  'parseIntent', 'compileSource', 'buildIntentGraph',
  'evaluateDecision', 'simulateLifecycle', 'runTests', 'evaluateOutcomes',
  'toDMN', 'toBPMN', 'toJSONSchema', 'toOpenAPI', 'toDesignTokens', 'toCss', 'toMermaid', 'toPlaywright',
  'fromDMN', 'fromBPMN', 'importReport', 'graphToSource', 'migrateGraph', 'validateGraph',
  'diffGraphs', 'mergeGraphs', 'securityDiagnostics', 'analyzeStyle',
  'validateProof', 'intentProofJsonSchema', 'toSarif',
];

test('the public barrel loads and exposes every README export as a function', () => {
  for (const name of README_EXPORTS) {
    assert.equal(typeof barrel[name], 'function', `barrel is missing export: ${name}`);
  }
});

test('the barrel exposes no duplicate/undefined named exports', () => {
  // If a name were double-exported the module would not have imported at all; belt-and-braces,
  // assert nothing resolved to undefined.
  for (const [name, value] of Object.entries(barrel)) {
    assert.notEqual(value, undefined, `barrel export "${name}" is undefined`);
  }
});

test('the browser-safe /core barrel loads and carries the style + proof + runtime surface', () => {
  for (const name of ['analyzeStyle', 'toDesignTokens', 'toCss', 'validateProof', 'evaluateDecision', 'CLASSIFICATIONS']) {
    assert.ok(core[name] !== undefined, `/core is missing: ${name}`);
  }
});
