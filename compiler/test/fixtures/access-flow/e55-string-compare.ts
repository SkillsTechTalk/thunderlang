// expect: guarded (String(…) on both sides of the owner comparison)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e55/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.sendStatus(404);
  if (String(invoice.tenantId) !== String(req.user.tenantId)) return res.sendStatus(404);
  res.json(invoice);
});
