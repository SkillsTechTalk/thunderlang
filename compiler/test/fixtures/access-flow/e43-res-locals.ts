// expect: guarded (identity from res.locals.user, set by earlier middleware)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e43/invoices/:id', async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, organizationId: res.locals.user.organizationId } });
  res.json(invoice);
});
