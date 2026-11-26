// What the cart page says about shipping, under the total. The orders service charges shipping by the same rule
// (orders/Shipping.cs), and billing prints it on the receipt (billing/receipt.py): three copies of one rule.

/** The line under the cart total. */
export function shippingNote(subtotal: number): string {
  if (subtotal >= 50) {
    return "Free shipping";
  }
  return "Shipping: $5.99";
}
