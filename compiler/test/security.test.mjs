import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { securityDiagnostics, SECURITY_SCHEMA } from '../src/security.mjs';
import { isRecognizedType } from '../src/data-schema.mjs';
import { DIAGNOSTIC_RULES } from '../src/intent-schema.mjs';

const codes = (ast) => securityDiagnostics(ast).map((d) => d.code);

test('IL-SEC-001 flags a secret-typed field on an event payload', () => {
  const ast = parseIntent(`mission M
use product
event UserRegistered
  payload
    userId: UserId
    password: Password
`);
  const d = securityDiagnostics(ast).find((x) => x.code === 'IL-SEC-001');
  assert.ok(d);
  assert.equal(d.severity, 'blocker');
  assert.match(d.message, /password/);
});

test('IL-SEC-001 does not fire on a clean, non-secret payload', () => {
  const ast = parseIntent(`mission M
use product
event OrderPlaced
  payload
    orderId: OrderId
    total: Money
`);
  assert.ok(!codes(ast).includes('IL-SEC-001'));
});

test('IL-SEC-002 flags a secret output with no auth requirement', () => {
  const ast = parseIntent(`mission M
use product
api GetSecret
  output
    Secret
`);
  const d = securityDiagnostics(ast).find((x) => x.code === 'IL-SEC-002');
  assert.ok(d);
  assert.equal(d.severity, 'blocker');
});

test('IL-SEC-002 is satisfied by an auth requirement', () => {
  const ast = parseIntent(`mission M
use product
api GetSecret
  requires
    valid session token
  output
    Secret
`);
  assert.ok(!codes(ast).includes('IL-SEC-002'));
});

test('IL-TYPE-001 flags a mistyped field but accepts known + PascalCase + List + id types', () => {
  const bad = parseIntent(`mission M
use product
input
  age: yaers
`);
  assert.ok(codes(bad).includes('IL-TYPE-001'));

  const good = parseIntent(`mission M
use product
input
  email: Email
  count: int
  items: List<Order>
  owner: UserId
  profile: CustomerProfile
`);
  assert.ok(!codes(good).includes('IL-TYPE-001'), JSON.stringify(securityDiagnostics(good)));
});

test('isRecognizedType covers semantic/primitive/list/id/entity and rejects typos', () => {
  for (const t of ['Email', 'money', 'int', 'List<Order>', 'Array<Email>', 'UserId', 'CustomerProfile', '']) {
    assert.equal(isRecognizedType(t), true, `${t} should be recognized`);
  }
  for (const t of ['emial', 'moeny', 'strig', 'yaers']) {
    assert.equal(isRecognizedType(t), false, `${t} should be rejected`);
  }
});

test('security diagnostics compose into semanticDiagnostics with severity/blocks', () => {
  const ast = parseIntent(`mission M
use product
event E
  payload
    secretVal: Secret
`);
  const d = semanticDiagnostics(ast).find((x) => x.code === 'IL-SEC-001');
  assert.ok(d);
  assert.equal(d.severity, 'blocker');
  assert.deepEqual(d.blocks, ['release']);
  assert.ok(d.why);
});

test('IL-SEC/IL-TYPE rules are in the canonical catalog', () => {
  const secRules = DIAGNOSTIC_RULES.filter((r) => r.ruleId.startsWith('IL-SEC-') || r.ruleId === 'IL-TYPE-001');
  assert.equal(secRules.length, 3);
  assert.ok(secRules.every((r) => r.area === 'security' || r.area === 'type'));
  assert.equal(SECURITY_SCHEMA, 'intent-security-v1');
});
