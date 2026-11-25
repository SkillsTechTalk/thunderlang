import { consumer } from './queue';

consumer.subscribe('order.placed', async (order) => {
  await chargeCard(order);
});

async function chargeCard(order: { total: number }) {
  console.log('charging', order.total);
}
