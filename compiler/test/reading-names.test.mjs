// Reading fixes reported from OpenThunder: a function's name, sentences that end on a preposition, and "a" or "an".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderModel, modelText, withArticle } from '../src/model.mjs';
import { readCode } from '../src/read.mjs';

const SRC = `interface AgentCheckResult { ok: boolean }
export function prCheck(opts: { pr?: string; base: string }, ghRepo: string, head: string, result: AgentCheckResult): AgentCheckResult {
  let changeApproval: { state: string } | undefined;
  const approve = (x: AgentCheckResult): AgentCheckResult => {
    changeApproval = changeApprovalFor(x, { repo: ghRepo, number: opts.pr ? Number(opts.pr) : undefined, head }, opts.base);
    return applyChangeApproval(x, changeApproval?.state, { pr: true, head, base: opts.base });
  };
  return approve(result);
}
`;

test('a typed variable declared above a helper does not lend the helper its name', () => {
  assert.deepEqual(readCode(SRC, { language: 'typescript' }).items.map((i) => [i.name, i.line]), [['prCheck', 2], ['approve', 4]]);
});

test('a call named after a preposition names its first argument, never ends on "for "', () => {
  const m = thunderModel([{ path: 'pr-check.ts', source: SRC }]);
  const text = modelText(m, m.members.find((x) => x.name === 'approve').id);
  assert.match(text, /^Approve\n/);
  assert.match(text, /- Works out change approval from change approval for x {2}\(line 5\)/);
  assert.doesNotMatch(text, / for {2}\(| for $/m);
  // An argument that is not a plain name: the preposition is dropped instead.
  const m2 = thunderModel([{ path: 'a.ts', source: 'export function f(o: any) {\n  const r = totalFor({ a: o.a });\n  return r;\n}\n' }]);
  assert.match(modelText(m2, m2.members[0].id), /from total(?! for)/);
});

test('"an" before a vowel sound, "a" before a consonant sound', () => {
  assert.deepEqual(['AgentCheckResult', 'Order', 'Item', 'HTTPClient', 'SQLRow', 'User', 'UserId', 'Unicode', 'Euro', 'URL', 'Book'].map(withArticle),
    ['an AgentCheckResult', 'an Order', 'an Item', 'an HTTPClient', 'an SQLRow', 'a User', 'a UserId', 'a Unicode', 'a Euro', 'a URL', 'a Book']);
  const m = thunderModel([{ path: 'pr-check.ts', source: SRC }]);
  assert.match(modelText(m, m.members.find((x) => x.name === 'approve').id), /You get back: an AgentCheckResult/);
});
