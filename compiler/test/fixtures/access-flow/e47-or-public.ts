// expect: cannot tell (the where allows the caller's invoices OR public ones; whether public is meant to be open is a policy)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e47/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, OR: [{ tenantId: req.user.tenantId }, { public: true }] } });
  res.json(invoice);
});
