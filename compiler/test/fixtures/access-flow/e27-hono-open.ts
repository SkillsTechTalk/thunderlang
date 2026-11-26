// expect: unguarded (Hono: read by id only)
import { Hono } from 'hono';
import { prisma } from './_db';
const app = new Hono();
app.get('/e27/invoices/:id', async (c) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: c.req.param('id') } });
  return c.json(invoice);
});
