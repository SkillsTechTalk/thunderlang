// expect: unguarded (the repository function looks up any tenant's invoice)
import express from 'express';
import { findInvoiceById } from './_repo';
const router = express.Router();
router.get('/e14/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await findInvoiceById(req.params.id);
  res.json({ data: invoice });
});
