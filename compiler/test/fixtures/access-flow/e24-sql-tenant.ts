// expect: guarded (raw SQL: WHERE id = $1 AND tenant_id = $2 with the caller's tenant)
import express from 'express';
import { pool } from './_db';
const app = express();
app.get('/e24/invoices/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId]);
  res.json(rows[0]);
});
