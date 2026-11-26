// expect: unguarded (deletes by the id in the URL, with no check)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.delete('/e15/invoices/:id', requireAuth, async (req, res) => {
  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.sendStatus(204);
});
