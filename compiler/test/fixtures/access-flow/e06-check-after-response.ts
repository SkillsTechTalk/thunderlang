// expect: unguarded (the comparison comes after the invoice was already sent)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e06/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  res.json(invoice);
  if (invoice && invoice.tenantId !== req.user.tenantId) {
    console.warn('cross-tenant read');
  }
});
