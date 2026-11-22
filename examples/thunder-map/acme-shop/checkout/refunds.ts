// Checkout service: decides whether a refund request can be approved on the spot.
export function approveRefund(amount: number, withinWindow: boolean): string {
  if (amount >= 0 && amount <= 100 && withinWindow) {
    return "Approve";
  }
  return "Review";
}

export async function requestRefund(orderId: string, amount: number, withinWindow: boolean) {
  const decision = approveRefund(amount, withinWindow);
  if (decision === "Approve") {
    await fetch("http://billing/refunds", { method: "POST", body: JSON.stringify({ orderId, amount }) });
  }
  return decision;
}
