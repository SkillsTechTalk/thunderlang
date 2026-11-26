// expect: unguarded (Knex: where('id', id) only)
import express from 'express';
import { knex } from './_db';
const router = express.Router();
router.get('/e36/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await knex('invoices').where('id', req.params.id).first();
  res.json(invoice);
});
