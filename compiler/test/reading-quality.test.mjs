// Reading quality on everyday code (scripts/reading-quality.mjs measures it on real repositories): what a message
// writes, what an add adds, what a call is given, common library calls in words, callbacks said by purpose, and the
// same truth checks as everything else. Every snippet here is made up for the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';

const steps = (src, language = 'typescript') => {
  const out = [];
  const walk = (ss) => { for (const s of ss || []) { out.push(s.explained === false ? `CODE ${s.code}` : s.says); walk(s.children); } };
  walk(readCode(src, { language }).items[0].steps);
  return out;
};

test('a message says what it writes: its text (values as «placeholders»), a named value, or a call result', () => {
  const said = steps("export function f(opts: any, report: any) {\n  console.log('Next: add the secret to the repository settings.');\n  console.log(`Wrote ${opts.out}.`);\n  console.error(render(report));\n  console.log('Saved', report);\n}\n");
  assert.deepEqual(said, [
    'Writes a log or message: "Next: add the secret to the repository settings."',
    'Writes a log or message: "Wrote «opts.out»."',
    'Writes a log or message: the result of render',
    'Writes a log or message: "Saved", and more',
  ]);
  assert.deepEqual(steps('def f(total):\n    print(f"Total: {total} items")\n    print(total)\n', 'python'), ['Writes a log or message: "Total: {total} items"', 'Writes a log or message: total']);
});

test('an add says what it adds: an entry by its fields, a text, a field, a call result; push of several values', () => {
  const said = steps("export function f(out: any[], lines: string[], items: any[], c: any) {\n  out.push({ title: c.name, rows: [], source: '' });\n  lines.push('', 'Selected public text only.');\n  items.push(c.id);\n  out.push(render(c));\n}\n");
  assert.deepEqual(said, ['Adds an entry (title, rows, source) to out', 'Adds "" and "Selected public text only." to lines', "Adds the c's id to items", 'Adds the result of render to out']);
  // `list.add(index, element)` puts one value at a place: never "Adds index and element".
  assert.doesNotMatch(steps('class A { void f(java.util.List<String> xs, int i, String e) { xs.add(i, e); } }', 'java').join('\n'), /Adds i and/);
});

test('a single argument a call is given is named, so two calls of the same function differ', () => {
  assert.deepEqual(steps("export function f(cmd: any) {\n  cmd.addCommand(rulesCommand());\n  cmd.addCommand(initCommand());\n}\n"), ['Calls add command (with the result of rules command)', 'Calls add command (with the result of init command)']);
});

test('everyday JavaScript and Python calls are said by what they give back', () => {
  const ts = steps("export function f(byAgent: any, ts: string, chunk: any, re: RegExp, text: string, request: any, a: number, b: number, seen: Map<string, number>, row: any, p: string) {\n  const names = Object.keys(byAgent);\n  const t = Date.parse(ts);\n  const buf = Buffer.from(chunk);\n  const m = re.exec(text);\n  const body = Schema.parse(request.body);\n  const n = Math.max(a, b);\n  const c = seen.get(row.id);\n  const d = fs.readFileSync(p, 'utf8');\n  return [names, t, buf, m, body, n, c, d];\n}\n");
  for (const want of ['Sets names to the keys of by agent', 'Sets t to the time written in ts', 'Sets buf to a Buffer made from chunk', 'Sets m to the first match of re in text', "Sets body to the request's body, checked and read by Schema", 'Sets n to the largest of a and b', "Sets c to the entry for the row's id in seen", 'Reads the file at p (as d)']) assert.ok(ts.includes(want), want);
  const py = steps('def f(trades, names, name):\n    d = Settings()\n    cols = list(trades.columns)\n    i = names.index(name)\n    return d, cols, i\n', 'python');
  for (const want of ['Sets d to a new Settings', 'Sets i to the position of name in names']) assert.ok(py.includes(want), want);
  assert.ok(py.some((x) => /^Sets cols to the trades's columns, as a list$/.test(x)));
});

test('callbacks are said by purpose; a one-expression event handler says when it runs', () => {
  const said = steps("export function f(program: any, db: any, child: any, resolve: any) {\n  program.command('check')\n    .action(async () => {\n      run();\n    });\n  db.transaction(async (tx: any) => {\n    await tx.save(1);\n  });\n  child.on('close', (code: number) => resolve(code));\n}\n");
  assert.equal(said[0], 'Defines the command "check"; when it runs, it does these steps');
  assert.ok(said.includes('Does these steps in one database transaction'));
  assert.ok(said.includes('Whenever "close" happens, it calls resolve'));
});

test('"an Error", "an OrderedDict": a type check takes a or an by sound; a variable named match is not a match statement', () => {
  assert.ok(steps('export function f(e: unknown) {\n  const d = e instanceof Error ? e.message : String(e);\n  return d;\n}\n').includes("Sets d to the e's message if e is an Error, otherwise e as text"));
  assert.ok(steps('def f(axes):\n    assert isinstance(axes, OrderedDict)\n    return axes\n', 'python').includes('Checks that axes is an OrderedDict'));
  assert.doesNotMatch(steps('def f(pattern, s):\n    match = pattern.match(s)\n    return match\n', 'python').join('\n'), /Chooses by/);
});
