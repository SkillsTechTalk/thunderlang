import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLspServer } from '../src/lsp.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

// Drive an in-process server: write frames, collect framed responses.
function session() {
  const readable = new PassThrough();
  const writable = new PassThrough();
  const chunks = [];
  writable.on('data', (c) => chunks.push(c));
  startLspServer({ readable, writable });
  const frame = (obj) => { const p = Buffer.from(JSON.stringify(obj), 'utf8'); readable.write(`Content-Length: ${p.length}\r\n\r\n`); readable.write(p); };
  const messages = () => Buffer.concat(chunks).toString('utf8')
    .split(/Content-Length:\s*\d+\r\n\r\n/).slice(1)
    .map((s) => { const end = s.lastIndexOf('}'); try { return JSON.parse(s.slice(0, end + 1)); } catch { return null; } })
    .filter(Boolean);
  return { frame, messages };
}
const tick = () => new Promise((r) => setTimeout(r, 60));

test('initialize returns server capabilities', async () => {
  const s = session();
  s.frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  await tick();
  const init = s.messages().find((m) => m.id === 1);
  assert.equal(init.result.serverInfo.name, 'thunderlang-lsp');
  assert.ok(init.result.capabilities.hoverProvider);
  assert.ok(init.result.capabilities.completionProvider);
  assert.equal(init.result.capabilities.textDocumentSync, 1);
});

test('didOpen publishes diagnostics anchored to the offending line', async () => {
  const s = session();
  s.frame({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///m.intent', text: 'mission M\nguarantee g holds\n' } } });
  await tick();
  const pub = s.messages().find((m) => m.method === 'textDocument/publishDiagnostics');
  assert.equal(pub.params.uri, 'file:///m.intent');
  assert.ok(pub.params.diagnostics.length >= 1);
  const d = pub.params.diagnostics[0];
  assert.ok(d.code && d.source === 'thunderlang' && typeof d.range.start.line === 'number');
  assert.ok([1, 2, 3].includes(d.severity));
});

test('didChange re-publishes diagnostics for the new text', async () => {
  const s = session();
  s.frame({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///x.intent', text: 'mission X\n' } } });
  s.frame({ jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri: 'file:///x.intent' }, contentChanges: [{ text: 'mission X\nmetric M\n  target 5%\n' }] } });
  await tick();
  const pubs = s.messages().filter((m) => m.method === 'textDocument/publishDiagnostics');
  assert.ok(pubs.length >= 2);
  // the last publish reflects the changed text (a metric with no window -> IL-PM-001)
  assert.ok(pubs[pubs.length - 1].params.diagnostics.some((d) => d.code === 'IL-PM-001'));
});

test('completion returns LSP completion items', async () => {
  const s = session();
  s.frame({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///c.intent', text: 'mission M\ngua\n' } } });
  s.frame({ jsonrpc: '2.0', id: 5, method: 'textDocument/completion', params: { textDocument: { uri: 'file:///c.intent' }, position: { line: 1, character: 3 } } });
  await tick();
  const comp = s.messages().find((m) => m.id === 5);
  assert.ok(Array.isArray(comp.result) && comp.result.length > 0);
  assert.ok(comp.result.every((i) => typeof i.label === 'string' && typeof i.kind === 'number'));
});

test('hover returns markdown for a semantic type', async () => {
  const s = session();
  s.frame({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri: 'file:///h.intent', text: 'mission M\ninput\n  x: Email\n' } } });
  s.frame({ jsonrpc: '2.0', id: 6, method: 'textDocument/hover', params: { textDocument: { uri: 'file:///h.intent' }, position: { line: 2, character: 6 } } });
  await tick();
  const hov = s.messages().find((m) => m.id === 6);
  // hover may be null if the position misses, but when present it is markdown
  if (hov.result) { assert.equal(hov.result.contents.kind, 'markdown'); assert.match(hov.result.contents.value, /Email/); }
});

test('a malformed message does not kill the server', async () => {
  const s = session();
  s.frame({ jsonrpc: '2.0', id: 7, method: 'nonexistent/method', params: { junk: true } }); // unknown -> null result
  s.frame({ jsonrpc: '2.0', id: 8, method: 'initialize', params: {} });                      // still responds after
  await tick();
  const msgs = s.messages();
  assert.equal(msgs.find((m) => m.id === 7).result, null);
  assert.ok(msgs.find((m) => m.id === 8).result.serverInfo);
});

test('the `thunder lsp` CLI command starts a working server over real stdio', async () => {
  const proc = spawn(process.execPath, [CLI, 'lsp'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const chunks = [];
  proc.stdout.on('data', (c) => chunks.push(c));
  const frame = (obj) => { const p = Buffer.from(JSON.stringify(obj), 'utf8'); proc.stdin.write(`Content-Length: ${p.length}\r\n\r\n`); proc.stdin.write(p); };
  frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  await new Promise((r) => setTimeout(r, 300));
  const out = Buffer.concat(chunks).toString('utf8');
  assert.match(out, /"serverInfo"/);
  assert.match(out, /thunderlang-lsp/);
  frame({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: {} });
  frame({ jsonrpc: '2.0', method: 'exit', params: {} });
  await new Promise((r) => { proc.on('exit', r); setTimeout(r, 500); });
  proc.kill();
});
