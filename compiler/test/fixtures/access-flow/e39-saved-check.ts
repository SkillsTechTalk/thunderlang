// expect: guarded (the comparison is kept in a name and checked before answering)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e39/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  const allowed = invoice?.ownerId === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'forbidden' });
  res.json(invoice);
});
