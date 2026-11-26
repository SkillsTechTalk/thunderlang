// expect: guarded (read by id, then a comparison with the caller stops the path before the response)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e03/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.tenantId !== req.user.tenantId) {
    return res.status(404).json({ error: 'not found' });
  }
  return res.json(invoice);
});
