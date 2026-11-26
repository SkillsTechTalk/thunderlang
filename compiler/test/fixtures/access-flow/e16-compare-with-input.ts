// expect: unguarded (the comparison is with a tenant the request names, not the caller's)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e16/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (invoice.tenantId !== req.query.tenantId) return res.status(404).end();
  res.json(invoice);
});
