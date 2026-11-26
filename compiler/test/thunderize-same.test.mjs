// Thunderize (a whole app in Thunder Text) and thunder same (does converted code mean the same?).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderizeFiles } from '../src/thunderize.mjs';
import { sameMeaning, renderSame } from '../src/same.mjs';
import * as core from '../src/core.mjs';

const PY = `def delivery_fee(total: float, distance_km: float) -> str:
    """Nearby orders of $20 or more are delivered free."""
    if total >= 20 and distance_km <= 5:
        return "Free"
    if distance_km > 15:
        return "TooFar"
    return "Standard"


def order_total(order):
    total = 0
    for item in order.items:
        total += item.price
    if order.has_coupon:
        total -= 5
    return total
`;
const TS = `export function deliveryFee(total: number, distanceKm: number): string {
  if (distanceKm <= 5 && total >= 20) return "Free";
  if (distanceKm > 15) return "TooFar";
  return "Standard";
}

export function orderTotal(order: Order): number {
  let total = 0;
  for (const item of order.items) {
    total += item.price;
  }
  if (order.hasCoupon) {
    total -= 5;
  }
  return total;
}
`;
const API = `@router.post("/orders")
def place_order(order):
    """A customer orders pizza."""
    if not order.items:
        raise EmptyOrder("Add at least one pizza")
    return save(order)


def oven(dough):
    return (dough.thickness * 17 + 220) % 300
`;

test('thunderize: every file gets Thunder Text and the index reads the app top-down', () => {
  const app = thunderizeFiles([
    { path: 'app/delivery.py', source: PY },
    { path: 'app/api.py', source: API },
    { path: 'README.md', source: '# hi' },
    { path: 'app/big.py', source: '', size: 900000 },
  ], { name: 'pizza' });
  assert.equal(app.schema, 'thunderize-v1');
  assert.deepEqual(app.files.map((f) => f.out), ['app/api.py.thunder-text', 'app/delivery.py.thunder-text']);
  assert.deepEqual(app.counts, { files: 2, actions: 1, rules: 1, functions: 1, notReadYet: 1 });
  assert.match(app.index, /^App pizza\n/);
  assert.match(app.index, /Area app\n  File app\/api\.py: 1 action, 1 not read yet\.\n    When someone calls POST \/orders/);
  assert.match(app.index, /Rule: How is delivery fee decided\?/);
  assert.match(app.index, /Not read\n  README\.md: not a language Thunder reads yet\n  app\/big\.py: too large to read/);
  const api = app.files.find((f) => f.path === 'app/api.py').text;
  assert.match(api, /^File app\/api\.py \(Python\)\n/);
  assert.match(api, /Author's note: "A customer orders pizza\."/);
  assert.match(api, /# line 9 · not read yet/);
  assert.match(api, /Can fail with: EmptyOrder\n$/);
});

test('same: a faithful Python-to-TypeScript conversion means the same, even with conditions reordered', () => {
  const r = sameMeaning([{ path: 'app/delivery.py', source: PY }], [{ path: 'app/delivery.ts', source: TS }]);
  assert.equal(r.verdict, 'same');
  assert.equal(r.counts.same, 2);
  assert.match(r.items.find((i) => i.name === 'delivery_fee').reason, /^Same answer on all \d+ edge cases\.$/);
});

test('same: a changed limit is caught with a concrete counterexample in readable words', () => {
  const r = sameMeaning([{ path: 'a.py', source: PY }], [{ path: 'a.ts', source: TS.replace('total >= 20', 'total > 20') }]);
  assert.equal(r.verdict, 'different');
  const d = r.items.find((i) => i.name === 'delivery_fee');
  assert.equal(d.status, 'different');
  assert.deepEqual([d.counterexample.old, d.counterexample.new], ['Free', 'Standard']);
  assert.match(d.reason, /the total 20/);
  assert.match(renderSame(r), /^Different meaning\./);
});

test('same: a changed step, a missing function, a new function, and a changed address are all reported', () => {
  const r = sameMeaning(
    [{ path: 'a.py', source: PY }, { path: 'api.py', source: API }],
    [{ path: 'a.ts', source: TS.replace('total -= 5;', 'total -= 10;').replace(/export function deliveryFee[\s\S]*?\n}\n/, 'export function tip(x: number) { return x; }\n') },
     { path: 'api.py', source: API.replace('/orders', '/order') }],
  );
  const by = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.equal(by.order_total.status, 'different');
  assert.match(by.order_total.reason, /Subtracts 5 from total.*Subtracts 10 from total/);
  assert.equal(by.delivery_fee.status, 'only-old');
  assert.equal(by.tip.status, 'only-new');
  assert.equal(by.place_order.status, 'different');
  assert.match(by.place_order.reason, /POST \/orders became POST \/order/);
});

test('same: code Thunder cannot read is never counted as the same', () => {
  const r = sameMeaning([{ path: 'api.py', source: API }], [{ path: 'api.py', source: API }]);
  assert.equal(r.verdict, 'partly-checked');
  assert.equal(r.items.find((i) => i.name === 'oven').status, 'cannot-check');
});

test('same: repeated names (one __init__ per class) and renamed files still pair correctly', () => {
  const cls = (n) => `class A:\n    def __init__(self):\n        self.n = ${n}\n\nclass B:\n    def __init__(self):\n        self.m = 2\n`;
  const r = sameMeaning([{ path: 'm.py', source: cls(1) }], [{ path: 'm.py', source: cls(3) }]);
  assert.deepEqual(r.items.map((i) => i.status), ['different', 'same']);
  const renamed = sameMeaning([{ path: 'app/delivery.py', source: PY }], [{ path: 'fees.ts', source: TS }]);
  assert.equal(renamed.verdict, 'same', 'unique names pair across a renamed file');
});

test('both are exported from /core (browser-safe)', () => {
  assert.equal(typeof core.thunderizeFiles, 'function');
  assert.equal(typeof core.sameMeaning, 'function');
  assert.equal(core.SAME_SCHEMA, 'thunder-same-v1');
});

test('same: matching words are not proof; different code under the same words is never called "same"', () => {
  const py = (op) => [{ path: 'm.py', source: `def f(a, b):\n    x = a ${op} b\n    save(x)\n    return x\n` }];
  // (Steps still shown as code: the code is compared, never the words.)
  const r = sameMeaning(py('+'), py('&'));
  assert.notEqual(r.verdict, 'same');
  assert.equal(r.items[0].status, 'cannot-check');
  assert.match(r.items[0].reason, /`x = a \+ b` before, `x = a & b` after/);
  // (Steps said in words, "a minus b" and "a times b": told apart by their words.)
  assert.equal(sameMeaning(py('-'), py('*')).items[0].status, 'different');
  const g = (field) => [{ path: 'g.py', source: `def g(o):\n    total = compute(o.${field})\n    return total\n` }];
  assert.notEqual(sameMeaning(g('items'), g('lines')).verdict, 'same');
  // A real conversion across languages and naming conventions is still proven the same.
  assert.equal(sameMeaning([{ path: 'g.py', source: 'def g(order_items):\n    total = compute(order_items)\n    return total\n' }], [{ path: 'g.ts', source: 'function g(orderItems) {\n  const total = compute(orderItems);\n  return total;\n}\n' }]).verdict, 'same');
});
