// expect: unguarded (the project's InvoiceService.get looks up any invoice by id)
import express from 'express';
import { invoiceService } from './_service';
const router = express.Router();
router.get('/e38/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await invoiceService.get(req.params.id);
  res.json(invoice);
});
