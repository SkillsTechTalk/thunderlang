// expect: unguarded (the invoice is read by the id in the URL and sent back; nothing limits it to the caller)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e01/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  res.json(invoice);
});
