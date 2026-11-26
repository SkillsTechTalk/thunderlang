// expect: unguarded (Next.js: signed in, but the invoice is read by the URL's id only)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '../../../../_db';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  const invoice = await prisma.invoice.findUnique({ where: { id: params.id } });
  return NextResponse.json(invoice);
}

// expect DELETE: guarded (Next.js: the delete is limited to the caller's tenant)
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  const { id } = await context.params;
  await prisma.invoice.deleteMany({ where: { id, tenantId: session.user.tenantId } });
  return new Response(null, { status: 204 });
}
