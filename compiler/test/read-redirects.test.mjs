// A redirect says where the person goes, in every framework, and every view marks it as a redirect (↪).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatement } from '../src/steps.mjs';
import { thunderModel, readLevel } from '../src/model.mjs';
import { THUNDER_VISUAL } from '../src/visual.mjs';

test('redirects in each framework say where the person goes', () => {
  const cases = [
    ['return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);', 'the google auth URL'],
    ["res.redirect('/login');", '/login'],
    ["return res.redirect(302, '/home');", '/home'],
    ["return NextResponse.redirect(new URL('/signin', req.url));", '/signin'],
    ["return redirect(url_for('index'))", 'the index page'],
    ["return HttpResponseRedirect(reverse('accounts:login'))", 'the login page'],
    ['return RedirectResponse(url=next_url, status_code=303)', 'the next URL'],
    ["return redirect()->route('dashboard');", 'the dashboard page'],
  ];
  for (const [code, to] of cases) assert.equal(classifyStatement(code).says, `Sends the person to ${to}`, code);
  assert.equal(THUNDER_VISUAL.does.redirect.mark, '↪');
});

test('Details: an action that redirects gives back where the person goes, marked as a redirect', () => {
  const src = "fastify.get('/api/auth/google/start', async (_req, reply) => {\n  const params = new URLSearchParams({ a: '1' });\n  return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);\n});";
  const m = thunderModel([{ path: 'auth.ts', source: src }]);
  const d = readLevel(m, 'details', m.members[0].id);
  assert.deepEqual(d.givesBack.map((g) => g.text), ['Sends the person to the google auth URL']);
  assert.equal(d.steps.at(-1).does, 'redirect');
});
