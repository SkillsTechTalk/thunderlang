// expect: guarded (Mongoose: findOne by id and owner)
import express from 'express';
import { Invoice } from './_models';
const router = express.Router();
router.get('/e31/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, owner: req.user.id });
  if (!invoice) return res.status(404).json({});
  res.json(invoice);
});
