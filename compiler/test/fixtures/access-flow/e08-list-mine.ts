// expect: guarded (the list is chosen by the caller, not by the request)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e08/my/invoices', requireAuth, async (req, res) => {
  const invoices = await prisma.invoice.findMany({ where: { userId: req.user.id }, take: Number(req.query.limit ?? 20) });
  res.json(invoices);
});
