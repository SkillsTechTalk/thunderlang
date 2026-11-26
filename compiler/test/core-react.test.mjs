// Thunder Core screens: the screen engine (engine-core.mjs) and compiled React (target-react.mjs) must show the same
// screen and change it the same way. For every program in fixtures/screens/:
//   1. the React app is rendered with react-dom/server, its HTML is read back into a tree, and that tree must equal
//      the engine's tree;
//   2. the "# do:" lines (press "Label" [n], type "Label" "text") are run in both, on React through
//      react-test-renderer, and the trees must be equal after every one.
// Also: the TSX type-checks under tsc --strict, the runtime is the engine's own code, and the commands work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { screenApp, screenOutline } from '../src/core/engine-core.mjs';
import { toReact } from '../src/core/target-react.mjs';
import { REACT_RUNTIME, REACT_RUNTIME_DTS } from '../src/core/runtime-react.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FIXTURES = join(HERE, 'fixtures', 'screens');
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

// React, react-dom, react-test-renderer, and typescript come from the repository's own dependencies (npm ci).
const require = createRequire(join(ROOT, 'package.json'));
let libs = null;
try {
  libs = {
    React: require('react'),
    server: require('react-dom/server'),
    renderer: require('react-test-renderer'),
    ts: require('typescript'),
  };
} catch { libs = null; }
const skip = libs ? false : 'react, react-dom, react-test-renderer, and typescript are not installed here (run npm ci at the repository root)';

const PROGRAMS = readdirSync(FIXTURES).filter((f) => f.endsWith('.thunder')).sort().map((file) => {
  const source = readFileSync(join(FIXTURES, file), 'utf8');
  const script = [];
  for (const l of source.split('\n')) {
    const m = l.match(/^# do: (press|type) "([^"]*)"(?: "([^"]*)")?(?: (\d+))?\s*$/);
    if (m) script.push({ kind: m[1], label: m[2], text: m[3] ?? null, nth: Number(m[4] ?? 1) });
  }
  return { file, source, script };
});

// ── reading React back into the engine's tree ───────────────────────────────────────────────────────────────────

const textOf = (kids) => (kids ?? []).map((k) => (typeof k === 'string' ? k : textOf(k.children))).join('');

/** One React node ({ type, props, children }, from the test renderer or from HTML) as the engine's tree. */
function toTree(n) {
  if (typeof n === 'string') return n.trim() ? { k: 'stray text', text: n } : null;
  const cls = n.props.className ?? n.props.class ?? '';
  const kids = () => (n.children ?? []).map(toTree).filter(Boolean);
  switch (n.type) {
    case 'section': return { k: 'screen', name: n.props['aria-label'], children: kids() };
    case 'h1': return { k: 'heading', text: textOf(n.children) };
    case 'p':
      if (cls === 'thunder-problem') return { k: 'problem', text: textOf(n.children) };
      if (cls === 'thunder-failed') return { k: 'failed', text: textOf(n.children) };
      return { k: 'text', text: textOf(n.children) };
    case 'div': return { k: 'row', children: kids() };
    case 'ul': return { k: 'list', items: (n.children ?? []).filter((c) => typeof c !== 'string').map((li) => (li.children ?? []).map(toTree).filter(Boolean)) };
    case 'label': {
      const input = (n.children ?? []).find((c) => typeof c !== 'string' && c.type === 'input');
      return { k: input.props.type === 'number' ? 'numberbox' : 'textbox', label: textOf((n.children ?? []).filter((c) => typeof c === 'string')), value: String(input.props.value) };
    }
    case 'button': return { k: 'button', label: textOf(n.children), off: n.props.disabled != null && n.props.disabled !== false };
    default: return { k: `unexpected <${n.type}>` };
  }
}

/** The HTML react-dom/server writes, as { type, props, children } nodes (the few tags a screen uses). */
function parseHtml(html) {
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  const root = { type: '#root', props: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.children.push(decode(m[5])); continue; }
    if (m[1]) { stack.pop(); continue; }
    const props = {};
    for (const a of m[3].matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) props[a[1]] = a[2] === undefined ? '' : decode(a[2]);
    const node = { type: m[2], props, children: [] };
    top.children.push(node);
    if (!m[4] && m[2] !== 'input') stack.push(node);
  }
  return root.children;
}

// ── running the React app ───────────────────────────────────────────────────────────────────────────────────────

/** Compile, transpile the TSX to JavaScript, and load it (next to the repository's node_modules, so React resolves). */
async function loadApp(r, file) {
  const dir = join(ROOT, 'node_modules', '.cache', 'thunder-react-test');
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(dir, 'app-'));
  const tsx = toReact(r.program, r.info, { source: file });
  const js = libs.ts.transpileModule(tsx, { compilerOptions: { jsx: libs.ts.JsxEmit.ReactJSX, module: libs.ts.ModuleKind.ESNext, target: libs.ts.ScriptTarget.ES2022 } }).outputText;
  writeFileSync(join(work, 'thunder_runtime.mjs'), REACT_RUNTIME);
  writeFileSync(join(work, 'app.mjs'), js);
  const mod = await import(pathToFileURL(join(work, 'app.mjs')).href);
  return { mod, tsx, work };
}

/** React's own output, quietly: a screen that fails is reported by React on the console, which the test reads instead. */
function quietly(fn) {
  const err = console.error;
  console.error = () => {};
  try { return fn(); } finally { console.error = err; }
}

/** Every node of a test-renderer tree, in document order. */
function nodes(json, out = []) {
  for (const n of Array.isArray(json) ? json : [json]) {
    if (!n || typeof n === 'string') continue;
    out.push(n);
    nodes(n.children ?? [], out);
  }
  return out;
}

/** The engine's tree, as React's: a failed app is only its message. */
const engineTree = (tree) => tree;
const reactTree = (json) => toTree(Array.isArray(json) ? json[0] : json);

for (const p of PROGRAMS) {
  test(`React and the Thunder engine show ${p.file} the same, and change it the same way`, { skip }, async () => {
    const r = compileCore(p.source, { file: p.file });
    assert.deepEqual(r.diagnostics, [], `${p.file} must compile`);
    const { mod, work } = await loadApp(r, p.file);
    try {
      const engine = screenApp({ entry: r });
      const first = engine.render();

      // 1. Server-rendered HTML, read back, is the engine's tree (a screen that can't be shown has no HTML: React
      // reports that through ShowsProblems, checked below).
      if (first.k !== 'failed') {
        const html = libs.server.renderToStaticMarkup(libs.React.createElement(mod.ThunderApp));
        const [section] = parseHtml(html);
        assert.deepEqual(toTree(section), engineTree(first), `${p.file}: the HTML from react-dom/server`);
      }

      // 2. The same events, in both.
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      const { act, create } = libs.renderer;
      let app;
      quietly(() => act(() => { app = create(libs.React.createElement(mod.ThunderApp)); }));
      assert.deepEqual(reactTree(app.toJSON()), engineTree(first), `${p.file}: the first screen`);
      for (const step of p.script) {
        const where = `${p.file}, after ${step.kind} "${step.label}"${step.text != null ? ` "${step.text}"` : ''}${step.nth > 1 ? ` ${step.nth}` : ''}`;
        const all = nodes(app.toJSON());
        if (step.kind === 'press') {
          const buttons = all.filter((n) => n.type === 'button' && textOf(n.children) === step.label);
          const b = buttons[step.nth - 1];
          assert.ok(b, `${where}: React has the button`);
          const e = engine.press(step.label, step.nth);
          assert.equal(!!b.props.disabled, e.off, `${where}: both agree the button is ${e.off ? 'off' : 'on'}`);
          if (!e.off) quietly(() => act(() => { b.props.onClick(); }));
        } else {
          const labels = all.filter((n) => n.type === 'label' && textOf((n.children ?? []).filter((c) => typeof c === 'string')) === step.label);
          const input = labels[step.nth - 1]?.children.find((c) => typeof c !== 'string' && c.type === 'input');
          assert.ok(input, `${where}: React has the box`);
          engine.type(step.label, step.text, step.nth);
          quietly(() => act(() => { input.props.onChange({ target: { value: step.text } }); }));
        }
        assert.deepEqual(reactTree(app.toJSON()), engineTree(engine.render()), where);
      }
      quietly(() => act(() => app.unmount()));
    } finally { rmSync(work, { recursive: true, force: true }); }
  });
}

test('the generated TSX reads like the program, with line marks, and type-checks under tsc --strict', { skip }, () => {
  const p = PROGRAMS.find((x) => x.file === 'cart.thunder');
  const r = compileCore(p.source, { file: p.file });
  const tsx = toReact(r.program, r.info, { source: p.file });
  assert.match(tsx, /^\/\/ Generated by the Thunder compiler from cart\.thunder\./);
  assert.match(tsx, /export function Cart\(props: \{ open: Opens; items: any; title\?: any \}\) \{ {2}\/\/ thunder:\d+/);
  assert.match(tsx, /const \[coupon, setCoupon\] = React\.useState<any>\(\(\) => \(F\.line = \d+, ""\)\);/);
  assert.match(tsx, /const pressAdd = \(\) => T\.press\(FILE, \d+, setScreenProblem, props\.open, \[cart, name, price\], \[setCart, setName, setPrice\],/);
  assert.match(tsx, /<Cart open=\{props\.open\} items=\{\(F\.line = \d+, cart\)\} \/>\{\/\* thunder:\d+ \*\/\}/);
  assert.match(tsx, /export function ThunderApp\(\) \{/);
  // tsc --strict over every fixture's TSX, with the runtime's declarations and React's types.
  const dir = mkdtempSync(join(ROOT, 'node_modules', '.cache', 'thunder-react-tsc-'));
  try {
    const files = [];
    for (const q of PROGRAMS) {
      const rq = compileCore(q.source, { file: q.file });
      const f = join(dir, q.file.replace(/\W+/g, '_').replace(/_thunder$/, '.tsx'));
      writeFileSync(f, toReact(rq.program, rq.info, { source: q.file }));
      files.push(f);
    }
    writeFileSync(join(dir, 'thunder_runtime.d.mts'), REACT_RUNTIME_DTS);
    const ts = libs.ts;
    const program = ts.createProgram(files, { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, allowImportingTsExtensions: true, skipLibCheck: true, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [], typeRoots: [join(ROOT, 'node_modules', '@types')] });
    const diags = ts.getPreEmitDiagnostics(program).map((d) => `${d.file ? `${d.file.fileName.split('/').pop()}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}: ` : ''}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    assert.deepEqual(diags, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('one meaning: the React runtime is the engine\'s value code and screen code, byte for byte, plus a browser part', () => {
  const values = readFileSync(join(HERE, '..', 'src', 'core', 'engine-values.mjs'), 'utf8').trimEnd();
  const screen = readFileSync(join(HERE, '..', 'src', 'core', 'screen-values.mjs'), 'utf8').replace(/^import [^\n]*\n/m, '').trimEnd();
  assert.ok(REACT_RUNTIME.includes(values), 'thunder_runtime.mjs must contain engine-values.mjs unchanged');
  assert.ok(REACT_RUNTIME.includes(screen), 'thunder_runtime.mjs must contain screen-values.mjs unchanged');
  assert.doesNotMatch(REACT_RUNTIME, /from 'node:/, 'the runtime runs in a browser');
  assert.match(REACT_RUNTIME, /export function press\(file, line, setProblem, open, values, setters, steps\)/);
  assert.match(REACT_RUNTIME_DTS, /export declare function copyValue\(\.\.\.args: any\[\]\): any;/);
  assert.match(REACT_RUNTIME_DTS, /export declare const ShowsProblems: any;/);
});

test('thunder run shows the first screen as an outline; thunder build --target react writes the app', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-screen-'));
  try {
    writeFileSync(join(dir, 'counter.thunder'), readFileSync(join(FIXTURES, 'counter.thunder'), 'utf8'));
    const run = thunder(['run', 'counter.thunder', '--core'], dir);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, [
      'Screen "Counter"',
      '  Heading: Counter',
      '  The count is 0 (at most 3).',
      '  Nothing yet.',
      '  Number box "Step": 1',
      '  Row:',
      '    Button "Less" (off)',
      '    Button "More"',
      '  Button "Reset"',
      '',
    ].join('\n'));
    assert.match(run.stderr, /thunder build --target react/);
    const build = thunder(['build', 'counter.thunder', '--core', '--target', 'react'], dir);
    assert.equal(build.status, 0, build.stderr);
    assert.match(build.stdout, /counter\.thunder {2}-> {2}generated\/react\/counter\.tsx/);
    assert.match(build.stdout, /npm install && npm run dev/);
    for (const f of ['counter.tsx', 'main.tsx', 'index.html', 'thunder_runtime.mjs', 'thunder_runtime.d.mts', 'thunder.css', 'package.json', 'tsconfig.json']) assert.ok(existsSync(join(dir, 'generated', 'react', f)), f);
    assert.match(readFileSync(join(dir, 'generated', 'react', 'main.tsx'), 'utf8'), /import \{ ThunderApp \} from '\.\/counter\.tsx';/);
    // Screens are refused for the other targets (they would be left out), and a React app needs a screen.
    const py = thunder(['build', 'counter.thunder', '--core'], dir);
    assert.equal(py.status, 1);
    assert.match(py.stderr, /"Counter" is a screen, and screens are built as a React app, not for Python\..*\[TC406\]/s);
    writeFileSync(join(dir, 'plain.thunder'), 'say "hi"\n');
    const plain = thunder(['build', 'plain.thunder', '--core', '--target', 'react'], dir);
    assert.equal(plain.status, 1);
    assert.match(plain.stderr, /A React app is built from screens, and this program has no "Screen"\..*\[TC406\]/s);
    const t = thunder(['test', 'counter.thunder', '--core', '--target', 'react'], dir);
    assert.equal(t.status, 2);
    assert.match(t.stderr, /tests run on Python/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the outline of a screen that cannot be shown says why, with the line', () => {
  const p = PROGRAMS.find((x) => x.file === 'fails.thunder');
  const tree = screenApp({ entry: compileCore(p.source, { file: p.file }) }).render();
  assert.equal(screenOutline(tree), '✗ The screen could not be shown: fails.thunder, line 6: There is no item 3: the list has 1 item.  [TC503]');
});

test('screen mistakes are reported with a code, plain words, and the name you probably meant', () => {
  const problems = (src) => compileCore(src).diagnostics.map((d) => `${d.line} ${d.code} ${d.message}${d.hint ? ` | ${d.hint}` : ''}`);
  const one = (src, code, re) => {
    const ds = problems(src);
    assert.ok(ds.some((d) => d.includes(` ${code} `) && re.test(d)), `expected ${code} matching ${re}, got:\n${ds.join('\n')}`);
  };
  one('Screen Home:\n  Shwo "Hi"\n', 'TC118', /isn't something a screen can show\. \| Did you mean "Show"\?/);
  one('Screen Home:\n  Show "Hi"\n  Remember n starting at 0\n', 'TC119', /goes at the top of a screen/);
  one('Screen Home:\n  Show a button "Go" that opens Setings\n\nScreen Settings:\n  Show "S"\n', 'TC212', /I don't know a screen called "Setings"\. \| Did you mean "Settings"\?/);
  one('Screen Home:\n  Show Card\n\nScreen Card:\n  Receive title\n  Remember likes starting at 0\n  Show a button "Rename":\n    When pressed:\n      Set title to "x"\n', 'TC213', /"title" is an input of the screen/);
  one('Screen Home:\n  Show Card:\n    titel: "A"\n\nScreen Card:\n  Receive title\n  Show title\n', 'TC214', /"Card" has no input called "titel"\. Did you mean "title"\?/);
  one('Screen Home:\n  Show Card\n\nScreen Card:\n  Receive title\n  Show title\n', 'TC214', /"Card" needs title, but it is not given/);
  one('Screen Card:\n  Receive title\n  Show title\n', 'TC214', /is the first screen, where the app starts/);
  one('Screen Home:\n  Show a button "Hi":\n    When pressed:\n      Say "hi"\n', 'TC407', /"Say" can't run when a button is pressed/);
  one('Screen Home:\n  Remember name starting at ""\n  Show a number box "Name" for name\n', 'TC305', /A number box holds a number, but "name" is text\. \| Use a text box/);
  one('Screen Home:\n  Remember count starting at 0\n  Show a text box "Count" for cuont\n', 'TC201', /remembers nothing called "cuont"\. \| Did you mean "count"\?/);
  one('Screen Home:\n  Show a button "Hi"\n', 'TC118', /does nothing when it is pressed/);
  one('Screen Home:\n  Remember items starting at ["a"]\n  Show a list with each item in items:\n    Show a button "Rename":\n      When pressed:\n        Set item to "b"\n', 'TC213', /"item" is an item of the list/);
  one('Show "hi"\n', 'TC118', /"Show" is used inside a "Screen"/);
});
