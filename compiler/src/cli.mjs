#!/usr/bin/env node
// IntentLang CLI (MVP, deterministic). Commands: check | graph | proof | build.
//
// The emit stage writes the artifacts the ecosystem consumes to `.intent/<mission>/` by DEFAULT,
// NOT `dist/` , OpenThunder's scanner excludes dist/node_modules, so proof artifacts must live in a
// committed, scannable location. `.intent/` mirrors the ecosystem's dot-dir convention (.openthunder/).
//
//   intent check   <file>                      parse + semantic diagnostics (exit 1 on error)
//   intent graph   <file> [--out .intent]      contract-graph.json + architecture-graph.json
//   intent proof   <file> [--out .intent]      .intent-proof.json
//   intent build   <file> [--out .intent] [--no-ai]   all artifacts + docs + mermaid + testplan
//
// --no-ai is the default and only mode today; the flag is accepted for forward-compatibility.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseIntent, slug } from './parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256,
} from './emit.mjs';
import { renderMarkdown, renderMermaid, renderTestplan } from './compile.mjs';
import { getCompletions, getHover } from './intellisense.mjs';
import { liftSource, liftRepo, languageForFile } from './lift.mjs';
import { approveIntent, checkDrift, buildDriftHandoff } from './drift.mjs';
import { buildMissionIndex } from './atlas.mjs';
import { parseSelection, regionMetrics, selectCandidate } from './select.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { buildAtlas, searchAtlas, expandNode } from './intent-atlas.mjs';
import { diffGraphs, mergeGraphs } from './semantic-diff.mjs';
import { applyWaivers, governanceDiagnostics } from './governance.mjs';
import { exportIntent, EXPORT_FORMATS } from './exporters.mjs';
import { evaluateDecision, simulateLifecycle } from './runtime.mjs';
import { importIntent, detectFormat, IMPORT_FORMATS } from './importers.mjs';
import { SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, DIAGNOSTIC_RULES, intentGraphJsonSchema } from './intent-schema.mjs';
import { CLASSIFICATIONS } from './classification.mjs';
import {
  buildManifest, buildImplementationPrompt, resolveState, productionGate, adoptRegion, parseMarkers,
  contractHash, implementationHash, recordDecision, approvalFor, emptyApprovals, makeEvent,
} from './ai.mjs';

// Recursively collect supported source files, skipping vendored / build dirs.
const LIFT_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.rs', '.pl', '.pm'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '.intent', 'coverage', '.vercel']);
function collectFiles(root, acc = []) {
  for (const name of readdirSync(root)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) collectFiles(full, acc);
    else if (LIFT_EXTS.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

// Walk a directory for authored .intent files (skips the .intent/ output dir).
function collectIntents(root, acc = []) {
  const st = statSync(root);
  if (!st.isDirectory()) return root.endsWith('.intent') ? [root] : acc;
  for (const name of readdirSync(root)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(root, name);
    if (statSync(full).isDirectory()) collectIntents(full, acc);
    else if (name.endsWith('.intent')) acc.push(full);
  }
  return acc;
}

function parseArgs(argv) {
  const args = { _: [], out: '.intent', noAi: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--no-ai') args.noAi = true;
    else if (a === '--position') args.position = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--intent') args.intent = argv[++i];
    else if (a === '--by') args.by = argv[++i];
    else if (a === '--at') args.at = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--targets') args.targets = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--product') args.product = argv[++i];
    else if (a === '--allow-pending') args.allowPending = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--role') args.role = argv[++i];
    else if (a === '--note') args.note = argv[++i];
    else if (a === '--search') args.search = argv[++i];
    else if (a === '--expand') args.expand = argv[++i];
    else if (a === '--now') args.now = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--inputs') args.inputs = argv[++i];
    else if (a === '--events') args.events = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--decision') args.decision = argv[++i];
    else args._.push(a);
  }
  return args;
}

const writeJson = (dir, name, obj) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(obj, null, 2) + '\n');
  return join(dir, name);
};
const writeText = (dir, name, text) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
  return join(dir, name);
};

function load(file) {
  const source = readFileSync(file, 'utf8');
  const ast = parseIntent(source);
  return { source, ast, sourceHash: sha256(source), sourceFile: basename(file) };
}

function printDiagnostics(diags) {
  for (const d of diags) {
    const tag = d.waived ? ' (WAIVED)' : '';
    console.log(`  [${d.level}]${tag} ${d.code}: ${d.message}`);
    if (d.waived) console.log(`      waived by: ${d.waiver.approvedBy} , ${d.waiver.reason}`);
    else if (d.why) console.log(`      why: ${d.why}`);
    if (d.fix && d.fix.length) console.log(`      fix: ${d.fix[0].label}`);
  }
  // A waived diagnostic is on the record but does not fail the build (governed exception).
  const errors = diags.filter((d) => d.level === 'error' && !d.waived).length;
  const warnings = diags.filter((d) => d.level === 'warning' && !d.waived).length;
  const waived = diags.filter((d) => d.waived).length;
  console.log(`  ${errors} error(s), ${warnings} warning(s)${waived ? `, ${waived} waived` : ''}`);
  return errors;
}

function main() {
  const [cmd, ...restArgv] = process.argv.slice(2);
  const args = parseArgs(restArgv);
  const file = args._[0];
  // `schema` takes no file (it emits the canonical Intent Graph schema).
  if (cmd === 'schema') {
    const out = {
      schemaVersion: SCHEMA_VERSION, nodeTypes: NODE_TYPES, relationshipTypes: RELATIONSHIP_TYPES,
      classifications: CLASSIFICATIONS, diagnostics: DIAGNOSTIC_RULES, jsonSchema: intentGraphJsonSchema(),
    };
    if (args.out && args.out !== '.intent') { const p = writeJson(args.out, 'intent-graph.schema.json', out); console.log(`wrote ${p.replace(process.cwd() + '/', '')}`); }
    else console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!cmd || !file) {
    console.error('usage: intent <check|graph|proof|build|index|ai|schema> <file.intent> [--out .intent] [--no-ai]');
    process.exit(2);
  }
  // IntentLift: lift source CODE into inferred .intent drafts (not intent parsing).
  if (cmd === 'lift') {
    // Repo mode: walk a directory, lift each file, emit drafts + a repo summary.
    if (args.from === 'repo') {
      const root = file;
      const files = collectFiles(root).map((f) => ({ file: relative(root, f), source: readFileSync(f, 'utf8') }));
      // Per-file language auto-detection (unless --from overrides). "repo" is not a language.
      const override = args.from && args.from !== 'repo' ? args.from : undefined;
      const res = liftRepo(files, { language: override });
      const outputs = res.missions.map((m) => ({
        mission: m.mission,
        file: args.out ? join(args.out, m.outName) : null,
        confidence: m.summary.confidence, reviewed: false,
        evidenceCount: m.summary.evidenceCount, unknowns: m.summary.unknowns,
      }));
      if (args.json) {
        const { missions, ...rest } = res; void missions;
        console.log(JSON.stringify({ sourceRoot: root, ...rest, outputs }, null, 2));
        return;
      }
      if (args.out) {
        for (const m of res.missions) writeText(args.out, m.outName, m.intentText);
        console.log(`intent lift repo ${root} -> ${res.missionsGenerated} mission(s) in ${args.out}`);
        console.log(`  confidence: ${JSON.stringify(res.confidenceSummary)} | ${res.unknowns} unknown(s) total`);
      } else {
        console.log(`intent lift repo ${root}: ${res.missionsGenerated} mission(s)`);
        for (const m of res.missions) console.log(`  ${m.mission} (${m.summary.confidence}) <- ${m.sourceFile}`);
      }
      return;
    }

    // Single-file mode.
    const src = readFileSync(file, 'utf8');
    const res = liftSource(src, { language: args.from || 'typescript', file: basename(file) });
    if (!res.ok) { console.error(res.error); process.exit(1); }
    if (args.json) { console.log(JSON.stringify(res.summary, null, 2)); return; }
    if (args.out) {
      const p = writeText(args.out, `${slug(res.lifted.mission)}.intent`, res.intentText);
      console.log(`intent lift ${basename(file)} -> ${p.replace(process.cwd() + '/', '')}`);
    } else {
      console.log(res.intentText);
    }
    printDiagnostics(res.diagnostics);
    return;
  }

  // Approve an inferred/reviewed intent: reviewed:true + source hash + reviewer.
  if (cmd === 'approve') {
    const text = readFileSync(file, 'utf8');
    const res = approveIntent(text, { approvedBy: args.by || null, approvedAt: args.at || null });
    // args.out defaults to '.intent'; approve writes back to the file unless a real --out was given.
    const target = args.out && args.out !== '.intent' ? args.out : file;
    writeFileSync(target, res.text);
    console.log(`intent approve ${basename(file)} -> reviewed: true (${res.approval.source_hash.slice(0, 24)}...)`);
    return;
  }

  // Handoff: emit the il-to-ot-drift-v1 pack OpenThunder consumes for deep verification.
  if (cmd === 'handoff') {
    const text = readFileSync(file, 'utf8');
    const pack = buildDriftHandoff(text, { generatedAt: args.at || null });
    const out = JSON.stringify(pack, null, 2);
    if (args.out && args.out !== '.intent') {
      const p = writeText(args.out, `${slug(pack.mission)}.drift-handoff.json`, out);
      console.log(`intent handoff ${basename(file)} -> ${p.replace(process.cwd() + '/', '')} (kind ${pack.kind}, approved ${pack.approved})`);
    } else {
      console.log(out);
    }
    return;
  }

  // Drift: does the implementation still satisfy the approved intent?
  if (cmd === 'drift') {
    if (!args.intent) { console.error('usage: intent drift <codeFile> --intent <file.intent> [--from <lang>] [--json]'); process.exit(2); }
    const intentText = readFileSync(args.intent, 'utf8');
    const codeText = readFileSync(file, 'utf8');
    const language = args.from && args.from !== 'repo' ? args.from : languageForFile(file);
    const res = checkDrift(intentText, codeText, { language });
    if (args.json) { console.log(JSON.stringify(res, null, 2)); }
    else {
      console.log(`intent drift: ${res.status.toUpperCase()} (${res.summary.blocking} blocking)`);
      for (const f of res.findings) console.log(`  [${f.level}] ${f.code}: ${f.message}`);
    }
    process.exit(res.status === 'drift' ? 1 : 0);
  }

  // Intent AI implementations (intent-ai-v1): declare + list + manifest + prompt handoff.
  if (cmd === 'ai') {
    const sub = args._[0];
    const target = args._[1] || '.';
    if (sub === 'list') {
      const root = target;
      const parsed = collectIntents(root).map((f) => {
        const source = readFileSync(f, 'utf8');
        return { path: relative(root, f), source, ast: parseIntent(source) };
      });
      const manifest = buildManifest(parsed, { projectId: args.product });
      if (args.json) { console.log(JSON.stringify(manifest, null, 2)); return; }
      console.log(`intent ai list ${root}: ${manifest.summary.total} AI implementation(s)`);
      for (const im of manifest.implementations) {
        console.log(`  ${im.id.padEnd(28)} ${im.status.padEnd(9)} risk:${im.risk} approval:${im.approval} scope:${im.scope}`);
      }
      console.log(`  ${JSON.stringify(manifest.summary.byStatus)} | ${manifest.summary.approvalRequired} require approval`);
      console.log('  note: PENDING = declared, no target region yet. OpenThunder verifies + advances state.');
      return;
    }
    if (sub === 'generate') {
      // Provider-neutral: emit the structured handoff prompt for one mission's .intent file.
      const file = args._[1];
      if (!file) { console.error('usage: intent ai generate <file.intent> [--from <lang>]'); process.exit(2); return; }
      const ast = parseIntent(readFileSync(file, 'utf8'));
      if (!ast.implementation) { console.error(`intent ai generate: ${basename(file)} has no "implement with ai" block.`); process.exit(2); return; }
      const prompt = buildImplementationPrompt(ast, { language: args.from || 'typescript' });
      if (args.out && args.out !== '.intent') { const p = writeText(args.out, `${slug(ast.mission)}.prompt.md`, prompt); console.log(`wrote ${p.replace(process.cwd() + '/', '')}`); }
      else console.log(prompt);
      return;
    }
    if (sub === 'gate') {
      // Production gate: resolve each implementation's real state (declaration + region + proof).
      const root = target;
      const parsed = collectIntents(root).map((f) => ({ file: f, ast: parseIntent(readFileSync(f, 'utf8')) }));
      const manifest = buildManifest(parsed.map((p) => ({ path: relative(root, p.file), source: '', ast: p.ast })), { projectId: args.product });
      const apf = join(root, '.intent', 'ai-approvals.json');
      const approvals = existsSync(apf) ? JSON.parse(readFileSync(apf, 'utf8')) : emptyApprovals();
      const resolved = manifest.implementations.map((im) => {
        const ast = parsed.find((p) => (p.ast.implementation?.id || slug(p.ast.mission || '')) === im.id)?.ast;
        let region = null;
        if (im.targetLocation) {
          const tp = join(root, im.targetLocation);
          if (existsSync(tp)) region = parseMarkers(readFileSync(tp, 'utf8')).regions.find((r) => r.id === im.id) || null;
        }
        const pf = join(root, im.proofLocation);
        const proof = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
        const st = resolveState({ ast, region, proof, approval: approvalFor(approvals, im.id) });
        return { id: im.id, status: st.status, approvalRequired: im.approval !== 'none', reasons: st.reasons };
      });
      const gate = productionGate(resolved, { allowPending: args.allowPending });
      if (args.json) { console.log(JSON.stringify({ ...gate, mode: args.mode || 'production', resolved }, null, 2)); process.exit(gate.ok ? 0 : 1); return; }
      console.log(`intent ai gate ${root} (${args.mode || 'production'}): ${gate.ok ? 'PASS' : 'BLOCKED'} , ${resolved.length} implementation(s)`);
      for (const r of resolved) console.log(`  ${r.id.padEnd(28)} ${r.status}${r.reasons?.[0] ? ` , ${r.reasons[0].code}: ${r.reasons[0].message}` : ''}`);
      if (!gate.ok) console.log(`  ${gate.blocking.length} implementation(s) block production. Use --allow-pending for dev builds.`);
      process.exit(gate.ok ? 0 : 1);
      return;
    }
    if (sub === 'adopt') {
      // Rewrite an AI-managed region to human-owned, preserving provenance.
      const file = args._[1]; const id = args._[2];
      if (!file || !id) { console.error('usage: intent ai adopt <targetFile> <id> [--from <lang>]'); process.exit(2); return; }
      const code = readFileSync(file, 'utf8');
      const res = adoptRegion(code, id, args.from || languageForFile(file));
      if (!res) { console.error(`intent ai adopt: no AI-managed region "${id}" in ${basename(file)}.`); process.exit(2); return; }
      writeFileSync(file, res.code);
      console.log(`intent ai adopt ${id} -> human-owned (origin="ai" ownership="human") in ${basename(file)}`);
      return;
    }
    if (sub === 'approve' || sub === 'reject') {
      // Record a human decision bound to the reviewed hashes. Refuses stale/unverified.
      const root = args._[1] || '.'; const id = args._[2];
      if (!id) { console.error(`usage: intent ai ${sub} <dir> <id> --by <reviewer> [--role <role>] [--note <note>]`); process.exit(2); return; }
      const parsed = collectIntents(root).map((f) => ({ file: f, ast: parseIntent(readFileSync(f, 'utf8')) }));
      const manifest = buildManifest(parsed.map((p) => ({ path: relative(root, p.file), source: '', ast: p.ast })), {});
      const im = manifest.implementations.find((x) => x.id === id);
      const ast = parsed.find((p) => (p.ast.implementation?.id || slug(p.ast.mission || '')) === id)?.ast;
      if (!im || !ast) { console.error(`intent ai ${sub}: no implementation "${id}" found under ${root}.`); process.exit(2); return; }
      let region = null;
      if (im.targetLocation && existsSync(join(root, im.targetLocation))) region = parseMarkers(readFileSync(join(root, im.targetLocation), 'utf8')).regions.find((r) => r.id === id) || null;
      const pf = join(root, im.proofLocation);
      const proof = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
      const state = resolveState({ ast, region, proof });
      if (!region) { console.error(`INTENT-AI-501: cannot ${sub} "${id}" , no generated region yet (state ${state.status}).`); process.exit(1); return; }
      if (sub === 'approve' && !['VERIFIED', 'VERIFIED_AWAITING_APPROVAL'].includes(state.status)) {
        console.error(`INTENT-AI-502: cannot approve "${id}" in state ${state.status}${state.reasons?.[0] ? ` (${state.reasons[0].code})` : ''}. Approve only verified, non-stale work.`);
        process.exit(1); return;
      }
      const apf = join(root, '.intent', 'ai-approvals.json');
      const store = existsSync(apf) ? JSON.parse(readFileSync(apf, 'utf8')) : emptyApprovals();
      const at = new Date().toISOString();
      const { store: next, error } = recordDecision(store, id, {
        decision: sub === 'approve' ? 'approved' : 'rejected',
        by: args.by, role: args.role, note: args.note,
        contractHash: contractHash(ast), implementationHash: implementationHash(region.code), at,
      });
      if (error) { console.error(`intent ai ${sub}: ${error}`); process.exit(2); return; }
      writeJson(join(root, '.intent'), 'ai-approvals.json', next);
      const event = makeEvent(sub === 'approve' ? 'IntentAiImplementationApproved' : 'IntentAiImplementationRejected', {
        implementationId: id, missionId: ast.mission, contractHash: contractHash(ast), implementationHash: implementationHash(region.code),
        timestamp: at, toolVersion: 'intentlang', actorType: 'human', actorId: args.by || null, previousStatus: state.status,
        newStatus: sub === 'approve' ? 'APPROVED' : 'REJECTED',
      });
      console.log(`intent ai ${sub} ${id} by ${args.by || '(anonymous)'}${args.role ? ` [${args.role}]` : ''} -> ${sub === 'approve' ? 'APPROVED' : 'REJECTED'} (bound to current hashes)`);
      if (args.json) console.log(JSON.stringify(event, null, 2));
      return;
    }
    if (sub === 'select') {
      // Deterministic candidate selection: AI generates N candidates in
      // .intent/candidates/<id>/; IL picks by the mission's selection policy.
      const root = args._[1] || '.'; const id = args._[2];
      if (!id) { console.error('usage: intent ai select <dir> <id> [--json]'); process.exit(2); return; }
      const ast = collectIntents(root).map((f) => parseIntent(readFileSync(f, 'utf8')))
        .find((a) => (a.implementation?.id || slug(a.mission || '')) === id);
      const policy = parseSelection(ast?.selection || []);
      const cdir = join(root, '.intent', 'candidates', id);
      if (!existsSync(cdir)) { console.error(`intent ai select: no candidates at ${relative(process.cwd(), cdir)}.`); process.exit(2); return; }
      const candidates = readdirSync(cdir).filter((n) => !n.endsWith('.proof.json') && !n.endsWith('.json')).map((name) => {
        const code = readFileSync(join(cdir, name), 'utf8');
        const region = parseMarkers(code).regions.find((r) => r.id === id);
        const proofFile = join(cdir, name.replace(/\.[^.]+$/, '') + '.proof.json');
        let checksPassed;
        if (existsSync(proofFile)) { const pr = JSON.parse(readFileSync(proofFile, 'utf8')); checksPassed = Object.values(pr.checks || {}).every((v) => v !== 'failed'); }
        return { id: name, metrics: regionMetrics(region ? region.code : code), checksPassed };
      });
      const result = selectCandidate(candidates, policy);
      if (args.json) { console.log(JSON.stringify({ ...result, policy }, null, 2)); return; }
      console.log(`intent ai select ${id}: ${result.winner ? result.winner.id : '(none eligible)'} wins (${result.eligibleCount}/${candidates.length} eligible)`);
      console.log(`  policy: prefer ${result.prefer.map((p) => `${p.direction} ${p.metric}`).join(', ')}${policy.requireAllChecks ? '; require all checks' : ''}`);
      for (const c of result.ranking) console.log(`  ${c.id.padEnd(20)} ${JSON.stringify(c.metrics)}${c.checksPassed === false ? ' [checks FAILED]' : ''}`);
      return;
    }
    console.error(`intent ai ${sub || ''}: IL supports list | generate | gate | adopt | approve | reject | select. OpenThunder runs verification.`);
    process.exit(2);
    return;
  }

  // Semantic diff: compare two snapshots (dirs or .intent files) by meaning.
  if (cmd === 'diff') {
    const b = args._[0]; const a = args._[1];
    if (!b || !a) { console.error('usage: intent diff <before-dir|file> <after-dir|file> [--json]'); process.exit(2); return; }
    const snap = (p) => {
      if (statSync(p).isDirectory()) return buildAtlas(collectIntents(p).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8')))));
      return buildIntentGraph(parseIntent(readFileSync(p, 'utf8')));
    };
    const diff = diffGraphs(snap(b), snap(a));
    if (args.json) { console.log(JSON.stringify(diff, null, 2)); return; }
    console.log(`intent diff ${b} -> ${a}: +${diff.summary.added} / -${diff.summary.removed} / ~${diff.summary.changed} node(s), +${diff.summary.relationshipsAdded} / -${diff.summary.relationshipsRemoved} edge(s)`);
    if (Object.keys(diff.summary.addedByType).length) console.log(`  added: ${JSON.stringify(diff.summary.addedByType)}`);
    if (Object.keys(diff.summary.removedByType).length) console.log(`  removed: ${JSON.stringify(diff.summary.removedByType)}`);
    for (const c of diff.changedNodes.slice(0, 8)) console.log(`  ~ ${c.type} ${c.id}`);
    if (diff.invalidatedApprovals.length) console.log(`  approvals invalidated by the change: ${diff.invalidatedApprovals.join(', ')}`);
    return;
  }

  // Semantic merge: 3-way merge of two concurrent Intent versions over a common base.
  if (cmd === 'merge') {
    const [bp, op, tp] = [args._[0], args._[1], args._[2]];
    if (!bp || !op || !tp) { console.error('usage: intent merge <base> <ours> <theirs> [--json]'); process.exit(2); return; }
    const snap = (p) => statSync(p).isDirectory()
      ? buildAtlas(collectIntents(p).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8')))))
      : buildIntentGraph(parseIntent(readFileSync(p, 'utf8')));
    const res = mergeGraphs(snap(bp), snap(op), snap(tp));
    if (args.json) { console.log(JSON.stringify(res, null, 2)); process.exit(res.clean ? 0 : 1); return; }
    console.log(`intent merge: ${res.clean ? 'CLEAN' : 'CONFLICTS'} , ${res.summary.nodes} node(s), ${res.summary.conflicts} conflict(s)`);
    for (const c of res.conflicts) console.log(`  conflict: ${c.type} ${c.id} (changed differently on both sides)`);
    process.exit(res.clean ? 0 : 1);
    return;
  }

  // Intent Runtime: EXECUTE intent , evaluate decisions against concrete inputs.
  if (cmd === 'run') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    let inputs = {};
    if (args.inputs) { try { inputs = JSON.parse(args.inputs); } catch { console.error('intent run: --inputs must be JSON'); process.exit(2); return; } }
    let decisions = ast.decisions || [];
    if (args.decision) decisions = decisions.filter((d) => slug(d.name) === slug(args.decision));
    if (!decisions.length) { console.error('intent run: no decision to run' + (args.decision ? ` matching "${args.decision}"` : '')); process.exit(2); return; }
    const runs = decisions.map((d) => evaluateDecision(d, inputs));
    if (args.json) { console.log(JSON.stringify(runs.length === 1 ? runs[0] : runs, null, 2)); return; }
    for (const r of runs) {
      console.log(`decision ${r.decision}: ${r.result === null ? '(undecided)' : r.result}${r.matched ? `  [rule: ${r.matched}]` : ''}`);
      for (const t of r.trace) console.log(`  ${t.matched ? 'x' : ' '} ${t.rule || '(rule)'}${t.when ? `: when ${t.when}` : ''}${t.error ? `  !! ${t.error}` : ''}`);
    }
    process.exit(runs.some((r) => r.undecided || !r.ok) ? 1 : 0);
    return;
  }

  // Intent Runtime: SIMULATE a lifecycle against a sequence of events.
  if (cmd === 'simulate') {
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const lcs = ast.lifecycles || [];
    if (!lcs.length) { console.error('intent simulate: no lifecycle in this mission'); process.exit(2); return; }
    const events = args.events || [];
    const sims = lcs.map((lc) => simulateLifecycle(lc, events));
    if (args.json) { console.log(JSON.stringify(sims.length === 1 ? sims[0] : sims, null, 2)); return; }
    for (const s of sims) {
      console.log(`lifecycle ${s.lifecycle}: ${s.path.join(' -> ')}  (${s.valid ? 'valid' : 'INVALID'}${s.endedTerminal ? ', terminal' : ''})`);
      for (const st of s.steps) console.log(`  ${st.ok ? 'ok ' : 'X  '} ${st.from} --${st.event}--> ${st.to}${st.reason ? `  (${st.reason})` : ''}`);
    }
    process.exit(sims.some((s) => !s.valid) ? 1 : 0);
    return;
  }

  // Import adapters: lift an external DMN / BPMN document back into IntentLang source.
  if (cmd === 'import') {
    const xml = readFileSync(file, 'utf8');
    const fmt = args.format || detectFormat(xml);
    if (!fmt || !IMPORT_FORMATS.includes(fmt)) {
      console.error(`intent import: could not detect format; pass --format <${IMPORT_FORMATS.join('|')}>`);
      process.exit(2); return;
    }
    const src = importIntent(xml, fmt);
    if (src == null) { console.error(`intent import: unsupported format "${fmt}"`); process.exit(2); return; }
    if (args.out && args.out !== '.intent') {
      const base = basename(file).replace(/\.[^.]+$/, '');
      const p = writeText(args.out, `${slug(base)}.intent`, src);
      console.log(`intent import: wrote ${p}`);
    } else {
      process.stdout.write(src.endsWith('\n') ? src : src + '\n');
    }
    return;
  }

  // Export adapters: render decisions/lifecycles to DMN / BPMN / NuSMV (interop).
  if (cmd === 'export') {
    const fmt = args.format;
    if (!fmt || !EXPORT_FORMATS.includes(fmt)) {
      console.error(`usage: intent export <file> --format <${EXPORT_FORMATS.join('|')}> [--out <dir>]`);
      process.exit(2); return;
    }
    const ast = parseIntent(readFileSync(file, 'utf8'));
    const res = exportIntent(ast, fmt);
    if (args.out && args.out !== '.intent') {
      const name = `${slug(ast.mission || basename(file, '.intent'))}.${res.ext}`;
      const p = writeText(args.out, name, res.content);
      console.log(`intent export: wrote ${p}`);
    } else {
      process.stdout.write(res.content);
    }
    return;
  }

  // Intent Atlas: the navigable/searchable whole-system map over the Intent Graph.
  if (cmd === 'atlas') {
    const root = file || '.';
    const graphs = collectIntents(root).map((f) => buildIntentGraph(parseIntent(readFileSync(f, 'utf8'))));
    const atlas = buildAtlas(graphs, { product: args.product });
    if (args.search) {
      const hits = searchAtlas(atlas, args.search, { type: args.from });
      if (args.json) { console.log(JSON.stringify(hits, null, 2)); return; }
      console.log(`intent atlas search "${args.search}": ${hits.length} hit(s)`);
      for (const h of hits) console.log(`  ${h.type.padEnd(18)} ${h.id}${h.title ? `  , ${h.title}` : ''}`);
      return;
    }
    if (args.expand) {
      const ex = expandNode(atlas, args.expand);
      if (!ex) { console.error(`intent atlas: no node "${args.expand}".`); process.exit(2); return; }
      if (args.json) { console.log(JSON.stringify(ex, null, 2)); return; }
      console.log(`${ex.node.type} ${ex.node.id}${ex.node.title ? `  , ${ex.node.title}` : ''}`);
      for (const e of ex.out) console.log(`  -> ${e.rel.padEnd(16)} ${e.node.id}`);
      for (const e of ex.inbound) console.log(`  <- ${e.rel.padEnd(16)} ${e.node.id}`);
      return;
    }
    if (args.json) { console.log(JSON.stringify(atlas, null, 2)); return; }
    console.log(`intent atlas ${root}: ${atlas.overview.missions} mission(s), ${atlas.overview.nodes} node(s), ${atlas.overview.relationships} edge(s)`);
    console.log(`  ${JSON.stringify(atlas.overview.byType)}`);
    for (const m of atlas.missions) console.log(`  mission  ${m.id}${m.title ? `  , ${m.title}` : ''}`);
    console.log('  expand a node: intent atlas . --expand <id> | search: --search <query>');
    return;
  }

  // Mission Atlas index: aggregate every .intent under a directory into one inventory.
  if (cmd === 'index') {
    const root = file;
    let intentFiles;
    try {
      intentFiles = collectIntents(root).map((f) => ({ path: relative(root, f), source: readFileSync(f, 'utf8') }));
    } catch (e) {
      console.error(`intent index: cannot read "${root}": ${e instanceof Error ? e.message : e}`);
      process.exit(2);
      return;
    }
    const index = buildMissionIndex(intentFiles, { product: args.product });
    if (args.json) { console.log(JSON.stringify(index, null, 2)); return; }
    console.log(`intent index ${root}: ${index.summary.missions} mission(s)`);
    console.log(`  ${JSON.stringify(index.summary.byArea)}`);
    for (const m of index.missions) {
      console.log(`  ${m.mission.padEnd(24)} ${String(m.risk).padEnd(7)} G:${m.guarantees} N:${m.neverRules} verify:${m.verification}${m.reviewed ? ' reviewed' : ''}`);
    }
    console.log(`  ${index.summary.declaredFull} declared-full, ${index.summary.declaredPartial} partial, ${index.summary.unverified} unverified, ${index.summary.highRisk} high-risk`);
    console.log('  note: verification is DECLARED, not proven. Test/drift status needs OpenThunder.');
    return;
  }

  const { source, ast, sourceHash, sourceFile } = load(file);
  const generatedAt = new Date().toISOString();
  const diagnostics = semanticDiagnostics(ast);
  const outDir = join(args.out, slug(ast.mission || basename(file, '.intent')));

  // Production gate: a build --mode production refuses to proceed while an AI
  // implementation is not shippable. --allow-pending is for dev builds only.
  if (cmd === 'build' && args.mode === 'production' && ast.implementation) {
    const id = ast.implementation.id || slug(ast.mission || '');
    const pf = join(args.out, 'proofs', `${id}.json`);
    const proof = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : null;
    const st = resolveState({ ast, region: null, proof });
    const approvalRequired = !!ast.implementation.approval && ast.implementation.approval !== 'none';
    const gate = productionGate([{ ...st, id, approvalRequired }], { allowPending: args.allowPending });
    if (!gate.ok) {
      const r = gate.blocking[0];
      console.error(`INTENT-AI-501: production build blocked , implementation "${id}" is ${r.status}${r.reasons?.[0] ? ` (${r.reasons[0].code})` : ''}. Verify + approve, or use --allow-pending for a dev build.`);
      process.exit(1);
    }
  }

  if (cmd === 'completions' || cmd === 'hover') {
    const [ln, coln] = (args.position || '1:1').split(':').map(Number);
    const out = cmd === 'completions'
      ? getCompletions(source, { line: ln, column: coln })
      : getHover(source, { line: ln, column: coln });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'check') {
    console.log(`intent check ${sourceFile} (mission: ${ast.mission})`);
    // Governance (Gap 5): waivers downgrade matching blockers to on-the-record exceptions.
    let diags = diagnostics;
    if (ast.waivers && ast.waivers.length) {
      const now = args.now || null;
      const applied = applyWaivers(diagnostics, ast.waivers, { now });
      const gov = governanceDiagnostics(ast.waivers, diagnostics, { now });
      diags = [...applied.diagnostics, ...gov];
    }
    process.exit(printDiagnostics(diags) > 0 ? 1 : 0);
  }

  const generated = [];
  if (cmd === 'graph' || cmd === 'build') {
    generated.push(writeJson(outDir, 'contract-graph.json', buildContractGraph(ast, generatedAt)));
    generated.push(writeJson(outDir, 'architecture-graph.json', buildArchitectureGraph(ast, generatedAt)));
    generated.push(writeJson(outDir, 'implementation-plan.json', buildImplementationPlan(ast, generatedAt)));
    generated.push(writeJson(outDir, 'intent-graph.json', buildIntentGraph(ast)));
  }
  if (cmd === 'build') {
    generated.push(writeText(outDir, `${slug(ast.mission)}.md`, renderMarkdown(ast)));
    generated.push(writeText(outDir, `${slug(ast.mission)}.mmd`, renderMermaid(ast)));
    generated.push(writeText(outDir, `${slug(ast.mission)}.testplan.md`, renderTestplan(ast)));
  }
  if (cmd === 'proof' || cmd === 'build' || cmd === 'graph') {
    const proof = buildProof(ast, {
      sourceFile, sourceHash, generatedAt,
      targetsRequested: args.targets || ast.targets,
      targetsGenerated: generated.map((p) => p.replace(process.cwd() + '/', '')),
      diagnostics,
    });
    generated.push(writeJson(outDir, '.intent-proof.json', proof));
  }
  if (!['graph', 'proof', 'build'].includes(cmd)) {
    console.error(`unknown command: ${cmd}`);
    process.exit(2);
  }
  console.log(`intent ${cmd} ${sourceFile} -> ${outDir}`);
  for (const p of generated) console.log(`  wrote ${p.replace(process.cwd() + '/', '')}`);
  printDiagnostics(diagnostics);
}

main();
