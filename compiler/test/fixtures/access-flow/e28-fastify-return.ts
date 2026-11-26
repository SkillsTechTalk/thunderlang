// expect: unguarded (Fastify: the handler returns the invoice read by id)
import Fastify from 'fastify';
import { prisma } from './_db';
const fastify = Fastify();
fastify.get('/e28/invoices/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  return invoice;
});
