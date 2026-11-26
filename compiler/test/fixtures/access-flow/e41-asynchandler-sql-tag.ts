// expect: guarded (postgres.js sql`…` with the caller's tenant, inside asyncHandler)
import express from 'express';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
const router = express.Router();
router.get('/e41/invoices/:id', requireAuth, asyncHandler(async (req, res) => {
  const [invoice] = await sql`SELECT * FROM invoices WHERE id = ${req.params.id} AND tenant_id = ${req.user.tenantId}`;
  res.json(invoice);
}));
