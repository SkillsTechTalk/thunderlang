// expect: unguarded (the check runs only when ?expand is given)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e07/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (req.query.expand) {
    if (invoice.tenantId !== req.user.tenantId) return res.status(403).end();
  }
  res.json(invoice);
});
