// expect: guarded (answers only inside the branch where the tenants match)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e59/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (invoice?.tenantId === req.user.tenantId) {
    return res.json(invoice);
  }
  return res.status(404).json({ error: 'not found' });
});
