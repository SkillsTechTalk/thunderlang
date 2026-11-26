// The Lumen Supply checkout page's logic: send the cart to the orders service, wait a few seconds, and try again
// once if the answer did not come in time. What it shows the customer comes back as a message.

export type CartLine = { sku: string; quantity: number };

export type OrderAnswer = { placed: boolean; message: string; orderId?: string; total?: number; paymentId?: string };

export type CheckoutOptions = {
  ordersUrl: string;
  timeoutMs: number;
  tries: number;
};

/** Place the order. A request that takes longer than timeoutMs is abandoned and sent again, up to `tries` times. */
export async function placeOrder(cart: CartLine[], coupon: string | null, options: CheckoutOptions): Promise<OrderAnswer> {
  if (cart.length === 0) {
    return { placed: false, message: "Your cart is empty" };
  }
  const body = JSON.stringify({ items: cart, coupon });
  for (let attempt = 1; attempt <= options.tries; attempt++) {
    try {
      const response = await fetch(`${options.ordersUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      return (await response.json()) as OrderAnswer;
    } catch (error) {
      const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
      if (!timedOut || attempt === options.tries) {
        return { placed: false, message: "We couldn't reach the store. Please try again." };
      }
    }
  }
  return { placed: false, message: "We couldn't reach the store. Please try again." };
}

/** The words the customer sees after pressing "Place order". */
export function resultMessage(answer: OrderAnswer): string {
  if (!answer.placed) {
    return answer.message;
  }
  return `Thank you! Order ${answer.orderId} is placed: $${(answer.total ?? 0).toFixed(2)} was charged.`;
}
