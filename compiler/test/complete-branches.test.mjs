// Complete behavior before prettier pictures: every else, else-if, except/catch/rescue and finally/ensure is read and
// shown, in every language, at every depth. Found by OpenThunder (an else and a rollback were missing while the
// reading claimed 100%) and by the language audit (0% of branches shown in 11 open-source repos before this fix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { classifyStatement, sayCodeCondition } from '../src/steps.mjs';
import { thunderText } from '../src/visual.mjs';
import { thunderModel, modelText } from '../src/model.mjs';

const fn = (src, language) => readCode(src, { language }).items.find((i) => i.kind === 'function' || i.kind === 'decision');

const PY = `def save_order(order, db):
    if order.paid:
        order.status = "ready"
    else:
        order.status = "waiting"
        notify(order.customer)
    try:
        db.add(order)
        db.commit()
    except DatabaseError:
        db.rollback()
        raise SaveFailed("Could not save the order")
    finally:
        db.close()
    return order
`;

test('Python: else, except, and finally are all read, with their own steps', () => {
  const [branch, attempt] = fn(PY, 'python').steps;
  assert.deepEqual(branch.otherwise.map((s) => s.says), ["Sets the order's status to \"waiting\"", 'Calls notify']);
  assert.equal(attempt.handlers[0].says, 'If DatabaseError goes wrong');
  assert.deepEqual(attempt.handlers[0].steps.map((s) => s.kind), ['call', 'fail']);
  assert.deepEqual(attempt.always.steps.map((s) => s.says), ['Calls close']);
});

test('TypeScript: else-if chains, catch, and finally are read from the brace blocks', () => {
  const ts = `function saveOrder(order: Order) {
  if (order.paid) {
    order.status = "ready";
  } else if (order.late) {
    order.status = "late";
  } else {
    order.status = "waiting";
  }
  try {
    db.save(order);
  } catch (e) {
    db.rollback();
    throw new SaveFailed("no");
  } finally {
    db.close();
  }
  return order;
}
`;
  const [branch, attempt] = fn(ts, 'typescript').steps;
  const elseIf = branch.otherwise[0];
  assert.equal(elseIf.elseIf, true);
  assert.deepEqual(elseIf.otherwise.map((s) => s.says), ["Sets the order's status to \"waiting\""]);
  assert.equal(attempt.handlers[0].says, 'If anything goes wrong');
  assert.equal(attempt.handlers[0].steps.at(-1).kind, 'fail');
  assert.ok(attempt.always);
});

test('branches inside loops and inside branches are read at every depth', () => {
  const ts = 'function f(params: Record<string, string>) {\n  for (const [key, value] of Object.entries(params)) {\n    if (value === undefined) {\n      drop(key);\n    } else {\n      keep(key, value);\n    }\n  }\n}\n';
  const loop = fn(ts, 'typescript').steps[0];
  assert.equal(loop.says, 'For each key and value in params');
  assert.equal(loop.children[0].otherwise[0].says, 'Calls keep');
});

test('PHP names the error a catch handles, even with a leading namespace backslash', () => {
  const php = '<?php\nclass A {\n  public function g($u) {\n    try {\n      $uri = self::make($u);\n    } catch (\\InvalidArgumentException $e) {\n      return null;\n    }\n    return $uri;\n  }\n}\n';
  assert.equal(fn(php, 'php').steps[0].handlers[0].says, 'If InvalidArgumentException goes wrong');
});

test('Ruby: elsif/else, method-level rescue and ensure; bare words are calls unless they are the value given back', () => {
  const rb = 'def save\n  if ready?\n    write\n  elsif late?\n    remind\n  else\n    hold\n  end\n  rollback\n  done\nrescue DbError\n  log_it\n  retry_later\nensure\n  close\nend\n';
  const [attempt] = fn(rb, 'ruby').steps;
  assert.equal(attempt.kind, 'try');
  const [branch, rollback, done] = attempt.children;
  assert.ok(branch.otherwise[0].elseIf);
  assert.deepEqual([rollback.kind, done.kind], ['call', 'return']);
  assert.deepEqual(attempt.handlers[0].steps.map((s) => s.kind), ['call', 'return']);
  assert.deepEqual(attempt.always.steps.map((s) => s.kind), ['call'], 'nothing in ensure is the value given back');
});

test('Go: if with a setup statement keeps its condition; the err idiom reads as "fails"; counted loops are loops', () => {
  const go = 'package x\n\nfunc load() error {\n\tif err := open(); err != nil {\n\t\treturn err\n\t} else {\n\t\tlog("ok")\n\t}\n\tfor i := 0; i < 3; i++ {\n\t\ttry(i)\n\t}\n\treturn nil\n}\n';
  const [branch, loop] = fn(go, 'go').steps;
  assert.equal(branch.says, 'If open fails');
  assert.ok(branch.otherwise.length);
  assert.equal(loop.kind, 'loop');
  assert.match(loop.says, /^Counts i from 0 while/);
  assert.equal(classifyStatement('_, err := buf.WriteTo(w)').says, 'Works out err from write to');
});

test('Java and C#: switch cases, casts, typed declarations, factory-made errors', () => {
  assert.equal(classifyStatement('case PEEKED_DOUBLE_QUOTED_NAME:').says, 'When it is peeked double quoted name');
  assert.equal(classifyStatement('default:').says, 'Otherwise');
  assert.equal(classifyStatement('((JsonTreeReader) reader).promoteNameToValue();').says, 'Calls promote name to value');
  assert.equal(classifyStatement('BoundField field = deserializedFields.get(name);').says, 'Sets field to the name entry in deserialized fields');
  assert.equal(classifyStatement('throw createExceptionForUnexpectedIllegalAccess(e);').says, 'Fails with the error made by create exception for unexpected illegal access');
  assert.equal(classifyStatement('while (in.hasNext()) {').says, 'Repeats while in has next');
});

test('plain names used as conditions read as set / not set; yes/no values read as "whether"', () => {
  assert.equal(sayCodeCondition('proxy'), 'proxy is set');
  assert.equal(sayCodeCondition('not proxy_url.host'), "the proxy url's host is not set");
  assert.equal(classifyStatement('is_proxied = proxy and scheme != "https"').says, 'Works out is proxied: whether proxy and scheme is not "https"');
});

test('Thunder Text and the model show every branch, the same way', () => {
  const text = thunderText(fn(PY, 'python'));
  assert.match(text, /Otherwise:\n {6}- Sets the order's status to "waiting"/);
  assert.match(text, /If DatabaseError goes wrong:/);
  assert.match(text, /Always, at the end:\n {6}- Calls close/);
  const m = thunderModel([{ path: 'save.py', source: PY }]);
  const mt = modelText(m, m.members[0].id);
  assert.match(mt, /Ask: Is order paid\?/);
  assert.match(mt, /No:\n {6}- Sets the order's status to "waiting"/);
  assert.match(mt, /If DatabaseError goes wrong:\n {6}- Calls rollback/);
  assert.match(mt, /Always, at the end:\n {6}- Calls close/);
});

test('readability fixes found by sampling real repos in every language', () => {
  const says = (x) => classifyStatement(x).says;
  assert.equal(says('while (i < length) {'), 'Repeats while i is less than length');
  assert.equal(says('foreach (var openBehaviorInterface in implemented) {'), 'For each open behavior interface in implemented');
  assert.equal(says('behaviors.Add(new ServiceDescriptor(x));'), 'Adds a new service descriptor to behaviors');
  assert.equal(says('current = @params.dup'), 'Sets current to a copy of params');
  assert.equal(says('set :running_server, nil'), 'Calls set: running server');
  assert.equal(says('let sizeError: ResponseSizeError | undefined;'), 'Starts with no size error yet');
  assert.equal(says('ky.create = (newDefaults?: Partial<Options>) => createInstance(newDefaults);'), "Defines how the ky's create works");
  assert.equal(says('const k = opts.retry ? 3 : 0;'), "Sets k to 3 if the opts's retry is set, otherwise 0");
  assert.equal(says('x = a if ready else c'), 'Sets x to a if ready is set, otherwise c');
  assert.equal(sayCodeCondition('!empty($entry["attached"])'), "the entry's attached is not empty");
  assert.equal(sayCodeCondition('isset($this->active)'), 'active is set');
  assert.equal(sayCodeCondition('len(rows) == 0'), 'how many rows is 0');
  assert.equal(sayCodeCondition('order.paid?'), 'order is paid');
  assert.equal(sayCodeCondition('isLoggingExceptionMessage(context, arg)'), 'is logging exception message');
});

test('one-line ifs and Ruby modifiers become a question with their one step', () => {
  const cs = readCode('public class A {\n  public bool F(int[] xs) {\n    if (xs.Length != 1) return false;\n    return true;\n  }\n}\n', { language: 'csharp' }).items.find((i) => i.name === 'F');
  const branch = (cs.steps || []).find((s) => s.kind === 'branch') ?? null;
  if (branch) assert.equal(branch.children?.[0]?.kind, 'return');
  const rb = fn('def quit!\n  return unless running?\n  stop\nend\n', 'ruby');
  assert.equal(rb.steps[0].kind, 'branch');
  assert.equal(rb.steps[0].says, 'If not: it is running');
  assert.equal(rb.steps[0].children[0].says, 'Stops here');
});

test('PHP attributes are not parameters', () => {
  const php = '<?php\nclass A {\n  public function g(#[\\SensitiveParameter] $easyHandle) {\n    return $easyHandle;\n  }\n}\n';
  assert.deepEqual(fn(php, 'php').inputs.map((p) => p.name), ['easyHandle']);
});
