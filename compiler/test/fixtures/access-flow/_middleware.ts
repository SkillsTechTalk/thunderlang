import { prisma } from './_db';

/** Loads the invoice for the caller's tenant, or answers 404. */
export async function loadOwnInvoice(req: any, res: any, next: any) {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
  if (!invoice) return res.status(404).json({ error: 'not found' });
  req.invoice = invoice;
  next();
}
