import { prisma } from './_db';

/** Limited to the caller's tenant. */
export async function findInvoiceForTenant(id: string, tenantId: string) {
  return prisma.invoice.findFirst({ where: { id, tenantId } });
}

/** Not limited: any tenant's invoice. */
export async function findInvoiceById(id: string) {
  return prisma.invoice.findUnique({ where: { id } });
}
