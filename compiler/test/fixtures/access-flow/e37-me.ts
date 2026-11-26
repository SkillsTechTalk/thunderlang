// expect: guarded (the record is the caller's own: id = req.user.id)
import express from 'express';
import { prisma } from './_db';
const router = express.Router();
router.get('/e37/me', requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json(me);
});
