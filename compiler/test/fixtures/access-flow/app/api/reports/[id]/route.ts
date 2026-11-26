// expect: guarded (Drizzle: and(eq(id), eq(tenantId, the caller's tenant)))
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '../../../../_db';
import { invoices } from '../../../../_schema';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const rows = await db.select().from(invoices).where(and(eq(invoices.id, params.id), eq(invoices.tenantId, session.user.tenantId)));
  return NextResponse.json(rows[0] ?? null);
}
