// expect: unguarded (a check on the caller's role alone does not limit whose invoice it is)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e60/invoices/:id', requireAuth, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  res.json({ invoice, viewer: req.user.email });
});
