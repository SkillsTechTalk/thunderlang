import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { toDMN, toBPMN } from '../src/exporters.mjs';
import { fromDMN, fromBPMN, importIntent, importReport, detectFormat, IMPORT_FORMATS, IMPORT_SCHEMA } from '../src/importers.mjs';
import { evaluateDecision, simulateLifecycle } from '../src/runtime.mjs';
import { parseXml, find, findAll, localName } from '../src/xml.mjs';

const src = `mission Eligibility
decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  rule provisional
    when age >= 18
    return Provisional
  default
    return NotEligible
lifecycle Enrollment
  state Draft
  state Submitted
  state Approved
  state Rejected
  transition submit
    from Draft
    to Submitted
  transition approve
    from Submitted
    to Approved
  transition reject
    from Submitted
    to Rejected
  terminal Approved, Rejected
`;
const ast0 = parseIntent(src);

test('xml parser: elements, attrs, nested text, namespaces, entities', () => {
  const doc = parseXml('<a:root id="1"><b:child>x &lt; y</b:child><self k="v"/></a:root>');
  const root = find(doc, 'root');
  assert.equal(root.attrs.id, '1');
  assert.equal(find(doc, 'child').text, 'x < y');
  assert.equal(localName('a:root'), 'root');
  assert.equal(findAll(doc, 'child').length, 1);
});

test('detectFormat recognizes DMN and BPMN', () => {
  assert.equal(detectFormat(toDMN(ast0)), 'dmn');
  assert.equal(detectFormat(toBPMN(ast0)), 'bpmn');
  assert.equal(detectFormat('<html></html>'), null);
});

test('ROUND TRIP: intent -> DMN -> intent behaves identically', () => {
  const back = parseIntent(fromDMN(toDMN(ast0)));
  const dec0 = ast0.decisions[0];
  const dec1 = back.decisions[0];
  for (const c of [{ age: 20, score: 90 }, { age: 20, score: 50 }, { age: 10, score: 99 }, { age: 18, score: 70 }]) {
    assert.equal(evaluateDecision(dec1, c).result, evaluateDecision(dec0, c).result, `mismatch at ${JSON.stringify(c)}`);
  }
});

test('ROUND TRIP: intent -> BPMN -> intent behaves identically', () => {
  const back = parseIntent(fromBPMN(toBPMN(ast0)));
  const lc0 = ast0.lifecycles[0];
  const lc2 = back.lifecycles[0];
  for (const ev of [['submit', 'approve'], ['submit', 'reject'], ['approve'], ['submit', 'approve', 'reject']]) {
    const s0 = simulateLifecycle(lc0, ev);
    const s2 = simulateLifecycle(lc2, ev);
    assert.deepEqual(s2.path, s0.path, `path mismatch for ${ev.join(',')}`);
    assert.equal(s2.valid, s0.valid);
  }
});

test('foreign DMN with proper unary tests imports and executes', () => {
  const foreign = `<?xml version="1.0"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" name="Loan">
  <decision id="d1" name="Approve">
    <decisionTable hitPolicy="FIRST">
      <input label="age"><inputExpression><text>age</text></inputExpression></input>
      <input label="region"><inputExpression><text>region</text></inputExpression></input>
      <output name="result"/>
      <rule><inputEntry><text>&gt;= 18</text></inputEntry><inputEntry><text>US</text></inputEntry><outputEntry><text>"Approve"</text></outputEntry></rule>
      <rule><inputEntry><text>-</text></inputEntry><inputEntry><text>-</text></inputEntry><outputEntry><text>"Deny"</text></outputEntry></rule>
    </decisionTable>
  </decision>
</definitions>`;
  const dec = parseIntent(fromDMN(foreign)).decisions[0];
  assert.equal(evaluateDecision(dec, { age: 20, region: 'US' }).result, 'Approve');
  assert.equal(evaluateDecision(dec, { age: 20, region: 'CA' }).result, 'Deny');
  assert.equal(evaluateDecision(dec, { age: 15, region: 'US' }).result, 'Deny');
});

test('foreign BPMN imports states, transitions, and a terminal', () => {
  const bpmn = `<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" name="Ticket">
  <process id="p1" name="Ticket">
    <startEvent id="s"/>
    <task id="open" name="Open"/>
    <task id="closed" name="Closed"/>
    <endEvent id="e"/>
    <sequenceFlow sourceRef="s" targetRef="open"/>
    <sequenceFlow id="resolve" name="resolve" sourceRef="open" targetRef="closed"/>
    <sequenceFlow sourceRef="closed" targetRef="e"/>
  </process>
</definitions>`;
  const lc = parseIntent(fromBPMN(bpmn)).lifecycles[0];
  const sim = simulateLifecycle(lc, ['resolve']);
  assert.deepEqual(sim.path, ['Open', 'Closed']);
  assert.equal(sim.valid, true);
  assert.equal(sim.endedTerminal, true);
});

test('importIntent auto-detects and dispatches; IMPORT_FORMATS is [dmn,bpmn]', () => {
  assert.ok(importIntent(toDMN(ast0))?.includes('decision'));
  assert.ok(importIntent(toBPMN(ast0))?.includes('lifecycle'));
  assert.equal(importIntent('<nope/>'), null);
  assert.deepEqual(IMPORT_FORMATS, ['dmn', 'bpmn']);
});

test('import is deterministic', () => {
  assert.equal(fromDMN(toDMN(ast0)), fromDMN(toDMN(ast0)));
  assert.equal(fromBPMN(toBPMN(ast0)), fromBPMN(toBPMN(ast0)));
});

test('importReport: a clean round-trip has zero warnings and the same source', () => {
  const r = importReport(toDMN(ast0));
  assert.equal(r.schema, IMPORT_SCHEMA);
  assert.equal(r.format, 'dmn');
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.source, fromDMN(toDMN(ast0)));
  assert.equal(r.stats.decisions, 1);
});

test('importReport: DMN loss , non-first hit policy + multiple outputs are reported', () => {
  const dmn = `<?xml version="1.0"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" name="Score">
  <decision id="d1" name="Score">
    <decisionTable hitPolicy="COLLECT">
      <input label="age"><inputExpression><text>age</text></inputExpression></input>
      <output name="a"/>
      <output name="b"/>
      <rule><inputEntry><text>&gt;= 18</text></inputEntry><outputEntry><text>"Adult"</text></outputEntry><outputEntry><text>"x"</text></outputEntry></rule>
    </decisionTable>
  </decision>
</definitions>`;
  const codes = importReport(dmn).warnings.map((w) => w.code);
  assert.ok(codes.includes('IL-IMP-DMN-002')); // hit policy
  assert.ok(codes.includes('IL-IMP-DMN-004')); // multiple outputs
  assert.equal(importReport(dmn).ok, false);
});

test('importReport: a decision with no decisionTable is reported and skipped', () => {
  const dmn = '<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="d" name="Empty"/></definitions>';
  const r = importReport(dmn);
  assert.ok(r.warnings.some((w) => w.code === 'IL-IMP-DMN-001'));
  assert.equal(r.stats.decisions, 0);
});

test('importReport: BPMN loss , gateways, conditional flows, and dropped flows are reported', () => {
  const bpmn = `<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" name="Ticket">
  <process id="p1" name="Ticket">
    <startEvent id="s"/>
    <task id="open" name="Open"/>
    <exclusiveGateway id="gw" name="Decide"/>
    <task id="closed" name="Closed"/>
    <endEvent id="e"/>
    <sequenceFlow sourceRef="s" targetRef="open"/>
    <sequenceFlow id="toGw" sourceRef="open" targetRef="gw"/>
    <sequenceFlow id="cond" sourceRef="gw" targetRef="closed"><conditionExpression>ok</conditionExpression></sequenceFlow>
    <sequenceFlow sourceRef="closed" targetRef="e"/>
  </process>
</definitions>`;
  const codes = importReport(bpmn).warnings.map((w) => w.code);
  assert.ok(codes.includes('IL-IMP-BPMN-001')); // gateway
  assert.ok(codes.includes('IL-IMP-BPMN-002')); // condition dropped
  assert.ok(codes.includes('IL-IMP-BPMN-003')); // flow referencing non-task dropped
  // the tasks still import cleanly
  assert.match(importReport(bpmn).source, /state Open/);
});

test('importReport auto-detects format and returns null for unknown', () => {
  assert.equal(importReport(toBPMN(ast0)).format, 'bpmn');
  assert.equal(importReport('<nope/>'), null);
});
