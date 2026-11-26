// expect: unguarded (raw SQL: WHERE id = $1 only)
import express from 'express';
import { pool } from './_db';
const app = express();
app.get('/e23/invoices/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});
