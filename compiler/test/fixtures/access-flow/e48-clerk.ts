// expect: guarded (Clerk-style auth(): the where uses the caller's userId)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e48/invoices/:id', async (req, res) => {
  const { userId } = auth();
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, userId } });
  res.json(invoice);
});
