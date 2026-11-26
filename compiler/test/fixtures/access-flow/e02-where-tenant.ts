// expect: guarded (the where clause adds the caller's tenant)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e02/invoices/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: req.user.tenantId } });
  if (!invoice) return res.status(404).json({ error: 'not found' });
  res.json(invoice);
});
