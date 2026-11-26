// expect: unguarded (inside a transaction, the update is by id only)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.post('/e40/invoices/:id/pay', requireAuth, async (req, res) => {
  const paid = await prisma.$transaction(async (tx) => {
    return tx.invoice.update({ where: { id: req.params.id }, data: { paid: true } });
  });
  res.json(paid);
});
