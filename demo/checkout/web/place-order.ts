// One customer presses "Place order" once. The store is slow, so the page gives up after a second and tries again.
import { placeOrder, resultMessage } from "./checkout.ts";

const ordersUrl = process.argv[2] ?? "http://127.0.0.1:8102";
const answer = await placeOrder([{ sku: "lamp", quantity: 2 }, { sku: "bulb", quantity: 2 }], "SAVE10", { ordersUrl, timeoutMs: 1000, tries: 2 });
console.log(resultMessage(answer));
