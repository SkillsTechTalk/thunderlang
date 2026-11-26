// expect: guarded (canView, in this project, compares the owner with the caller)
import express from 'express';
import { prisma } from './_db';
import { canView } from './_auth';
const router = express.Router();
router.get('/e34/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || !canView(req.user, invoice)) return res.status(404).json({ error: 'not found' });
  res.json(invoice);
});
