// expect: cannot tell (checkAccess is not in these files)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e44/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  await checkAccess(invoice);
  res.json(invoice);
});
