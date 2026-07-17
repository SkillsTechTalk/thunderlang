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
  for (const t of ['intent_check', 'intent_verify_diff', 'intent_lift', 'intent_run']) assert.ok(names.includes(t), `missing ${t}`);
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
