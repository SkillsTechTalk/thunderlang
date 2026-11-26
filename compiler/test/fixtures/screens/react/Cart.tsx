import { useState, useEffect } from 'react';

interface CartItem { id: string; name: string; price: number }

interface CartProps {
  items: CartItem[];
  onCheckout: () => void;
  title?: string;
}

/** The shopping cart: what you are buying, and a coupon. */
export function Cart({ items, onCheckout, title = 'Your cart' }: CartProps) {
  const [coupon, setCoupon] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    saveDraft(coupon);
  }, [coupon]);

  if (!items.length) return <p>Your cart is empty</p>;

  return (
    <section>
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}: {item.price}</li>
        ))}
      </ul>
      {open && <p>Coupons give 10% off</p>}
      <input placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
      <button onClick={() => setOpen(!open)}>Help</button>
      <button disabled={coupon.length > 10} onClick={onCheckout}>Checkout</button>
    </section>
  );
}

function saveDraft(code: string) {
  localStorage.setItem('coupon', code);
}
