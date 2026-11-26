// expect: guarded (identity from getUser(req); a mismatch throws)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e42/invoices/:id', async (req, res) => {
  const user = await getUser(req);
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (invoice.userId !== user.id) throw new HttpError(403, 'forbidden');
  res.json(invoice);
});
