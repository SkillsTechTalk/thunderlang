// expect: guarded (this project's middleware loads the invoice for the caller's tenant before the handler)
import express from 'express';
import { loadOwnInvoice } from './_middleware';
const router = express.Router();
router.get('/e18/invoices/:id', requireAuth, loadOwnInvoice, async (req, res) => {
  res.json(req.invoice);
});
