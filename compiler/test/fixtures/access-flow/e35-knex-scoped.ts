// expect: guarded (Knex: where({ id, tenant_id: the caller's tenant }))
import express from 'express';
import { knex } from './_db';
const router = express.Router();
router.get('/e35/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await knex('invoices').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  res.json(invoice);
});
