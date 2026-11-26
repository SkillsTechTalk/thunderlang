// expect: unguarded (the check compares the status, not the owner)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e05/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice || invoice.status !== 'open') return res.status(404).end();
  res.json(invoice);
});
