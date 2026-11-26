// expect: guarded (Hono: the caller's tenant is in the where)
import { Hono } from 'hono';
import { prisma } from './_db';
const app = new Hono();
app.get('/e26/invoices/:id', async (c) => {
  const user = c.get('user');
  const invoice = await prisma.invoice.findFirst({ where: { id: c.req.param('id'), tenantId: user.tenantId } });
  if (!invoice) return c.json({ error: 'not found' }, 404);
  return c.json(invoice);
});
