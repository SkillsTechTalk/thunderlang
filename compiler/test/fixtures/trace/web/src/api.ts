const API = process.env.ORDERS_URL;

export async function placeOrder(total: number) {
  const res = await fetch(`${API}/api/orders`, { method: 'POST', body: JSON.stringify({ total }) });
  return res.json();
}

export async function loadOrder(id: string) {
  const res = await fetch(`${API}/api/orders/${id}`);
  return res.json();
}

export async function ping() {
  return fetch(`${API}/health`);
}
