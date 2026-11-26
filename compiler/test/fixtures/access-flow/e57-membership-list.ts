// expect: guarded (the caller's list of team ids must include the invoice's team)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e57/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || !req.user.teamIds.includes(invoice.teamId)) return res.sendStatus(404);
  res.json(invoice);
});
