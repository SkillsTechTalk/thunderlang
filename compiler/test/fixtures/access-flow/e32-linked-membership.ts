// expect: guarded (the invoice's project must be one the caller belongs to, or the route stops)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e32/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.sendStatus(404);
  const project = await prisma.project.findFirst({ where: { id: invoice.projectId, members: { some: { userId: req.user.id } } } });
  if (!project) return res.sendStatus(404);
  res.json(invoice);
});
