// expect: guarded (the check and the response are inside try)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e49/invoices/:id', requireAuth, async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (invoice?.tenantId !== req.user.tenantId) return res.status(404).json({});
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: 'failed' });
  }
});
