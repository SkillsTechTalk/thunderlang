import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { classify, isFactual, CLASSIFICATIONS, UNSETTLED } from '../src/classification.mjs';

const MISSION = [
  'use product',
  'mission StudyPlan',
  'title "Turn notes into a plan"',
  'for Learner',
  'problem', '  "learners cannot organize study material"',
  'evidence Tickets', '  classification observed', '  confidence medium',
  'outcome FasterPlans', '  "plans within five minutes"',
  'metric PlanWithin5Min', '  baseline 42 percent', '  target at_least 70 percent', '  window 30 days after release',
  'scope', '  include PDFUpload', '  exclude VideoUpload',
  'assumption MostUploadPDF', '  confidence low', '  validate with Analytics',
  'unknown MaxUploadSize', '  owner Product', '  resolve before Implementation',
  'question Cancellable', '  asked_of UX', '  blocks ExperienceApproval',
  'owner ProductTeam',
  'approval required from', '  Product', '  UX',
].join('\n');

test('Product Mission parses into typed AST', () => {
  const ast = parseIntent(MISSION);
  assert.deepEqual(ast.profiles, ['product']);
  assert.equal(ast.actor, 'Learner');
  assert.equal(ast.title, 'Turn notes into a plan');
  assert.match(ast.problem, /organize study material/);
  assert.equal(ast.evidence[0].classification, 'observed');
  assert.equal(ast.metrics[0].window, '30 days after release');
  assert.deepEqual(ast.scope.include, ['PDFUpload']);
  assert.deepEqual(ast.scope.exclude, ['VideoUpload']);
  assert.equal(ast.unknowns[0].resolveBefore, 'Implementation');
  assert.equal(ast.questions[0].blocks, 'ExperienceApproval');
  assert.equal(ast.assumptionDecls[0].validateWith, 'Analytics');
  assert.deepEqual(ast.approvals, ['Product', 'UX']);
});

test('buildIntentGraph produces canonical nodes + relationships', () => {
  const g = buildIntentGraph(parseIntent(MISSION));
  assert.equal(g.schema, 'intent-graph-v1');
  assert.equal(g.missionId, 'mission.studyplan');
  const types = g.summary.byType;
  assert.equal(types.Mission, 1);
  assert.equal(types.Evidence, 1);
  assert.equal(types.Outcome, 1);
  assert.equal(types.Metric, 1);
  assert.equal(types.Unknown, 1);
  assert.equal(types.Approval, 2);
  // relationships: mission supported_by evidence, targets outcome, measured_by metric
  assert.ok(g.relationships.some((r) => r.from === g.missionId && r.type === 'supported_by' && r.to.startsWith('evidence.')));
  assert.ok(g.relationships.some((r) => r.type === 'targets' && r.to.startsWith('outcome.')));
  assert.ok(g.relationships.some((r) => r.type === 'measured_by' && r.to.startsWith('metric.')));
  assert.ok(g.relationships.some((r) => r.type === 'approved_by'));
  // an unknown blocks a phase
  assert.ok(g.relationships.some((r) => r.type === 'blocks' && r.to === 'phase.implementation'));
  // evidence node carries its classification
  const ev = g.nodes.find((n) => n.type === 'Evidence');
  assert.equal(ev.classification, 'observed');
});

test('graph is deterministic (same AST -> identical graph)', () => {
  const a = JSON.stringify(buildIntentGraph(parseIntent(MISSION)));
  const b = JSON.stringify(buildIntentGraph(parseIntent(MISSION)));
  assert.equal(a, b);
});

test('classification model: factual vs unsettled', () => {
  assert.equal(classify('OBSERVED'), 'observed');
  assert.equal(classify('nonsense'), null);
  assert.equal(CLASSIFICATIONS.length, 7);
  assert.equal(isFactual('observed'), true);
  assert.equal(isFactual('verified'), true);
  assert.equal(isFactual('assumed'), false);   // not fact
  assert.equal(isFactual('inferred'), false);
  assert.ok(UNSETTLED.has('assumed') && UNSETTLED.has('unknown'));
});

test('role-aware diagnostics: metric without window blocks release; blocking unknown carries metadata', () => {
  const ast = parseIntent('use product\nmission M\noutcome O\n  "x"\nmetric MyMetric\n  baseline 1 percent\nunknown U\n  resolve before Implementation\n');
  const diags = semanticDiagnostics(ast);
  const pm = diags.find((d) => d.code === 'IL-PM-001');
  assert.ok(pm);
  assert.deepEqual(pm.blocks, ['release']);
  assert.ok(pm.roles.product); // role-specific rendering present
  const gr = diags.find((d) => d.code === 'IL-GRAPH-010');
  assert.equal(gr.severity, 'blocker');
  assert.deepEqual(gr.blocks, ['implementation']);
  // still valid: no error-level diagnostics from these (spec is well-formed)
  assert.equal(diags.filter((d) => d.level === 'error').length, 0);
});
