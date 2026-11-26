// expect: unguarded (Drizzle: only eq(id))
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '../../../../_db';
import { invoices } from '../../../../_schema';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({}, { status: 401 });
  const [row] = await db.select().from(invoices).where(eq(invoices.id, params.id));
  return NextResponse.json(row);
}
