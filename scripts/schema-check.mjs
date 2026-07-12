#!/usr/bin/env node
// Schema sync guard for CI. The committed canonical schema
// (compiler/intent-graph.schema.json) must always match what the compiler emits, so
// consumers can reference the file as a stable source of truth AND every schema change
// shows up as a reviewable diff. Regenerates the schema in-memory and compares byte-for-byte
// to the committed file. Exits 1 (with the fix command) if they differ.
//
// Usage: node scripts/schema-check.mjs   (regenerate with: npm run schema:emit)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, DIAGNOSTIC_RULES, intentGraphJsonSchema,
} from '../compiler/src/intent-schema.mjs';
import { CLASSIFICATIONS } from '../compiler/src/classification.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'compiler', 'intent-graph.schema.json');

// Must match the shape the `intent schema` CLI command emits.
const current = JSON.stringify({
  schemaVersion: SCHEMA_VERSION,
  nodeTypes: NODE_TYPES,
  relationshipTypes: RELATIONSHIP_TYPES,
  classifications: CLASSIFICATIONS,
  diagnostics: DIAGNOSTIC_RULES,
  jsonSchema: intentGraphJsonSchema(),
}, null, 2);

let committed;
try { committed = readFileSync(FILE, 'utf8').replace(/\n$/, ''); }
catch { console.error(`schema-check: ${FILE} is missing. Run: npm run schema:emit`); process.exit(1); }

if (committed !== current) {
  console.error('schema-check: compiler/intent-graph.schema.json is OUT OF DATE with the compiler.');
  console.error('  Regenerate + commit it:  npm run schema:emit');
  process.exit(1);
}
console.log(`schema-check: OK , committed schema matches the compiler (${SCHEMA_VERSION}, ${NODE_TYPES.length} node types, ${RELATIONSHIP_TYPES.length} relationship types).`);
