// expect: cannot tell (the invoice comes from a package Thunder cannot see into)
import express from 'express';
import { billing } from '@acme/billing';
const router = express.Router();
router.get('/e11/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await billing.getInvoice(req.params.id);
  res.json(invoice);
});
