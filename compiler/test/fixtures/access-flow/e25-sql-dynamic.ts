// expect: cannot tell (the SQL is built at run time)
import express from 'express';
import { pool } from './_db';
const app = express();
app.get('/e25/invoices/:id', requireAuth, async (req, res) => {
  const query = buildInvoiceQuery(req.params.id, req.user);
  const { rows } = await pool.query(query);
  res.json(rows[0]);
});
