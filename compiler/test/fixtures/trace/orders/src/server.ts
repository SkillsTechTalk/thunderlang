import express from 'express';
import { bus } from './bus';

const app = express();

app.post('/api/orders', async (req, res) => {
  const order = { id: Date.now(), total: req.body.total };
  bus.publish('order.placed', order);
  res.json(order);
});

app.get('/api/orders/:id', async (req, res) => {
  res.json({ id: req.params.id });
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(3000);
