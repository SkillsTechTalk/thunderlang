import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { thunderModel } from '../src/model.mjs';

const SRC = `fastify.post('/api/orgs', async (request, reply) => {
  const { slug } = request.body ?? {};
  if (!slug) return reply.code(400).send({ error: 'slug is required.' });
  return { org: slug };
});`;

test('a one-line if that returns a response with an object keeps the return (not the object inside its braces)', () => {
  const item = readCode(SRC, { language: 'typescript', file: 'orgs.ts' }).items.find((i) => i.name === 'POST /api/orgs');
  const branch = item.steps.find((s) => s.kind === 'branch');
  assert.equal(branch.children.length, 1);
  assert.equal(branch.children[0].kind, 'return');
  assert.match(branch.children[0].code, /^return reply\.code\(400\)/);
});

test('in the flow, that early return ends its path instead of running on into the next step', () => {
  const m = thunderModel([{ path: 'orgs.ts', source: SRC }]);
  const flow = m.members.find((x) => x.route === 'POST /api/orgs').flow;
  const early = flow.nodes.find((n) => n.line === 3 && n.kind !== 'decision');
  assert.ok(early, 'the early return is drawn');
  assert.equal(flow.edges.filter((e) => e.from === early.id).length, 0, 'nothing follows an early return');
});
