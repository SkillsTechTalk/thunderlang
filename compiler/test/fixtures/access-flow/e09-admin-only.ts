// expect: cannot tell (only admins reach it; whether admins may see every tenant is a policy)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e09/admin/invoices/:id', requireAuth, requireAdmin, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  res.json(invoice);
});
