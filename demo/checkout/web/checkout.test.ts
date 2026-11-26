import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { placeOrder, resultMessage } from "./checkout.ts";

type Sent = { body: string };

/** A pretend orders service: the first answer arrives after `slowMs`, later ones at once. */
function slowFirstAnswer(slowMs: number, sent: Sent[]): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    sent.push({ body: String(init.body) });
    const delay = sent.length === 1 ? slowMs : 0;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(init.signal!.reason);
      });
    });
    return new Response(JSON.stringify({ placed: true, message: "Order placed", orderId: `ord-${sent.length}`, total: 53.46 }));
  }) as typeof fetch;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const cart = [{ sku: "lamp", quantity: 2 }, { sku: "bulb", quantity: 2 }];

test("an empty cart is not sent", async () => {
  const sent: Sent[] = [];
  globalThis.fetch = slowFirstAnswer(0, sent);
  const answer = await placeOrder([], null, { ordersUrl: "http://x", timeoutMs: 50, tries: 2 });
  assert.equal(answer.placed, false);
  assert.equal(sent.length, 0);
});

test("a slow answer is abandoned and the order is sent again", async () => {
  const sent: Sent[] = [];
  globalThis.fetch = slowFirstAnswer(500, sent);
  const answer = await placeOrder(cart, "SAVE10", { ordersUrl: "http://x", timeoutMs: 50, tries: 2 });
  assert.equal(answer.placed, true);
  assert.equal(sent.length, 2);
  assert.match(resultMessage(answer), /Order ord-2 is placed: \$53\.46/);
});

test("a retry says it is the same order as the first try", { todo: "known bug: a retry looks like a brand-new order" }, async () => {
  const sent: Sent[] = [];
  globalThis.fetch = slowFirstAnswer(500, sent);
  await placeOrder(cart, null, { ordersUrl: "http://x", timeoutMs: 50, tries: 2 });
  const keys = sent.map((s) => JSON.parse(s.body).idempotencyKey);
  assert.ok(keys[0], "the first try carries a key");
  assert.equal(keys[1], keys[0]);
});
