// ThunderLang MCP server , makes ThunderLang a first-class tool for AI coding agents (Claude
// Code, Cursor, ...). It speaks the Model Context Protocol over stdio (newline-delimited
// JSON-RPC 2.0) and exposes the deterministic capabilities an agent needs to author intent,
// check its own output, and , the keystone , verify a proposed code change against the intent
// before it ships. No AI runs here; every tool is the pure, deterministic compiler.
//
// Start it with `thunder mcp`. Point an MCP client at that command.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseIntent } from './parse.mjs';
import { semanticDiagnostics, buildProof, COMPILER_VERSION } from './emit.mjs';
import { sha256 } from './hash.mjs';
import { verifyDiff } from './verify-diff.mjs';
import { liftSource, SUPPORTED_LANGUAGES } from './lift.mjs';
import { runTests } from './testing.mjs';
import { evaluateDecision } from './runtime.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { buildConformance } from './conformance.mjs';
import { checkDrift } from './drift.mjs';
import { draftIntent } from './draft.mjs';
import { ALL_DIAGNOSTICS } from './intent-schema.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const str = { type: 'string' };

// ── prove helpers ────────────────────────────────────────────────────────────
// Per-claim resolution , mirrors resolveObligations in cli.mjs (shared there by `thunder test
// --contracts` and `thunder prove`) so the MCP proof and the CLI proof agree claim for claim.
// States: verified (proven by a passing named test), failed (its test fails), declared (a
// verification is named but not runnable in-file), unverified (nothing).
function resolveObligations(ast) {
  const t = runTests(ast);
  const testPass = new Map();
  for (const res of (t.results || [])) {
    const cur = testPass.get(res.target);
    testPass.set(res.target, cur === undefined ? !!res.pass : cur && !!res.pass);
  }
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchTest = (verifyText) => {
    const v = norm(verifyText); if (!v) return null;
    for (const [name, pass] of testPass) { const n = norm(name); if (n && (n === v || n.includes(v) || v.includes(n))) return { name, pass }; }
    return null;
  };
  const build = (kind, o) => {
    const verify = o.verify || [];
    let status = 'unverified', provenBy = null;
    if (verify.length) {
      let m = null;
      for (const vt of verify) { const x = matchTest(vt); if (x) { m = x; if (!x.pass) break; } }
      if (m) { status = m.pass ? 'verified' : 'failed'; provenBy = m.name; } else status = 'declared';
    }
    return { kind, id: o.id, status, provenBy };
  };
  const obligations = [...ast.guarantees.map((g) => build('guarantee', g)), ...ast.neverRules.map((n) => build('prohibition', n))];
  return { obligations, tests: t, failed: obligations.filter((o) => o.status === 'failed').length };
}

// Freshness tuple , the (intent, implementation, dependencies, compiler, environment) binding
// `thunder verify` recomputes later to mark a proof STALE. Mirrors freshnessFor in cli.mjs;
// implementation/dependencies are read from the server's working directory when available.
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'poetry.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock'];
function proofFreshness(proof, environment) {
  let head = null;
  try { head = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() || null; } catch { head = null; }
  let lock = null, dir = process.cwd();
  for (let i = 0; i < 6 && !lock; i++) {
    for (const lf of LOCKFILES) { const p = join(dir, lf); if (existsSync(p)) { lock = p; break; } }
    const parent = dirname(dir); if (parent === dir) break; dir = parent;
  }
  return {
    intentHash: proof.sourceHash,
    compilerVersion: proof.compilerVersion,
    implementation: head,
    dependencies: lock ? { file: basename(lock), hash: sha256(readFileSync(lock, 'utf8')) } : null,
    environment: environment || null,
    generatedAt: proof.generatedAt,
  };
}

// Each tool is a pure function of its arguments. `run` returns a JSON-able value or a string.
const TOOLS = [
  {
    name: 'intent_check',
    description: 'Run ThunderLang semantic diagnostics on .intent source. Returns the diagnostics (codes, severity, messages) , the deterministic checks that catch missing verification, secrets on the bus, contradictions, and more.',
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
    name: 'intent_prove',
    description: 'Emit the durable intent-proof-v1 artifact for .intent source: per-claim verdicts (verified / failed / planned / needs_verification, each bound to the named test that proves it) plus the freshness tuple (intent hash, compiler version, commit, dependency lockfile) that lets `thunder verify` mark the proof STALE later. Mirrors `thunder prove`; an unverified claim never reads as passed. Call it after the gate passes to record WHAT was proven.',
    inputSchema: {
      type: 'object', required: ['source'],
      properties: {
        source: { ...str, description: 'the .intent source' },
        sourceFile: { ...str, description: 'file name to record in the proof (default intent.thunder)' },
        environment: { ...str, description: 'environment name to bind into the freshness tuple (optional)' },
      },
    },
    run: ({ source, sourceFile = 'intent.thunder', environment }) => {
      const text = String(source);
      const ast = parseIntent(text);
      const diagnostics = semanticDiagnostics(ast);
      const resolved = resolveObligations(ast);
      const proof = buildProof(ast, {
        sourceFile: String(sourceFile),
        sourceHash: sha256(text),
        targetsRequested: ast.targets || [],
        targetsGenerated: [],
        diagnostics,
        generatedAt: new Date().toISOString(),
      });
      // Fold per-claim verdicts into the proof so it records real status, not just planned/needs_verification.
      const CLAIM_MAP = { verified: 'verified', failed: 'failed', declared: 'planned', unverified: 'needs_verification' };
      const byId = new Map(resolved.obligations.map((o) => [o.id, o]));
      const applyStatus = (claim) => { const o = byId.get(claim.id); return o ? { ...claim, status: CLAIM_MAP[o.status], provenBy: o.provenBy || null } : claim; };
      proof.guarantees = proof.guarantees.map(applyStatus);
      proof.neverRules = proof.neverRules.map(applyStatus);
      proof.freshness = proofFreshness(proof, environment);
      const ok = proof.verification.semanticPassed && resolved.tests.ok !== false && resolved.failed === 0;
      return { ok, proofId: `proof-${proof.sourceHash.replace('sha256:', '').slice(0, 6)}`, ...proof, tests: resolved.tests };
    },
  },
  {
    name: 'intent_conform',
    description: 'Grade cross-target conformance (thunder-conformance-v1): the deterministic engine defines the canonical result every in-file test case must produce, and each target\'s outputs (passed via `results`) are graded against it. Same tests, every implementation , a diverging target case is a CONFORMANCE FAILURE. Mirrors `thunder conform`. Without `results`, targets honestly stay "declared", never "pass".',
    inputSchema: {
      type: 'object', required: ['source'],
      properties: {
        source: { ...str, description: 'the .intent source (with test blocks)' },
        targets: { type: 'array', items: str, description: 'target languages to grade (default: the targets the intent declares)' },
        results: { type: 'object', description: 'per-target actual outputs to grade: {target: {"Test / case": result}}' },
      },
    },
    run: ({ source, targets = [], results = null }) => {
      const rep = buildConformance(parseIntent(String(source)), { targets: Array.isArray(targets) ? targets.map(String) : [], results });
      return { ok: rep.semanticFailures === 0 && rep.failures.length === 0, ...rep };
    },
  },
  {
    name: 'intent_drift',
    description: 'Check whether real code, as it exists TODAY, still satisfies its intent , the standing-guard complement to intent_verify_diff (no diff needed). Re-lifts the code and reports drift findings: guarantees with no matching evidence, never-rules with no guard, declared inputs missing from the signature, and new behavior the intent never declared. Mirrors `thunder drift`.',
    inputSchema: {
      type: 'object', required: ['intent', 'code'],
      properties: {
        intent: { ...str, description: 'the approved .intent source (the contract)' },
        code: { ...str, description: 'the implementation source as it exists now' },
        language: { ...str, description: `source language (default typescript). One of: ${SUPPORTED_LANGUAGES.join(', ')}` },
      },
    },
    run: ({ intent, code, language = 'typescript' }) => checkDrift(String(intent), String(code), { language }),
  },
  {
    name: 'intent_draft',
    description: 'Turn a STRUCTURED brief into a rigorous, canonically-formatted ThunderLang draft plus a review checklist of what a human must still fill in (unverified guarantees, unguarded secrets, missing goal). Use this after distilling a user request into structured fields; the draft is a proposal for human approval, never verified.',
    inputSchema: {
      type: 'object', required: ['brief'],
      properties: { brief: { type: 'object', description: 'fields: mission, goal, actor, problem, guarantees[], neverRules[], inputs[{name,type}], outputs[], decisions[]' } },
    },
    run: ({ brief }) => draftIntent(brief || {}),
  },
  {
    name: 'intent_lift',
    description: 'Lift source code into an inferred, humble ThunderLang draft (never claims verified). Covers the top languages. Use it to bootstrap intent from code you already have.',
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

/** Start the ThunderLang MCP server over the given streams (default: process stdio). */
export function startMcpServer({ readable = process.stdin, writable = process.stdout } = {}) {
  const send = (msg) => writable.write(`${JSON.stringify(msg)}\n`);
  const respond = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  function handle(msg) {
    const { id, method, params } = msg || {};
    switch (method) {
      case 'initialize':
        respond(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'thunderlang', version: COMPILER_VERSION } });
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
