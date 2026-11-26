// expect: unguarded (renamed destructuring and a Number() cast still come from the URL)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.put('/e53/invoices/:id', requireAuth, async (request, response) => {
  const { id: invoiceId } = request.params;
  const saved = await prisma.invoice.update({ where: { id: Number(invoiceId) }, data: request.body });
  response.json(saved);
});
