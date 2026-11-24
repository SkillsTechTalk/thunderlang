import { audit, notify } from './services';

// How long a customer has to ask for a refund.
const WINDOW_DAYS = 30;

/** Can this order be refunded? */
export function canRefund(order: Order, daysSince: number): boolean {
  if (order.status !== 'paid' && !order.gift) {
    throw new Error('not paid');
  }
  if (daysSince > 7) {
    // policy: one week for opened items
    return false;
  }
  const total = order.amount * 2;
  audit('refund-check', total);
  return true;
}

export function refundAmount(order: Order, fee: number) {
  let amount = order.amount - fee;
  if (amount < 0) {
    amount = 0;
  }
  notify(order.customer, `Refund of ${amount}`);
  return amount;
}

export function shippingTier(total: number, country: string): string {
  if (country !== 'US') {
    return 'International';
  }
  if (total >= 100) {
    return 'Free';
  }
  return 'Standard';
}
