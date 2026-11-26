import { test } from "node:test";
import assert from "node:assert/strict";
import { shippingNote } from "./shipping.ts";

test("a $55 cart ships free", () => {
  assert.equal(shippingNote(55), "Free shipping");
});

test("a small cart pays for shipping", () => {
  assert.equal(shippingNote(24), "Shipping: $5.99");
});
