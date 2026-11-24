// A small shop: fees, discounts, and stock, with known paths for proof by running.

export class OutOfStock extends Error {}

export function deliveryFee(distanceKm, isMember) {
  if (isMember) {
    return 0;
  }
  if (distanceKm <= 5) {
    return 2.5;
  } else if (distanceKm <= 20) {
    return 5;
  }
  return 10;
}

export function discount(total, code) {
  if (!code) return total;
  if (code === 'HALF') {
    total = total / 2;
  } else {
    total = total - 1;
  }
  if (total < 0) {
    total = 0;
  }
  return total;
}

export function take(stock, wanted) {
  if (wanted > stock) {
    throw new OutOfStock('not enough left');
  }
  return stock - wanted;
}

export function countBig(values) {
  let count = 0;
  for (const v of values) {
    if (v > 10) {
      count += 1;
    }
  }
  return count;
}

export function remember(items, item) {
  if (items.includes(item)) {
    return;
  }
  items.push(item);
}
