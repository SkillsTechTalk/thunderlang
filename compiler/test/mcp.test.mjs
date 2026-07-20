// The MCP server must speak the protocol correctly (initialize -> tools/list -> tools/call) so
// AI coding agents can use ThunderLang natively. Driven in-process over mock streams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { startMcpServer, MCP_TOOLS } from '../src/mcp.mjs';

// Spin up a server on mock streams and return a `call(msg) -> Promise<response>` helper.
function server() {
  const inp = new PassThrough();
  const out = new PassThrough();
  const byId = new Map();
  const waiters = new Map();
  let buf = '';
  out.on('data', (c) => {
    buf += c.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id != null) {
        byId.set(msg.id, msg);
        if (waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
      }
    }
  });
  startMcpServer({ readable: inp, writable: out });
  const send = (m) => inp.write(`${JSON.stringify(m)}\n`);
  const request = (id, method, params) => new Promise((resolve) => {
    if (byId.has(id)) return resolve(byId.get(id));
    waiters.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
  return { send, request };
}

test('initialize returns the protocol version and server info', async () => {
  const s = server();
  const r = await s.request(1, 'initialize', {});
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.equal(r.result.serverInfo.name, 'thunderlang');
  assert.ok(r.result.capabilities.tools);
});

test('tools/list exposes the ThunderLang tools with input schemas', async () => {
  const s = server();
  const r = await s.request(2, 'tools/list', {});
  const names = r.result.tools.map((t) => t.name);
  for (const t of ['intent_check', 'intent_verify_diff', 'intent_prove', 'intent_conform', 'intent_drift', 'intent_lift', 'intent_run']) assert.ok(names.includes(t), `missing ${t}`);
  assert.deepEqual(names.sort(), [...MCP_TOOLS].sort());
  for (const t of r.result.tools) { assert.ok(t.description); assert.equal(t.inputSchema.type, 'object'); }
});

test('tools/call intent_verify_diff gates a leak (BLOCK) through MCP', async () => {
  const s = server();
  const intent = 'mission M\nuse product\nnever expose the payment token in logs\ninput\n  paymentToken: Secret\n';
  const r = await s.request(3, 'tools/call', { name: 'intent_verify_diff', arguments: { intent, after: 'function f(paymentToken){ console.log(paymentToken); }', language: 'javascript' } });
  const verdict = JSON.parse(r.result.content[0].text);
  assert.equal(verdict.verdict, 'BLOCK');
  assert.ok(verdict.blocking >= 1);
});

test('tools/call intent_run evaluates a decision', async () => {
  const s = server();
  const source = 'mission M\ndecision D\n  inputs\n    age\n  rule adult\n    when age >= 18\n    return Yes\n  default\n    return No\n';
  const r = await s.request(4, 'tools/call', { name: 'intent_run', arguments: { source, inputs: { age: 20 } } });
  assert.equal(JSON.parse(r.result.content[0].text).result, 'Yes');
});

// The verify-real-code loop verbs: prove emits the intent-proof-v1 artifact, conform grades
// targets against the canonical contract, drift checks code-as-it-is-today against the intent.
const ENROLL = `mission Enroll
guarantee eligibility is decided deterministically
  verify CanEnroll test
never expose the ssn in logs
decision CanEnroll
  inputs
    age
  rule adult
    when age >= 18
    return Eligible
  default
    return NotEligible
test CanEnroll
  case adult
    given age 20
    expect Eligible
  case minor
    given age 10
    expect NotEligible
target
  TypeScript
  Python
`;

test('tools/call intent_prove emits an intent-proof-v1 with per-claim verdicts and freshness', async () => {
  const s = server();
  const r = await s.request(10, 'tools/call', { name: 'intent_prove', arguments: { source: ENROLL, sourceFile: 'Enroll.thunder' } });
  const proof = JSON.parse(r.result.content[0].text);
  assert.equal(proof.ok, true);
  assert.ok(proof.proofId.startsWith('proof-'), 'proof has an id');
  assert.equal(proof.missionName, 'Enroll');
  assert.ok(proof.sourceHash.startsWith('sha256:'));
  // the guarantee is proven by its named passing test; the never-rule is honestly UNVERIFIED
  assert.equal(proof.guarantees[0].status, 'verified');
  assert.equal(proof.guarantees[0].provenBy, 'CanEnroll');
  assert.equal(proof.neverRules[0].status, 'needs_verification');
  // freshness binds the proof to intent hash + compiler so `thunder verify` can mark it STALE
  assert.equal(proof.freshness.intentHash, proof.sourceHash);
  assert.equal(proof.freshness.compilerVersion, proof.compilerVersion);
  assert.equal(proof.tests.passed, proof.tests.total);
});

test('tools/call intent_prove reports a failing claim as failed (never silently passes)', async () => {
  const s = server();
  const broken = ENROLL.replace('expect Eligible', 'expect NotEligible'); // adult case now wrong
  const r = await s.request(11, 'tools/call', { name: 'intent_prove', arguments: { source: broken } });
  const proof = JSON.parse(r.result.content[0].text);
  assert.equal(proof.ok, false);
  assert.equal(proof.guarantees[0].status, 'failed');
});

test('tools/call intent_conform grades target results against the canonical contract', async () => {
  const s = server();
  const results = {
    typescript: { 'CanEnroll / adult': 'Eligible', 'CanEnroll / minor': 'NotEligible' },
    python: { 'CanEnroll / adult': 'Eligible', 'CanEnroll / minor': 'Eligible' },
  };
  const r = await s.request(12, 'tools/call', { name: 'intent_conform', arguments: { source: ENROLL, results } });
  const rep = JSON.parse(r.result.content[0].text);
  assert.equal(rep.schema, 'thunder-conformance-v1');
  assert.equal(rep.ok, false, 'a divergent target fails conformance');
  assert.equal(rep.failures.length, 1);
  assert.equal(rep.failures[0].target, 'python');
  // without results, targets honestly stay declared and the run is ok
  const r2 = await s.request(13, 'tools/call', { name: 'intent_conform', arguments: { source: ENROLL } });
  const rep2 = JSON.parse(r2.result.content[0].text);
  assert.equal(rep2.ok, true);
  assert.equal(rep2.graded, false);
  assert.ok(rep2.cases.every((c) => c.targets.typescript.status === 'declared'));
});

test('tools/call intent_drift flags code that dropped a declared input', async () => {
  const s = server();
  const intent = 'mission Charge\ninput\n  orderId: OrderId\n  paymentToken: Secret\n';
  const r = await s.request(14, 'tools/call', { name: 'intent_drift', arguments: { intent, code: 'export function charge(orderId){ return orderId; }', language: 'typescript' } });
  const res = JSON.parse(r.result.content[0].text);
  assert.equal(res.status, 'drift');
  assert.ok(res.findings.some((f) => f.code === 'INTENT_DRIFT_INPUT_REMOVED'));
});

test('an unknown tool is a JSON-RPC error; unknown method too', async () => {
  const s = server();
  const bad = await s.request(5, 'tools/call', { name: 'nope', arguments: {} });
  assert.ok(bad.error);
  const m = await s.request(6, 'does/notexist', {});
  assert.equal(m.error.code, -32601);
});

test('a tool that throws is reported as an isError result, not a crash', async () => {
  const s = server();
  // intent_run with no decision -> handled result, not a thrown crash
  const r = await s.request(7, 'tools/call', { name: 'intent_run', arguments: { source: 'mission M\n', inputs: {} } });
  assert.ok(JSON.parse(r.result.content[0].text).error);
});
