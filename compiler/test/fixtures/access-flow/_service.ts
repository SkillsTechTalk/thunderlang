import { prisma } from './_db';

export class InvoiceService {
  constructor(private db = prisma) {}

  async get(id: string) {
    return this.db.invoice.findUnique({ where: { id } });
  }
}

export const invoiceService = new InvoiceService(prisma);
