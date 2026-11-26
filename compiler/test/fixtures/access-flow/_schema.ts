import { pgTable, text } from 'drizzle-orm/pg-core';

export const invoices = pgTable('invoices', { id: text('id'), tenantId: text('tenant_id'), total: text('total') });
