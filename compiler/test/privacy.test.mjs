import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { analyzePrivacy, PRIVACY_SCHEMA, DATA_CLASSIFICATIONS, LAWFUL_BASES } from '../src/privacy.mjs';

const codes = (ast) => analyzePrivacy(ast).map((f) => f.code);

test('a mission with no data blocks produces no privacy findings', () => {
  const ast = parseIntent('mission M\nguarantees\n  a holds\n');
  assert.equal(analyzePrivacy(ast).length, 0);
});

test('parseIntent extracts a data element with classification/purpose/retention/basis', () => {
  const ast = parseIntent('mission M\ndata customer.ssn\n  classification pii\n  purpose "identity check"\n  retention 30 days\n  basis consent\n');
  const d = ast.dataElements[0];
  assert.equal(d.classification, 'pii');
  assert.equal(d.purpose, 'identity check');
  assert.equal(d.retention, '30 days');
  assert.equal(d.basis, 'consent');
});

test('sensitive data with nothing declared -> missing purpose (001), retention (002), basis (003)', () => {
  const ast = parseIntent('mission M\ndata customer.dob\n  classification sensitive\n');
  const c = codes(ast);
  assert.ok(c.includes('IL-DATA-001'));
  assert.ok(c.includes('IL-DATA-002'));
  assert.ok(c.includes('IL-DATA-003'));
});

test('a fully-governed pii element (not exposed) produces no findings', () => {
  const ast = parseIntent('mission M\ndata account.token\n  classification pii\n  purpose "session auth"\n  retention 7 days\n  basis contract\n');
  assert.equal(analyzePrivacy(ast).length, 0);
});

test('public/internal data is NOT governed (no purpose/basis required)', () => {
  const ast = parseIntent('mission M\ndata product.name\n  classification public\n');
  assert.equal(analyzePrivacy(ast).length, 0);
});

test('unknown classification -> IL-DATA-004', () => {
  const ast = parseIntent('mission M\ndata x\n  classification supersecret\n');
  assert.ok(codes(ast).includes('IL-DATA-004'));
});

test('unrecognized lawful basis -> IL-DATA-005', () => {
  const ast = parseIntent('mission M\ndata customer.email\n  classification pii\n  purpose "contact"\n  retention 1 year\n  basis vibes\n');
  assert.ok(codes(ast).includes('IL-DATA-005'));
});

test('purpose limitation: sensitive data returned as an output with no guard -> IL-DATA-006', () => {
  const exposed = parseIntent('mission M\noutput\n  ssn: String\ndata customer.ssn\n  classification pii\n  purpose "verify"\n  retention 30 days\n  basis consent\n');
  assert.ok(codes(exposed).includes('IL-DATA-006'));
  // A "never expose" guard clears it.
  const guarded = parseIntent('mission M\noutput\n  ssn: String\nnever\n  expose customer.ssn\ndata customer.ssn\n  classification pii\n  purpose "verify"\n  retention 30 days\n  basis consent\n');
  assert.ok(!codes(guarded).includes('IL-DATA-006'));
});

test('privacy findings are deterministic and stable-sorted', () => {
  const src = 'mission M\ndata a\n  classification pii\ndata b\n  classification sensitive\n';
  assert.deepEqual(codes(parseIntent(src)), codes(parseIntent(src)));
  assert.equal(PRIVACY_SCHEMA, 'intent-privacy-v1');
  assert.ok(DATA_CLASSIFICATIONS.includes('pii'));
  assert.ok(LAWFUL_BASES.includes('legitimate_interest'));
});
