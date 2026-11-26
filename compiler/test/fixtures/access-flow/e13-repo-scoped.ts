// expect: guarded (the repository function limits the lookup by the tenant it is given)
import express from 'express';
import { findInvoiceForTenant } from './_repo';
const router = express.Router();
router.get('/e13/invoices/:id', requireAuth, async (req, res) => {
  const user = req.user;
  const invoice = await findInvoiceForTenant(req.params.id, user.tenantId);
  if (!invoice) return res.status(404).json({ error: 'not found' });
  res.json({ invoice });
});
