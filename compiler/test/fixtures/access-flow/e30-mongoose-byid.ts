// expect: unguarded (Mongoose: findById with the URL's id)
import express from 'express';
import { Invoice } from './_models';
const router = express.Router();
router.get('/e30/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).lean();
  res.json(invoice);
});
