// expect: guarded (Fastify: compares the owner with request.user before answering)
import Fastify from 'fastify';
import { prisma } from './_db';
const fastify = Fastify();
fastify.get('/e29/invoices/:id', async (request, reply) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: (request.params as any).id } });
  if (!invoice || invoice.ownerId !== request.user.id) return reply.code(404).send({ error: 'not found' });
  return reply.send(invoice);
});
