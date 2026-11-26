// Web routes in TypeScript read as actions even when the handler is wrapped (`handle(async (request) => …)`) or is
// one expression; TypeScript types (`as`, `!`, `: Record<…>`) are set aside when reading a statement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderModel, modelText } from '../src/model.mjs';
import { classifyStatement, withLanguage, stripTsTypes } from '../src/steps.mjs';

const SRC = `import type { FastifyInstance, FastifyRequest } from 'fastify';
export function registerPracticeRoutes(fastify: FastifyInstance, opts: { store?: string } = {}): void {
  const ctxFor = (request: FastifyRequest, projectPath: unknown) => contextForPath(request, needRepo(projectPath), opts.store);

  fastify.get('/api/mastery/practice', handle(async (request) => practiceView(ctxFor(request, (request.query as { projectPath?: string }).projectPath))));

  fastify.post('/api/mastery/practice/challenge', handle(async (request) => {
    const b = (request.body ?? {}) as { projectPath?: string; kind?: string; answer?: unknown };
    return practiceChallenge(ctxFor(request, b.projectPath), b.kind, b.answer);
  }));

  fastify.get('/api/mastery/heatmap', handle(async (request) => {
    const ctx = ctxFor(request, (request.query as { projectPath?: string }).projectPath);
    const repo = ctx.repo!;
    const reviews: Record<string, 'current' | 'changed'> = {};
    return build(repo, reviews);
  }));
}
`;
const model = thunderModel([{ path: 'practice-routes.ts', source: SRC }]);
const text = (pred) => modelText(model, model.members.find(pred).id);

test('a wrapped handler, and a one-expression handler, are each an action', () => {
  assert.deepEqual(model.members.filter((m) => m.route).map((m) => m.route), ['GET /api/mastery/practice', 'POST /api/mastery/practice/challenge', 'GET /api/mastery/heatmap']);
  assert.match(text((m) => m.route === 'GET /api/mastery/practice'), /When someone calls GET \/api\/mastery\/practice\n {2}You get back: the result of practice view\n {2}- Gives back the result of practice view {2}\(line 5\)/);
});

test('the function that registers routes lists them once, without repeating their steps', () => {
  const t = text((m) => m.name === 'registerPracticeRoutes');
  assert.match(t, /- Handles GET \/api\/mastery\/practice \(its steps are in that action\) {2}\(line 5\)/);
  assert.match(t, /- Handles POST \/api\/mastery\/practice\/challenge \(its steps are in that action\) {2}\(line 7\)/);
  assert.doesNotMatch(t, /Calls (get|post) with these steps|code, not explained/);
});

test('TypeScript types are set aside: as-casts, non-null assertions, and declared types', () => {
  const t = text((m) => m.route === 'POST /api/mastery/practice/challenge') + text((m) => m.route === 'GET /api/mastery/heatmap');
  assert.match(t, /Sets b to the request's body, or an empty lookup table when that has no value {2}\(line 8\)/);
  assert.match(t, /Sets repo to the ctx's repo {2}\(line 14\)/);
  assert.match(t, /Sets reviews to an empty lookup table {2}\(line 15\)/);
  assert.equal(stripTsTypes('const ctx = ctxFor(request, (request.query as { projectPath?: string }).projectPath);'), 'const ctx = ctxFor(request, request.query.projectPath);');
  assert.equal(stripTsTypes('say("used as a test");'), 'say("used as a test");');
  assert.equal(stripTsTypes('if (a !== b) return x;'), 'if (a !== b) return x;');
});

test('two loops on one line are read as two loops, never one mixed loop', () => {
  const says = withLanguage('typescript', () => classifyStatement('for (const r of rows) for (const f of r.files) {').says);
  assert.match(says, /^For each r in rows, and in each, for each f in /);
  assert.doesNotMatch(says, /^For each r in files/);
});
