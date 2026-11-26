// expect: cannot tell (loadInvoiceAccess runs first and is not in these files)
import express from 'express';
import { prisma } from './_db';
import { loadInvoiceAccess } from '@acme/access';
const router = express.Router();
router.get('/e10/invoices/:id', requireAuth, loadInvoiceAccess, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  res.json(invoice);
});
