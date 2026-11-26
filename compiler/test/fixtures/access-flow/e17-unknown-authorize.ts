// expect: cannot tell (authorize comes from a package; it may well check ownership)
import express from 'express';
import { prisma } from './_db';
import { authorize } from '@acme/policy';
const router = express.Router();
router.get('/e17/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  authorize(req.user, 'read', invoice);
  res.json(invoice);
});
