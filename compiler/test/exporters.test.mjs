import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { toDMN, toBPMN, toSMV, toMermaid, toPlaywright, exportIntent, EXPORT_FORMATS } from '../src/exporters.mjs';

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
  assert.equal(exportIntent(ast, 'mermaid').ext, 'mmd');
  assert.equal(exportIntent(ast, 'css').ext, 'css');
  assert.equal(exportIntent(ast, 'playwright').ext, 'spec.ts');
  assert.deepEqual(EXPORT_FORMATS, ['dmn', 'bpmn', 'smv', 'jsonschema', 'openapi', 'tokens', 'mermaid', 'css', 'playwright']);
});

test('toMermaid renders the full graph with safe ids, shapes, and labeled edges', () => {
  const mmd = toMermaid(parseIntent(lifecycleSrc));
  assert.ok(mmd.startsWith('graph TD\n'));
  // states render as rounded nodes; edges carry the relationship type as a label
  assert.match(mmd, /\(\["LifecycleState:/);
  assert.match(mmd, /-->\|requires\|/);
  // node ids are mermaid-safe (no dots) , the graph ids contain dots
  for (const line of mmd.split('\n').slice(1).filter(Boolean)) {
    const id = line.trim().split(/[[({]/)[0].split(' ')[0];
    assert.ok(!id.includes('.'), `id "${id}" must be mermaid-safe`);
  }
});

test('toMermaid never leaks quotes/brackets/pipes that would break mermaid parsing', () => {
  const mmd = toMermaid(parseIntent(`mission M
guarantee the "customer" is [charged] once | twice
`));
  // label content sits inside {{"..."}} with no raw quote/bracket/pipe inside the label text
  const labels = [...mmd.matchAll(/(?:\["|\(\["|\{\{"|\{")(.*?)(?:"\]|"\]\)|"\}\}|"\})/g)].map((m) => m[1]);
  assert.ok(labels.length > 0);
  for (const l of labels) assert.ok(!/["\[\]|]/.test(l), `label leaked a special char: ${l}`);
});

test('toMermaid on an empty mission is a valid, minimal diagram', () => {
  const mmd = toMermaid(parseIntent('mission Solo\n'));
  assert.ok(mmd.startsWith('graph TD\n'));
  assert.match(mmd, /Mission: Solo/);
});

test('toPlaywright scaffolds describe/test/test.step from experiences + journeys', () => {
  const src = `mission Storefront
use experience
experience CheckoutFlow
  goal "buy"
  accessible
    target WCAG_2_2_AA
  journey HappyPath
    user reviews the cart
    user pays
  state Reviewing
  state Failed
    recover retry
`;
  const spec = toPlaywright(parseIntent(src));
  assert.match(spec, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(spec, /test\.describe\('CheckoutFlow'/);
  assert.match(spec, /test\('HappyPath'/);
  assert.match(spec, /await test\.step\('user reviews the cart'/);
  assert.match(spec, /reaches state: Reviewing/);
  assert.match(spec, /failure state "Failed" offers a recovery path/);
  assert.match(spec, /WCAG_2_2_AA \(proposed/);
});

test('toPlaywright guards every scaffolded test with test.fixme so an unfilled scaffold cannot pass vacuously', () => {
  const src = `mission Storefront
use experience
experience CheckoutFlow
  journey HappyPath
    user pays
  state Reviewing
  state Failed
    recover retry
`;
  const spec = toPlaywright(parseIntent(src));
  const testCount = (spec.match(/^ {2}test\('/gm) || []).length;
  const guardCount = (spec.match(/^ {4}test\.fixme\(true, 'scaffold: /gm) || []).length;
  assert.equal(testCount, 3); // 1 journey + 2 states
  assert.equal(guardCount, testCount, 'each generated test must open with a test.fixme guard');
  // the guard is the first statement of each test body
  const lines = spec.split('\n');
  lines.forEach((line, i) => {
    if (/^ {2}test\('/.test(line)) assert.match(lines[i + 1], /^ {4}test\.fixme\(true, /);
  });
});

test('toPlaywright escapes quotes in journey/step text (valid JS strings)', () => {
  const spec = toPlaywright(parseIntent(`mission M
use experience
experience E
  journey J
    user clicks the 'Buy' button
`));
  assert.match(spec, /await test\.step\('user clicks the \\'Buy\\' button'/);
});

test('toPlaywright with no experiences is a valid, empty scaffold', () => {
  const spec = toPlaywright(parseIntent('mission M\nuse product\n'));
  assert.match(spec, /@playwright\/test/);
  assert.match(spec, /nothing to scaffold/);
});

test('exports are deterministic (same input -> byte-identical output)', () => {
  assert.equal(toDMN(parseIntent(decisionSrc)), toDMN(parseIntent(decisionSrc)));
  assert.equal(toBPMN(parseIntent(lifecycleSrc)), toBPMN(parseIntent(lifecycleSrc)));
  assert.equal(toSMV(parseIntent(lifecycleSrc)), toSMV(parseIntent(lifecycleSrc)));
  assert.equal(toMermaid(parseIntent(lifecycleSrc)), toMermaid(parseIntent(lifecycleSrc)));
});
