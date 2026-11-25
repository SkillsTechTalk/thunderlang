// Found by OpenThunder using thunderWrite in "Change in Thunder" (1.0.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderWrite } from '../src/write-steps.mjs';
import { thunderModel } from '../src/model.mjs';

const src = 'import type { FastifyInstance } from "fastify";\nexport async function registerRoutes(app: FastifyInstance) {\n  app.post(\'/api/auth/register\', async (req, reply) => {\n    const { password } = req.body as any;\n    if (password.length < 6) { reply.status(400); return { error: "short" }; }\n    return { ok: true };\n  });\n}\n';
const files = [{ path: 'auth.ts', source: src }];

test("an inline route handler's own model id resolves (the id has no space after the method)", () => {
  const id = thunderModel(files).members.find((m) => /POST\/api\/auth\/register/.test(m.id)).id;
  const r = thunderWrite(files, [{ op: 'setValue', member: id, step: 'line:5', from: 6, to: 8 }]);
  assert.equal(r.status, 'written', r.reason);
  assert.match(r.patch, /password\.length < 8/);
});

test('says names only the changed step, once, even when the line holds several steps', () => {
  const r = thunderWrite(files, [{ op: 'setValue', member: { file: 'auth.ts', name: 'POST /api/auth/register', line: 3 }, step: 'line:5', from: 6, to: 8 }]);
  assert.equal(r.status, 'written', r.reason);
  const reads = r.says.match(/it now reads (.*?); nothing else/)[1];
  assert.equal(reads.split('", "').length, 1, r.says);
  assert.doesNotMatch(r.says, /response status|Returns/);
});
