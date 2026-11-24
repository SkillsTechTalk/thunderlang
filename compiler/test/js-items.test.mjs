// JavaScript / TypeScript functions with no declaration of their own are items: `exports.x = function`, prototype
// methods, methods given to an object, functions inside functions, and anonymous callbacks. Declared functions keep
// the ids they always had.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { thunderModel, readLevel } from '../src/model.mjs';

const fns = (src, language = 'javascript') => readCode(src, { language }).items.filter((i) => i.kind === 'function' || i.kind === 'decision');

const EXPRESS_LIKE = `var app = exports = module.exports = {};

/**
 * Initialize the server.
 */
app.init = function init() {
  this.cache = {};
  this.settings = {};
};

app.use = function use(fn) {
  var fns = [fn];
  fns.forEach(function (fn) {
    router.use(path, fn);
  });
  return this;
};

app.enabled = function(setting) {
  return Boolean(this.set(setting));
};

exports.normalizeType = function(type){
  return ~type.indexOf('/') ? acceptParams(type) : { value: mime.lookup(type), params: {} };
};

module.exports.compileTrust = (val) => {
  if (typeof val === 'function') return val;
  return proxyaddr.compile(val || []);
};

function createApplication() {
  var app = function(req, res, next) {
    app.handle(req, res, next);
  };
  app.init();
  return app;
}

function View(name, options) {
  this.name = name;
  this.root = options.root;
  this.ext = '';
}

View.prototype.lookup = function lookup(name) {
  return resolve(this.root, name);
};

View.prototype.render = function (options, callback) {
  this.engine(this.path, options, callback);
};

promise.then(function (value) {
  console.log(value);
});

/**
 * Example: promise.then(function (x) { return x; });
 */
`;

test('assigned, prototype, inner, and callback functions are items with stable names', () => {
  const items = fns(EXPRESS_LIKE);
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  // Named function expressions keep their own names and ids; what they are assigned to is recorded.
  assert.equal(by['init:6'].assignedTo, 'app.init');
  assert.equal(by['use:11'].assignedTo, 'app.use');
  assert.equal(by['lookup:46'].assignedTo, 'View.prototype.lookup');
  // Anonymous ones are named by what they are assigned to.
  assert.equal(by['enabled:19'].assignedTo, 'app.enabled');
  assert.equal(by['normalizeType:23'].assignedTo, 'exports.normalizeType');
  assert.equal(by['compileTrust:27'].assignedTo, 'module.exports.compileTrust');
  assert.equal(by['render:50'].assignedTo, 'View.prototype.render');
  // A function inside a function: the inner `app` in createApplication.
  assert.ok(by['app:33'], 'the inner app is an item');
  assert.equal(by['app:33'].assignedTo, undefined);
  // Callbacks: `<parent> › callback at line N`, or the call they are passed to at the top of a file.
  assert.equal(by['use › callback at line 13:13'].callback, true);
  assert.equal(by['use › callback at line 13:13'].passedTo, 'fns.forEach');
  assert.equal(by['promise.then › callback at line 54:54'].passedTo, 'promise.then');
  // Code in a comment is not a function.
  assert.ok(!items.some((i) => i.line === 59));
});

test('prototype methods and methods given to an object belong to their Thing; ids do not change', () => {
  const model = thunderModel([{ path: 'lib/app.js', source: EXPRESS_LIKE }]);
  const view = model.things.find((t) => t.name === 'View');
  assert.ok(view, 'View is a Thing');
  assert.deepEqual(view.knows.map((k) => k.label), ['name', 'root', 'ext']);
  const can = view.can.map((id) => model.members.find((m) => m.id === id).name);
  assert.deepEqual(can, ['View', 'lookup', 'render']);
  // `function View()` is how a new View starts.
  const ctor = model.members.find((m) => m.name === 'View');
  assert.equal(ctor.kind, 'setup');
  assert.equal(ctor.id, 'lib/app.js##View#40');
  const lookup = model.members.find((m) => m.name === 'lookup');
  assert.equal(lookup.owner, view.id);
  assert.equal(lookup.id, 'lib/app.js##lookup#46');
  const app = model.things.find((t) => t.name === 'app');
  assert.deepEqual(app.can.map((id) => model.members.find((m) => m.id === id)).filter((m) => !m.callback).map((m) => m.name), ['init', 'use', 'enabled']);
  // A callback written inside one of its methods belongs to it too, as it would inside a class.
  assert.equal(model.members.find((m) => m.name === 'use › callback at line 13').owner, app.id);
  // `exports` is the module, not a Thing.
  assert.ok(!model.things.some((t) => t.name === 'exports'));
  // Callbacks are reached from the step that passes them, not listed on their own in the Big Picture.
  const big = readLevel(model, 'big-picture');
  assert.ok(!big.loose.some((x) => /callback/.test(x.label)));
});

test('arrow callbacks with a block body are items; one-line arrows stay part of their step; tests are not app code', () => {
  const src = `export async function load(ids: string[]): Promise<void> {
  const rows = ids.map((id) => id.trim());
  await Promise.all(rows.map(async (id): Promise<void> => {
    if (!id) return;
    await save(id);
  }));
}
describe('load', () => {
  it('saves', async () => {
    await load(['a']);
    items.forEach((x) => { check(x); });
  });
});
`;
  const items = fns(src, 'typescript');
  assert.deepEqual(items.map((i) => i.id), ['load:1', 'load › callback at line 3:3']);
  assert.equal(items[1].passedTo, 'rows.map');
});
