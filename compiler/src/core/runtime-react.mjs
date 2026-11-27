// thunder_runtime.mjs for compiled React, and its declarations (thunder_runtime.d.mts).
//
// One meaning of Thunder: the engine's value code (engine-values.mjs) and the engine's screen code (screen-values.mjs),
// byte for byte, followed by a small browser part: call frames for error lines, a press (copies in, all or nothing),
// typing into a box, and the message shown when the app cannot be shown. No Node APIs: it runs in a browser.
import { readFileSync } from 'node:fs';
import * as VALUES from './engine-values.mjs';
import * as SCREEN from './screen-values.mjs';
import { byText } from '../text-order.mjs';

const VALUES_SOURCE = readFileSync(new URL('./engine-values.mjs', import.meta.url), 'utf8');
// (Its import line names what engine-values.mjs already defined above it.)
const SCREEN_SOURCE = readFileSync(new URL('./screen-values.mjs', import.meta.url), 'utf8').replace(/^import [^\n]*\n/m, '');

const BROWSER_PART = `
// ── Running compiled React: frames (for error lines), presses, typing, and the app's problems ────────────────────
import { Component, createElement } from 'react';

const frames = [];
const snapshot = () => frames.map((f) => ({ file: f.file, line: f.line }));

/** A frame for a screen being shown, a press, or a kept value. */
export function enterFrame(file, line) {
  if (frames.length >= MAX_FRAMES) throw new PyErr('RecursionError', 'maximum recursion depth exceeded');
  const f = { file, line };
  frames.push(f);
  return f;
}
/** A frame for a call; \`first\` is the Thunder line the function starts on (where Python stops when it is too deep). */
export function enterCall(file, line, first) {
  if (frames.length >= MAX_FRAMES) {
    const err = new PyErr('RecursionError', 'maximum recursion depth exceeded');
    if (first != null) err.where = [...snapshot(), { file, line: first }];
    throw err;
  }
  const f = { file, line };
  frames.push(f);
  return f;
}
export function leave() { frames.pop(); }
export function topFrame() { return frames[frames.length - 1]; }
export function fail(e) { const err = asPyErr(e); if (!err.where) err.where = snapshot(); return err; }
function withFrame(frame, fn) {
  if (frames.length >= MAX_FRAMES) throw new PyErr('RecursionError', 'maximum recursion depth exceeded');
  frames.push(frame);
  try { return fn(); } catch (e) { throw fail(e); } finally { frames.pop(); }
}
export function keyAt(F, get) { const frame = { file: F.file, line: F.line }; return (item) => withFrame(frame, () => get(item)); }

/** Say, from a function a screen calls: a screen shows things instead, so it goes to the browser's console. */
export function say(text) { console.log(text); }
export function readText(path) { return readTextVia(null, '.', path); }

export function recordKind(py, fields, rules = {}) { return { isRecord: true, py, fields, rules }; }
export function setAttr(obj, name, value) {
  setAttrWith((rec) => { for (const r of rec.cls.rules[name] ?? []) never(r.cond(value), r.text, r.line, value); }, obj, name, value);
}
export function setField(obj, key, value) { setFieldWith(setAttr, obj, key, value); }
export function newRecord(cls, pairs) { return newRecordWith(setAttr, cls, new Map(pairs)); }

let startProblem = null;
/** Work out a file's kept values; if one fails, the app shows why instead of its screen. */
export function init(file, fn) {
  if (startProblem) return;
  const F = { file, line: 0 };
  try { withFrame(F, () => fn(F)); } catch (e) { startProblem = describeError(asPyErr(e)); }
}

/**
 * A press: \`steps\` runs on copies of the remembered values (in \`values\`), in its own frame. If every step works, each
 * value is kept (with its setter) and the screen's problem is cleared, then the screen it opened (if any) is shown.
 * If a step fails, nothing is kept and the screen says why.
 */
export function press(file, line, setProblem, open, values, setters, steps) {
  let opened = null;
  let next;
  try {
    next = withFrame({ file, line }, () => steps(topFrame(), (screen) => { opened = screen; }, ...values.map(copyValue)));
  } catch (e) {
    setProblem(problemText(e));
    return;
  }
  setters.forEach((set, k) => set(next[k]));
  setProblem(null);
  if (opened !== null) open(opened);
}

/** Typing into a text box: the box's value is the text. */
export function typeText(text, set, setProblem) { set(String(text)); setProblem(null); }
/** Typing into a number box: the box's value is the number, or the screen says why the text is not one. */
export function typeNumber(text, kind, set, setProblem) {
  let v;
  try { v = typedNumber(text, kind); } catch (e) { setProblem(problemText(e)); return; }
  set(v);
  setProblem(null);
}

/** Around the app: when a screen can't be shown, it says why (the same message thunder run gives). */
export class ShowsProblems extends Component {
  constructor(props) { super(props); this.state = { failed: null }; }
  static getDerivedStateFromError(error) { return { failed: describeError(asPyErr(error)) }; }
  componentDidCatch() {}
  render() {
    const failed = startProblem ?? this.state.failed;
    if (failed !== null) return createElement('p', { role: 'alert', className: 'thunder-failed' }, failed);
    return this.props.children;
  }
}
`;

const BROWSER_EXPORTS = ['enterFrame', 'enterCall', 'leave', 'topFrame', 'fail', 'keyAt', 'say', 'readText', 'recordKind', 'setAttr', 'setField', 'newRecord', 'init', 'press', 'typeText', 'typeNumber'];

const HEADER = `// thunder_runtime.mjs: written by the Thunder compiler next to compiled React. It needs only React.
// The values, rules, and screen behavior here are the Thunder engine's own (engine-values.mjs and screen-values.mjs),
// so the React app and the Thunder engine show the same screen and change it the same way.
`;

export const REACT_RUNTIME = `${HEADER}\n${VALUES_SOURCE.trimEnd()}\n\n// ── Screens (screen-values.mjs) ──\n${SCREEN_SOURCE.trimEnd()}\n${BROWSER_PART}`;

const isClass = (v) => typeof v === 'function' && /^class\b/.test(Function.prototype.toString.call(v));

function declarations() {
  const L = ['// thunder_runtime.d.mts: types for thunder_runtime.mjs (written by the Thunder compiler).', '// Thunder values are checked when the program runs; to TypeScript they are of any kind.', ''];
  for (const [name, v] of Object.entries({ ...VALUES, ...SCREEN }).sort(([a], [b]) => byText(a, b))) {
    if (isClass(v)) L.push(`export declare class ${name} { constructor(...args: any[]); [key: string]: any; static [key: string]: any; }`);
    else if (typeof v === 'function') L.push(`export declare function ${name}(...args: any[]): any;`);
    else L.push(`export declare const ${name}: any;`);
  }
  for (const f of BROWSER_EXPORTS) L.push(`export declare function ${f}(...args: any[]): any;`);
  L.push('export declare const ShowsProblems: any;');
  return `${L.join('\n')}\n`;
}

export const REACT_RUNTIME_DTS = declarations();
