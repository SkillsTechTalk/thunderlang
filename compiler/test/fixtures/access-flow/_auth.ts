export class ForbiddenError extends Error {}

export function assertSameTenant(record: { tenantId: string }, user: { tenantId: string }) {
  if (record.tenantId !== user.tenantId) throw new ForbiddenError('not yours');
}

export function canView(user: { id: string }, invoice: { ownerId: string }): boolean {
  return invoice.ownerId === user.id;
}
