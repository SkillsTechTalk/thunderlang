import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { toJSONSchema, toOpenAPI, typeToJsonSchema } from '../src/data-schema.mjs';
import { exportIntent } from '../src/exporters.mjs';

test('typeToJsonSchema maps semantic types, lists, ids, and custom entities', () => {
  assert.deepEqual(typeToJsonSchema('Email'), { type: 'string', format: 'email' });
  assert.deepEqual(typeToJsonSchema('DateTime'), { type: 'string', format: 'date-time' });
  assert.deepEqual(typeToJsonSchema('Money'), { type: 'number' });
  assert.deepEqual(typeToJsonSchema('Boolean'), { type: 'boolean' });
  assert.deepEqual(typeToJsonSchema('Secret'), { type: 'string', writeOnly: true });
  assert.deepEqual(typeToJsonSchema('Percentage'), { type: 'number', minimum: 0, maximum: 100 });
  assert.deepEqual(typeToJsonSchema('UserId'), { type: 'string', title: 'UserId' });
  assert.deepEqual(typeToJsonSchema('Customer'), { type: 'object', title: 'Customer' });
  assert.deepEqual(typeToJsonSchema('List<Order>'), { type: 'array', items: { type: 'object', title: 'Order' } });
  assert.deepEqual(typeToJsonSchema('List<Email>'), { type: 'array', items: { type: 'string', format: 'email' } });
});

const ast = parseIntent(`mission CreateInvoice
title "Create an invoice"
input
  customer: Customer
  email: Email
  orders: List<Order>
output
  invoice: Invoice
errors
  OrderNotFound
  DuplicateInvoice
  Unauthorized
`);

test('toJSONSchema builds a draft-2020-12 object schema with required fields', () => {
  const s = toJSONSchema(ast);
  assert.match(s.$schema, /2020-12/);
  assert.equal(s.type, 'object');
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required, ['customer', 'email', 'orders']);
  assert.deepEqual(s.properties.email, { type: 'string', format: 'email' });
});

test('toJSONSchema which:output and which:both', () => {
  assert.ok('invoice' in toJSONSchema(ast, { which: 'output' }).properties);
  const both = toJSONSchema(ast, { which: 'both' });
  assert.ok(both.properties.input && both.properties.output);
});

test('an optional/nullable modifier drops a field from required', () => {
  const a = parseIntent('mission M\ninput\n  a: String\n  b: String\n    optional\n');
  const s = toJSONSchema(a);
  assert.ok(s.required.includes('a'));
  assert.ok(!s.required.includes('b'));
});

test('toOpenAPI produces a 3.1 operation with request body, 200, and error responses', () => {
  const doc = toOpenAPI(ast);
  assert.equal(doc.openapi, '3.1.0');
  const op = doc.paths['/createinvoice'].post;
  assert.equal(op.operationId, 'createInvoice');
  assert.ok(op.requestBody.content['application/json'].schema.properties.email);
  assert.ok(op.responses['200']);
  assert.equal(op.responses['404'].description, 'OrderNotFound');   // NotFound -> 404
  assert.equal(op.responses['409'].description, 'DuplicateInvoice'); // Duplicate -> 409
  assert.equal(op.responses['403'].description, 'Unauthorized');     // Unauthorized -> 403
});

test('exportIntent dispatches the new formats', () => {
  assert.equal(exportIntent(ast, 'jsonschema').ext, 'schema.json');
  assert.equal(exportIntent(ast, 'openapi').ext, 'openapi.json');
  assert.ok(JSON.parse(exportIntent(ast, 'jsonschema').content));   // valid JSON
  assert.ok(JSON.parse(exportIntent(ast, 'openapi').content));
});

test('deterministic + valid JSON on a mission with no fields', () => {
  const empty = parseIntent('mission M\nguarantees\n  a holds\n');
  assert.equal(JSON.stringify(toJSONSchema(empty)), JSON.stringify(toJSONSchema(empty)));
  assert.equal(toJSONSchema(empty).type, 'object');
  assert.ok(JSON.parse(exportIntent(empty, 'openapi').content));
});
