import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpHandler, REMOTE_SAFE_TOOLS, MCP_TOOLS } from '../src/mcp.mjs';

const call = (handle, name, args) => {
  const r = handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  assert.ok(!r.result.isError, r.result.content[0].text);
  const text = r.result.content[0].text;
  try { return JSON.parse(text); } catch { return text; }
};

test('intent_read turns unfamiliar Go into rules, searchable and rewritten in Python', () => {
  const handle = createMcpHandler();
  const go = 'package main\n\nfunc Fee(total float64, member bool) string {\n\tif total >= 50 || member {\n\t\treturn "Free"\n\t}\n\treturn "Standard"\n}\n';
  const r = call(handle, 'intent_read', { source: go, query: 'free', in: 'python' });
  assert.equal(r.language, 'go');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].rules[0].when, 'total >= 50 or member');
  assert.match(r.items[0].rewritten.code, /def Fee\(total: float, member: bool\) -> str:/);
});

test('intent_translate accepts the readable contract notation', () => {
  const src = 'contract S\npurpose Free over 50.\n\ndecision Fee(total: number)\n  when total >= 50 -> Free\n  otherwise -> Standard\n\nexamples Fee\n  case "big": (total: 80) -> Free\n';
  assert.match(call(createMcpHandler(), 'intent_translate', { source: src, language: 'rust' }), /fn Fee\(total: f64\) -> &'static str/);
});

test('intent_human reports example results', () => {
  const src = 'contract S\npurpose Free over 50.\n\ndecision Fee(total: number)\n  when total > 50 -> Free\n  otherwise -> Standard\n\nexamples Fee\n  case "exactly 50": (total: 50) -> Free\n';
  const r = call(createMcpHandler(), 'intent_human', { source: src });
  assert.equal(r.tests.failed, 1);
});

test('remote handler lists only tools that never touch the server filesystem or git', () => {
  const handle = createMcpHandler({ tools: REMOTE_SAFE_TOOLS });
  const names = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.ok(!names.includes('intent_prove'));
  assert.ok(names.includes('intent_read'));
  assert.ok(REMOTE_SAFE_TOOLS.every((t) => MCP_TOOLS.includes(t)));
  const denied = handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'intent_prove', arguments: {} } });
  assert.equal(denied.error.code, -32602);
});

test('initialize negotiates the client protocol version when supported', () => {
  const handle = createMcpHandler();
  assert.equal(handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }).result.protocolVersion, '2025-06-18');
  assert.equal(handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }).result.protocolVersion, '2024-11-05');
  assert.equal(handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});
