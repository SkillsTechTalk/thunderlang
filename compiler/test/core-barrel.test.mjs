import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.mjs';
import * as aicore from '../src/ai-core.mjs';

test('/core is a superset of ai-core (existing consumers keep working)', () => {
  for (const k of Object.keys(aicore)) assert.ok(k in core, `/core dropped ai-core export ${k}`);
});

test('/core exposes the canonical schema + classification helpers (RM /core ask)', () => {
  assert.ok(Array.isArray(core.NODE_TYPES));
  assert.equal(new Set(core.NODE_TYPES).size, core.NODE_TYPES.length);
  assert.equal(typeof core.classify, 'function');
  assert.equal(typeof core.isFactual, 'function');
  assert.ok(Array.isArray(core.CLASSIFICATIONS));
});

test('/core exposes the pure Intent Runtime (browser-safe execution)', () => {
  assert.equal(typeof core.evaluateDecision, 'function');
  assert.equal(typeof core.simulateLifecycle, 'function');
  assert.equal(typeof core.evalExpr, 'function');
  assert.equal(core.evalExpr('age >= 18', { age: 20 }), true);
});
