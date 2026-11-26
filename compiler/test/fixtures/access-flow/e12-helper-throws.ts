// expect: guarded (assertSameTenant, in this project, throws unless the tenants match)
import express from 'express';
import { prisma } from './_db';
import { assertSameTenant } from './_auth';
const router = express.Router();
router.get('/e12/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  assertSameTenant(invoice, req.user);
  res.json(invoice);
});
