// expect: guarded (a lookup limited to the tenant, a 404 when missing, then an update by the same id)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.patch('/e04/invoices/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.invoice.findFirst({ where: { id, tenantId: req.user.tenantId } });
  if (!existing) return res.sendStatus(404);
  const updated = await prisma.invoice.update({ where: { id }, data: { note: req.body.note } });
  res.json(updated);
});
