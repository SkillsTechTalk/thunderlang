// Notifications service: tells the customer their refund was issued.
export async function onRefundIssued(event: { orderId: string; email: string; amount: number }) {
  if (!event.email) {
    throw new Error("missing email");
  }
  await sendEmail(event.email, `Your refund of $${event.amount} is on its way.`);
}
