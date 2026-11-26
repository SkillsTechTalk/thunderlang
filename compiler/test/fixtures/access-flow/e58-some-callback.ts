// expect: guarded (one of the caller's teams must match the invoice's team)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e58/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  const ok = req.user.teams.some((t) => t.id === invoice.teamId);
  if (!ok) return res.sendStatus(403);
  res.json(invoice);
});
