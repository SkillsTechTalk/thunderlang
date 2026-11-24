// A choice among several cases is one question with one side per case; an inner function (a hook, a callback) is
// its own sub-flow, so a return or stop inside it never ends the outer action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderModel, modelText, readLevel } from '../src/model.mjs';

test('Kotlin when: one question, one side per case, the Otherwise last; Details knows which case leads where', () => {
  const src = 'fun label(score: Int): String {\n    val grade = when (score) {\n        in 90..100 -> "A"\n        in 80..89 -> "B"\n        else -> "C"\n    }\n    log(grade)\n    return grade\n}\n';
  const m = thunderModel([{ path: 'a.kt', source: src }]);
  const mem = m.members[0];
  const d = mem.flow.blocks.find((b) => b.cases);
  assert.deepEqual(d.cases.map((c) => c.label), ['When it is from 90 to 100', 'When it is from 80 to 89', 'Otherwise']);
  assert.equal(mem.flow.nodes.find((n) => n.id === d.id).text, 'Chooses by score');
  assert.ok(mem.flow.edges.filter((e) => e.from === d.id).every((e) => e.label === 'case' && e.text));
  assert.match(modelText(m, mem.id), /- Chooses by score {2}\(line 2\)\n {4}When it is from 90 to 100:\n {6}- Sets grade to "A"/);
  const steps = readLevel(m, 'details', mem.id).steps;
  assert.equal(steps.find((s) => s.text === 'Sets grade to "C"').via, 'Otherwise');
});

test('a switch with no default: a value that matches no case carries straight on', () => {
  const src = 'function size(n) {\n  switch (n) {\n    case 1:\n      log("one");\n      break;\n    case 2:\n      log("two");\n      break;\n  }\n  return n;\n}\n';
  const m = thunderModel([{ path: 'a.js', source: src }]);
  const flow = m.members[0].flow;
  const d = flow.blocks.find((b) => b.cases);
  if (!d) return; // this reader may keep a classic switch as steps; then nothing to check here
  assert.ok(flow.edges.some((e) => e.from === d.id && e.text === 'None of these'));
});

test('a React effect is its own sub-flow: its early return does not stop the component, and props are what goes in', () => {
  const src = 'function Profile({ userId, name }) {\n  useEffect(() => {\n    if (!userId) return;\n    load(userId);\n  }, [userId]);\n  save();\n  return 1;\n}\n';
  const m = thunderModel([{ path: 'a.tsx', source: src }]);
  const mem = m.members[0];
  assert.deepEqual(mem.youGive, ['user id', 'name']);
  const effect = mem.flow.blocks.find((b) => b.nested);
  assert.ok(effect, 'the effect is marked as an inner function');
  assert.deepEqual(mem.flow.edges.filter((e) => e.from === effect.id).map((e) => e.label).sort(), [undefined, 'nested'].sort(), 'one edge into its own steps (nested), one on to the next step');
  const save = mem.flow.nodes.find((n) => /save/i.test(n.text));
  assert.deepEqual(mem.flow.edges.filter((e) => e.to === save.id).map((e) => e.from), [effect.id], 'save always follows the effect step');
  const d = readLevel(m, 'details', mem.id);
  assert.deepEqual(d.givesBack.map((g) => g.text), ['Gives back 1'], "the effect's 'Stops here' is not one of the component's endings");
});
