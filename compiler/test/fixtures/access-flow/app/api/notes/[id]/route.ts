// expect: cannot tell (the database client is made for the caller; Thunder cannot see whether it filters)
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTenantDb } from '@acme/tenancy';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const tdb = getTenantDb(session.user);
  const note = await tdb.note.findUnique({ where: { id: params.id } });
  return NextResponse.json(note);
}
