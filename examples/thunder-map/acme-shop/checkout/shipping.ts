// Checkout service: shipping price rules.
export function shippingOption(total: number, member: boolean): string {
  if (member) {
    return "Free";
  }
  if (total >= 50) {
    return "Free";
  }
  return "Standard";
}
