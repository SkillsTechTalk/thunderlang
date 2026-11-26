// Screens: React and Angular components read as what a person sees and does (src/screens.mjs), in the same model
// OpenThunder reads (model.screens, readLevel, modelText) and in `thunder read --level`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readScreens, screenText, conditionWords } from '../src/screens.mjs';
import { thunderModel, readLevel, modelText } from '../src/model.mjs';
import { findFocus } from '../src/read-level.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures', 'screens');
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const load = (dir) => readdirSync(join(FIX, dir)).map((f) => ({ path: `${dir}/${f}`, source: readFileSync(join(FIX, dir, f), 'utf8') }));
const model = thunderModel([...load('react'), ...load('angular')]);
const screen = (name) => model.screens.find((s) => s.name === name);
const flat = (items) => items.flatMap((i) => [i.says, ...flat(i.kids ?? []), ...(i.otherwise ? [i.otherwise.says, ...flat(i.otherwise.kids)] : [])]);

test('a React component: its props, state, early return, what it shows, its events, and its effect', () => {
  const s = screen('Cart');
  assert.equal(s.framework, 'react');
  assert.deepEqual(s.inputs.map((i) => [i.name, i.kind, !!i.optional, i.start ?? null]), [['items', 'a list of CartItem', false, null], ['onCheckout', 'an action to run', false, null], ['title', 'text', true, '"Your cart"']]);
  assert.deepEqual(s.state.map((x) => [x.name, x.start]), [['coupon', '""'], ['open', 'no']]);
  assert.deepEqual(s.early.map((e) => [e.when, e.shows[0].says]), [['items is empty', 'a paragraph: "Your cart is empty"']]);
  const says = flat(s.shows);
  for (const want of ['a heading: "{title}"', 'one of these per item in items:', 'a row: "{item\'s name}: {item\'s price}"', 'when open, it shows:', 'a paragraph: "Coupons give 10% off"']) assert.ok(says.includes(want), want);
  assert.ok(says.includes('a text box: "Coupon code" (showing coupon); when it changes: sets coupon to what was typed or chosen'));
  assert.ok(says.includes('a button: "Help"; when it is pressed: sets open to the opposite of open'));
  assert.ok(says.some((x) => /^a button: "Checkout" \(turned off when .*\); when it is pressed: tells the parent \(on checkout\)$/.test(x)));
  assert.deepEqual(s.effects.map((e) => [e.when, e.runs]), [['When coupon changes', 'runs save draft with coupon']]);
  assert.equal(s.member, model.members.find((m) => m.name === 'Cart' && m.file === 'react/Cart.tsx').id);
  assert.deepEqual(s.notRead, []);
});

test('React: a choice between two things to show, child screens, a form submit linked to its handler, and what is not read', () => {
  const app = screen('App');
  const says = flat(app.shows);
  assert.ok(says.includes('when user is set, it shows:') && says.includes('a paragraph: "Hello, {user\'s name}"') && says.includes('otherwise, it shows:'));
  assert.ok(says.includes('the Cart screen; when it gets "checkout": runs checkout'));
  assert.deepEqual(app.uses.map((u) => u.label), ['Cart', 'Signup form']);
  assert.deepEqual(screen('Cart').usedBy.map((u) => u.label), ['App']);
  const form = screen('SignupForm');
  assert.ok(flat(form.shows).includes('a form; when it is sent: runs submit'));
  const submit = form.events.find((e) => e.event === 'submit');
  assert.equal(submit.member, model.members.find((m) => m.name === 'submit').id);
  assert.ok(flat(form.shows).includes('an email box (showing email); when it changes: sets email to what was typed or chosen'));
  assert.deepEqual(form.notRead.map((n) => [n.line, n.code]), [[33, 'renderFooter({ email })']]);
});

test('an Angular component with an inline template: @if/@else, @for, two-way binding, a signal, an output, and ngOnInit', () => {
  const s = screen('CartComponent');
  assert.equal(s.framework, 'angular');
  assert.equal(s.selector, 'app-cart');
  assert.equal(s.label, 'Cart');
  assert.equal(s.thing, model.things.find((t) => t.name === 'CartComponent').id);
  assert.deepEqual(s.inputs.map((i) => [i.name, i.start ?? null]), [['items', 'an empty list'], ['title', '"Your cart"']]);
  assert.deepEqual(s.outputs.map((o) => o.name), ['checkout']);
  assert.deepEqual(s.state.map((x) => [x.name, x.how]), [['coupon', 'field'], ['count', 'signal'], ['total', 'computed']]);
  const says = flat(s.shows);
  assert.ok(says.includes('when items is empty, it shows:') && says.includes('otherwise, it shows:'));
  assert.ok(says.includes('one of these per item in items:'));
  assert.ok(says.includes('a text box: "Coupon code" (showing and changing coupon)'));
  assert.ok(says.includes('a button: "Add one"; when it is pressed: sets count to count plus 1'));
  assert.ok(says.includes('a button: "Checkout" (turned off when items is empty); when it is pressed: sends the checkout event'));
  assert.equal(s.effects[0].when, 'When the screen first shows');
  assert.equal(s.shows[0].line, 7, 'lines are the lines of the .ts file');
});

test('Angular: templateUrl read from its file, *ngIf/*ngFor, a child screen by its selector, signal inputs and outputs, a service', () => {
  const s = screen('TodoListComponent');
  assert.equal(s.template, 'angular/todo-list.component.html');
  assert.deepEqual(s.inputs.map((i) => [i.name, i.kind, !!i.required]), [['todos', 'a list of text', true]]);
  assert.deepEqual(s.outputs.map((o) => o.name), ['done']);
  assert.deepEqual(s.services, ['TodoStore']);
  const says = flat(s.shows);
  assert.ok(says.includes('when todos is not empty, it shows:') && says.includes('when todos is empty, it shows:'));
  assert.ok(says.includes('one of these per todo in todos:'));
  assert.ok(says.includes('a button: "Done"; when it is pressed: runs finish with todo'));
  assert.ok(says.includes('the Cart screen; when it gets "checkout": sets filter to "done"'));
  assert.ok(says.includes('a link: "Settings" (to /settings)'));
  assert.deepEqual(s.uses.map((u) => u.label), ['Cart']);
  // Without its template file, the screen says so instead of guessing.
  const alone = readScreens([load('angular').find((f) => f.path.endsWith('todo-list.component.ts'))]);
  assert.match(alone[0].notRead[0].why, /its template file \(\.\/todo-list\.component\.html\) was not among the files read/);
});

test('what is not understood is listed as not read, never guessed', () => {
  const [s] = readScreens([{ path: 'x.tsx', source: 'export function Panel({ title, ...rest }) {\n  return (\n    <div {...rest}>\n      <h1>{title}</h1>\n      {render(rest)}\n    </div>\n  );\n}\n' }]);
  assert.deepEqual(s.notRead.map((n) => n.why.split(':')[0]), ['the rest of its props are passed on without names', 'spread props', 'an expression in what it shows that Thunder does not read yet']);
  assert.match(screenText(s), /Not read:\n {4}line 1: `\{\.\.\.rest\}`/);
});

test('the reading levels and Thunder Text present screens; the big picture lists them once', () => {
  const bp = readLevel(model, 'big-picture');
  assert.deepEqual(bp.screens.map((x) => x.label).sort(), ['App', 'Cart', 'Cart', 'Signup form', 'Todo list']);
  assert.ok(!bp.loose.some((m) => ['App', 'Cart', 'Signup form'].includes(m.label)), 'a screen is not listed again as a function');
  const s = screen('SignupForm');
  assert.equal(readLevel(model, 'flow', s.id).shows, s.shows);
  assert.equal(readLevel(model, 'details', s.id).events.length, s.events.length);
  assert.equal(modelText(model, s.id), screenText(s));
  assert.equal(findFocus(model, 'signup form').id, s.id);
  assert.equal(conditionWords('!items.length'), 'items is empty');
  assert.equal(conditionWords('todos().length > 0'), 'todos is not empty');
});

test('thunder read --level on a folder and on one Angular file', () => {
  const flow = spawnSync(process.execPath, [CLI, 'read', FIX, '--level', 'flow', '--focus', 'Todo list'], { encoding: 'utf8' });
  assert.equal(flow.status, 0, flow.stderr);
  assert.match(flow.stdout, /^Flow · Todo list {2}\(Angular screen <app-todo-list>, angular\/todo-list\.component\.ts:3\)/);
  assert.match(flow.stdout, /• the Cart screen; when it gets "checkout": sets filter to "done"/);
  const one = spawnSync(process.execPath, [CLI, 'read', join(FIX, 'angular', 'todo-list.component.ts'), '--level', 'flow', '--focus', 'Todo list'], { encoding: 'utf8' });
  assert.match(one.stdout, /• a heading: "Things to do"/, 'the templateUrl file is read with the component');
  const bp = spawnSync(process.execPath, [CLI, 'read', FIX, '--level', 'big-picture'], { encoding: 'utf8' });
  assert.match(bp.stdout, /Screens\n {2}Cart \(Angular <app-cart>\)\n {2}Todo list \(Angular <app-todo-list>\): shows Cart\n {2}App \(React\): shows Cart, Signup form/);
});
