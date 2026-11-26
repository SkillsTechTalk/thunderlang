// expect: guarded (a guard function in the same file)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
function mustOwn(invoice, user) {
  if (!invoice || invoice.ownerId !== user.id) {
    const err = new Error('not found');
    throw err;
  }
}
router.get('/e56/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  mustOwn(invoice, req.user);
  res.json(invoice);
});
