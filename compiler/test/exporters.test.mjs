import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { toDMN, toBPMN, toSMV, exportIntent, EXPORT_FORMATS } from '../src/exporters.mjs';

const decisionSrc = `mission Eligibility
decision CanEnroll
  inputs
    age
  rule adult
    when age >= 18
    return Eligible
  rule minor
    when age < 18
    return NotEligible
  default
    return NotEligible
`;
const lifecycleSrc = `mission Flow
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
always
  application is never lost
eventually
  application is decided
  within 48 hours
`;

test('toDMN renders a FIRST-hit decision table with a rule per rule + default', () => {
  const dmn = toDMN(parseIntent(decisionSrc));
  assert.match(dmn, /<\?xml/);
  assert.match(dmn, /hitPolicy="FIRST"/);
  assert.match(dmn, /decision id="dec_CanEnroll"/);
  // both rules + the default => 3 rules
  assert.equal((dmn.match(/<rule /g) || []).length, 3);
  assert.match(dmn, /&quot;Eligible&quot;/);
  // the when-expression is preserved and XML-escaped
  assert.match(dmn, /age &gt;= 18/);
});

test('toDMN on a mission with no decisions is empty-but-valid', () => {
  const dmn = toDMN(parseIntent('mission M\nguarantees\n  a holds\n'));
  assert.match(dmn, /<definitions/);
  assert.ok(!dmn.includes('<decision '));
});

test('toBPMN maps states to tasks, transitions to sequence flows, terminals to an end event', () => {
  const bpmn = toBPMN(parseIntent(lifecycleSrc));
  assert.match(bpmn, /process id="proc_Enrollment"/);
  assert.equal((bpmn.match(/<task /g) || []).length, 4); // 4 states
  assert.match(bpmn, /<startEvent /);
  assert.match(bpmn, /targetRef="t_Enrollment_Draft"/); // start -> initial
  assert.match(bpmn, /name="submit"/);
  assert.match(bpmn, /<endEvent /);
});

test('toSMV builds a faithful transition relation with EF reachability for terminals', () => {
  const smv = toSMV(parseIntent(lifecycleSrc));
  assert.match(smv, /MODULE main/);
  assert.match(smv, /state : \{Draft, Submitted, Approved, Rejected\}/);
  assert.match(smv, /init\(state\) := Draft/);
  // Submitted branches to both Approved and Rejected
  assert.match(smv, /state = Submitted : \{Approved, Rejected\}/);
  // terminals are asserted reachable
  assert.match(smv, /SPEC EF \(state = Approved\)/);
  assert.match(smv, /SPEC EF \(state = Rejected\)/);
});

test('toSMV emits a temporal SPEC skeleton for always/eventually (no [object Object])', () => {
  const smv = toSMV(parseIntent(lifecycleSrc));
  assert.match(smv, /always: application is never lost/);
  assert.match(smv, /eventually: application is decided \(within 48 hours\)/);
  assert.match(smv, /SPEC AG \(p_0\)/);
  assert.match(smv, /SPEC AF \(p_1\)/);
  assert.ok(!smv.includes('[object Object]'));
});

test('toSMV with no lifecycle returns a valid empty note', () => {
  const smv = toSMV(parseIntent('mission M\nguarantees\n  a holds\n'));
  assert.match(smv, /no lifecycle declared/);
});

test('exportIntent dispatches by format and rejects unknown formats', () => {
  const ast = parseIntent(decisionSrc);
  assert.equal(exportIntent(ast, 'dmn').ext, 'dmn');
  assert.equal(exportIntent(ast, 'bpmn').ext, 'bpmn');
  assert.equal(exportIntent(ast, 'smv').ext, 'smv');
  assert.equal(exportIntent(ast, 'yaml'), null);
  assert.deepEqual(EXPORT_FORMATS, ['dmn', 'bpmn', 'smv', 'jsonschema', 'openapi', 'tokens']);
});

test('exports are deterministic (same input -> byte-identical output)', () => {
  assert.equal(toDMN(parseIntent(decisionSrc)), toDMN(parseIntent(decisionSrc)));
  assert.equal(toBPMN(parseIntent(lifecycleSrc)), toBPMN(parseIntent(lifecycleSrc)));
  assert.equal(toSMV(parseIntent(lifecycleSrc)), toSMV(parseIntent(lifecycleSrc)));
});
