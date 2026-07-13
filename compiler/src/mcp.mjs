// IntentLang MCP server , makes IntentLang a first-class tool for AI coding agents (Claude
// Code, Cursor, ...). It speaks the Model Context Protocol over stdio (newline-delimited
// JSON-RPC 2.0) and exposes the deterministic capabilities an agent needs to author intent,
// check its own output, and , the keystone , verify a proposed code change against the intent
// before it ships. No AI runs here; every tool is the pure, deterministic compiler.
//
// Start it with `intent mcp`. Point an MCP client at that command.

import { parseIntent } from './parse.mjs';
import { semanticDiagnostics, COMPILER_VERSION } from './emit.mjs';
import { verifyDiff } from './verify-diff.mjs';
import { liftSource, SUPPORTED_LANGUAGES } from './lift.mjs';
import { runTests } from './testing.mjs';
import { evaluateDecision } from './runtime.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { ALL_DIAGNOSTICS } from './intent-schema.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const str = { type: 'string' };

// Each tool is a pure function of its arguments. `run` returns a JSON-able value or a string.
const TOOLS = [
  {
    name: 'intent_check',
    description: 'Run IntentLang semantic diagnostics on .intent source. Returns the diagnostics (codes, severity, messages) , the deterministic checks that catch missing verification, secrets on the bus, contradictions, and more.',
    inputSchema: { type: 'object', required: ['source'], properties: { source: { ...str, description: 'the .intent source' } } },
    run: ({ source }) => {
      const diagnostics = semanticDiagnostics(parseIntent(String(source)));
      return { ok: !diagnostics.some((d) => d.level === 'error'), count: diagnostics.length, diagnostics };
    },
  },
  {
    name: 'intent_verify_diff',
    description: 'THE AI-LOOP GATE. Prove, deterministically, which of an intent\'s guarantees and never-rules a code change upholds or breaks. Returns verdict PASS or BLOCK. Blocks on regressions (a claim that held on `before` and broke on `after`) and guardrail hits (an added line pushing a protected secret into a log/response). Call this on your own proposed change before shipping it.',
    inputSchema: {
      type: 'object', required: ['intent', 'after'],
      properties: {
        intent: { ...str, description: 'the .intent source (the contract)' },
        after: { ...str, description: 'the proposed/changed code' },
        before: { ...str, description: 'the code before the change (optional; enables regression detection)' },
        language: { ...str, description: `source language (default typescript). One of: ${SUPPORTED_LANGUAGES.join(', ')}` },
      },
    },
    run: ({ intent, after, before = null, language = 'typescript' }) => verifyDiff(String(intent), { before: before == null ? null : String(before), after: String(after), language }),
  },
  {
    name: 'intent_lift',
    description: 'Lift source code into an inferred, humble IntentLang draft (never claims verified). Covers the top languages. Use it to bootstrap intent from code you already have.',
    inputSchema: {
      type: 'object', required: ['source'],
      properties: { source: { ...str, description: 'the source code' }, language: { ...str, description: `source language (default typescript). One of: ${SUPPORTED_LANGUAGES.join(', ')}` } },
    },
    run: ({ source, language = 'typescript' }) => {
      const r = liftSource(String(source), { language });
      return r.ok ? { ok: true, intent: r.intentText, summary: r.summary, diagnostics: r.diagnostics } : { ok: false, error: r.error };
    },
  },
  {
    name: 'intent_run',
    description: 'Evaluate a decision in .intent source against concrete inputs (FIRST-hit, with a per-rule trace). Deterministic , the intent itself decides.',
    inputSchema: {
      type: 'object', required: ['source', 'inputs'],
      properties: { source: str, inputs: { type: 'object', description: 'the input values' }, decision: { ...str, description: 'decision name (default: the first declared)' } },
    },
    run: ({ source, inputs = {}, decision }) => {
      const ast = parseIntent(String(source));
      const d = decision ? (ast.decisions || []).find((x) => x.name === decision) : (ast.decisions || [])[0];
      if (!d) return { error: decision ? `no decision "${decision}"` : 'no decision declared' };
      return evaluateDecision(d, inputs);
    },
  },
  {
    name: 'intent_test',
    description: 'Run the in-file test blocks (case/scenario) in .intent source through the deterministic runtime. The spec proves itself.',
    inputSchema: { type: 'object', required: ['source'], properties: { source: str } },
    run: ({ source }) => runTests(parseIntent(String(source))),
  },
  {
    name: 'intent_graph',
    description: 'Build the canonical Intent Graph (intent-graph-v1) from .intent source , the typed nodes + relationships other tools reason over.',
    inputSchema: { type: 'object', required: ['source'], properties: { source: str } },
    run: ({ source }) => buildIntentGraph(parseIntent(String(source))),
  },
  {
    name: 'intent_explain',
    description: 'Explain a diagnostic code (area, severity, what it blocks). Accepts any code the compiler emits.',
    inputSchema: { type: 'object', required: ['code'], properties: { code: { ...str, description: 'e.g. IL-SEC-001' } } },
    run: ({ code }) => ALL_DIAGNOSTICS.find((r) => r.ruleId.toLowerCase() === String(code).toLowerCase()) || { code, found: false },
  },
];

export const MCP_TOOLS = TOOLS.map((t) => t.name);

/** Start the IntentLang MCP server over the given streams (default: process stdio). */
export function startMcpServer({ readable = process.stdin, writable = process.stdout } = {}) {
  const send = (msg) => writable.write(`${JSON.stringify(msg)}\n`);
  const respond = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  function handle(msg) {
    const { id, method, params } = msg || {};
    switch (method) {
      case 'initialize':
        respond(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'intentlang', version: COMPILER_VERSION } });
        break;
      case 'notifications/initialized':
      case 'initialized':
      case 'notifications/cancelled':
        break; // notifications , no response
      case 'ping':
        respond(id, {});
        break;
      case 'tools/list':
        respond(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
        break;
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === params?.name);
        if (!tool) { fail(id, -32602, `Unknown tool: ${params?.name}`); break; }
        try {
          const result = tool.run(params.arguments || {});
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          respond(id, { content: [{ type: 'text', text }] });
        } catch (e) {
          respond(id, { content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
        }
        break;
      }
      default:
        if (id != null) fail(id, -32601, `Method not found: ${method}`);
    }
  }

  let buffer = '';
  readable.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      handle(msg);
    }
  });
  if (typeof readable.resume === 'function') readable.resume();
  return { handle }; // exposed for in-process testing
}
