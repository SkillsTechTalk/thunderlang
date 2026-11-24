// The shop's own tests, as plain calls (run by proof by running with the recorder loaded).
import assert from 'node:assert/strict';
import { deliveryFee, discount, take, OutOfStock, countBig, remember } from '../shop.mjs';

assert.equal(deliveryFee(3, true), 0);
assert.equal(deliveryFee(3, false), 2.5);
assert.equal(deliveryFee(12, false), 5);
assert.equal(deliveryFee(30, false), 10);
assert.equal(discount(10, ''), 10);
assert.equal(discount(10, 'HALF'), 5);
assert.equal(discount(0.5, 'OTHER'), 0);
assert.equal(take(5, 2), 3);
assert.throws(() => take(1, 2), OutOfStock);
assert.equal(countBig([1, 20, 30]), 2);
const items = ['a'];
remember(items, 'a');
remember(items, 'b');
assert.deepEqual(items, ['a', 'b']);
