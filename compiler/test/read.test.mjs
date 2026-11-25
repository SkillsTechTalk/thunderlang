import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { compileHumanContract } from '../src/human-contract.mjs';
import { translateDecisions, TRANSLATE_LANGUAGES } from '../src/translate.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { readCode, searchReading, detectLanguage, toThunderCondition, toThunderOutcome, sayCondition } from '../src/read.mjs';

const TRIAGE = `contract SupportTriage
purpose Route each ticket to the right queue.

decision Priority(plan: string, outage: boolean, waitHours: number)
  when outage -> Urgent
  when plan == "enterprise" or waitHours > 24 -> High
  when not outage and waitHours >= 0 -> Normal
  otherwise -> Review

examples Priority
  case "outage": (plan: "free", outage: true, waitHours: 1) -> Urgent
`;
const CASES = [
  { plan: 'free', outage: true, waitHours: 1 },
  { plan: 'enterprise', outage: false, waitHours: 2 },
  { plan: 'free', outage: false, waitHours: 30 },
  { plan: 'free', outage: false, waitHours: 3 },
  { plan: 'free', outage: false, waitHours: -1 },
];
const original = parseIntent(compileHumanContract(TRIAGE));
const decide = (ast, inputs) => evaluateDecision(ast.decisions[0], inputs).result;

// The strongest check: ThunderLang -> each language -> read back -> same answers on every case.
for (const { key } of TRANSLATE_LANGUAGES) {
  test(`round trip through ${key}: the reading decides exactly like the original`, () => {
    const code = translateDecisions(original, key);
    const reading = readCode(code, { language: key });
    const d = reading.items.find((i) => i.kind === 'decision');
    assert.ok(d, `no decision read from ${key}:\n${code}\n${JSON.stringify(reading.items, null, 1)}`);
    assert.equal(d.status, 'read', JSON.stringify(d.unread));
    assert.equal(d.rules.length, 3);
    const back = parseIntent(d.thunder);
    for (const c of CASES) assert.equal(decide(back, c), decide(original, c), `${key} ${JSON.stringify(c)}`);
    assert.deepEqual(d.inputs.map((p) => p.type), ['string', 'boolean', 'number']);
  });
}

test('reads hand-written TypeScript: ternaries, else-if, enum answers, field paths', () => {
  const r = readCode(`
export const shipping = (order: Order): string => order.total >= 50 ? "Free" : "Standard";

function risk(score: number, flagged: boolean): Risk {
  if (flagged) {
    return Risk.High;
  } else if (score < 300) {
    return Risk.Medium;
  } else {
    return Risk.Low;
  }
}

function load(id: string) {
  const row = db.get(id);
  if (!row) throw new NotFoundError(id);
  return row;
}
`, { language: 'typescript' });
  const ship = r.items.find((i) => i.name === 'shipping');
  assert.equal(ship.kind, 'decision');
  assert.equal(ship.rules[0].when, 'order.total >= 50');
  assert.equal(ship.says, 'If order.total is at least 50, the answer is Free. Otherwise, the answer is Standard.');
  const risk = r.items.find((i) => i.name === 'risk');
  assert.deepEqual(risk.rules.map((x) => x.result), ['High', 'Medium']);
  assert.equal(risk.otherwise.result, 'Low');
  const load = r.items.find((i) => i.name === 'load');
  assert.equal(load.kind, 'function');
  assert.ok(load.unread.length >= 1, 'work that is not a rule is listed, not hidden');
  assert.ok(r.items.some((i) => i.kind === 'error' && i.name === 'NotFoundError'));
});

test('reads Java equals() and Python conditional expressions', () => {
  const j = readCode(`public class T {
  public static String tier(String plan, int seats) {
    if (plan.equals("enterprise") || seats > 100) return "Gold";
    return "Standard";
  }
}`, { language: 'java' }).items.find((i) => i.name === 'tier');
  assert.equal(j.rules[0].when, 'plan == "enterprise" or seats > 100');
  const p = readCode(`def label(score: int) -> str:\n    return "pass" if score >= 70 else "fail"\n`, { language: 'python' }).items[0];
  assert.equal(p.kind, 'decision');
  assert.equal(p.rules[0].result, 'pass');
  assert.equal(p.otherwise.result, 'fail');
});

test('never guesses: computed answers and calls with arguments are reported as not read', () => {
  const r = readCode(`function price(qty: number) {
  if (isHoliday(today())) return 0;
  if (qty > 10) return qty * 0.9;
  return qty;
}`, { language: 'typescript' });
  const f = r.items[0];
  assert.equal(f.kind, 'function');
  assert.ok(f.unread.some((u) => /condition/.test(u.reason)));
  assert.equal(toThunderCondition('isHoliday(today())'), null);
  assert.equal(toThunderOutcome('qty * 0.9'), null);
});

test('search and filters narrow the reading', () => {
  const code = translateDecisions(original, 'go') + '\n\nfunc Helper(x int) int {\n\ty := x * 2\n\treturn y\n}\n';
  const reading = readCode(code, { language: 'go' });
  assert.deepEqual(searchReading(reading, { query: 'enterprise' }).map((i) => i.name), ['Priority']);
  assert.deepEqual(searchReading(reading, { kinds: ['function'] }).map((i) => i.name), ['Helper']);
  assert.deepEqual(searchReading(reading, { query: 'urgent outage', kinds: ['decision'] }).map((i) => i.name), ['Priority']);
  assert.equal(searchReading(reading, { query: 'nothing-matches' }).length, 0);
});

test('language detection and plain-English operators', () => {
  assert.equal(detectLanguage('package main\nfunc A() {}'), 'go');
  assert.equal(detectLanguage("fn a(x: f64) -> &'static str { \"x\" }"), 'rust');
  assert.equal(detectLanguage('def a(x):\n    return 1'), 'python');
  assert.equal(detectLanguage('x', 'svc/Rules.java'), 'java');
  assert.equal(sayCondition('amount <= 100 and not late'), 'amount is at most 100 and not late');
});

test('readings drop noise parentheses but keep the ones that aid reading', async () => {
  const { simplifyExpr } = await import('../src/expr.mjs');
  assert.equal(simplifyExpr('((plan == "enterprise") or (waitHours > 24))'), 'plan == "enterprise" or waitHours > 24');
  assert.equal(simplifyExpr('(not outage and (waitHours >= 0))'), 'not outage and waitHours >= 0');
  assert.equal(simplifyExpr('a or (b and c)'), 'a or (b and c)');
  assert.equal(simplifyExpr('(a or b) and not c'), '(a or b) and not c');
  assert.equal(simplifyExpr('not (a and b)'), 'not (a and b)');
});

test('guards: early exits inside ordinary functions become readable rules', () => {
  const ts = readCode(`export async function refund(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "sign in" });
  if (req.body.amount > 500) throw new LimitExceeded("refunds over 500 need approval");
  const order = await db.find(req.body.orderId);
  if (!order) return null;
  await payments.refund(order, req.body.amount);
  return res.json({ ok: true });
}`, { language: 'typescript' }).items.find((i) => i.name === 'refund');
  assert.equal(ts.kind, 'function');
  assert.deepEqual(ts.guards.map((g) => g.says), [
    'Responds 401 if not req.user.',
    'Fails with LimitExceeded ("refunds over 500 need approval") if req.body.amount is more than 500.',
    'Stops early and returns nothing if not order.',
  ]);
  const go = readCode(`package svc
func Withdraw(acct *Account, amount float64) error {
	if amount <= 0 {
		return errors.New("amount must be positive")
	}
	bal, err := acct.Balance()
	if err != nil {
		return err
	}
	if bal < amount {
		return ErrInsufficientFunds
	}
	return acct.Debit(amount)
}`, { language: 'go' }).items.find((i) => i.name === 'Withdraw');
  assert.deepEqual(go.guards.map((g) => g.effect), [
    { kind: 'fails', name: 'error', detail: 'amount must be positive' },
    { kind: 'fails', name: 'ErrInsufficientFunds' },
  ], 'routine `if err != nil { return err }` is not shown as a rule');
  const py = readCode(`def enroll(student, course):
    if course.full:
        raise CourseFull("no seats left")
    if student.balance > 0:
        return None
    course.add(student)
`, { language: 'python' }).items[0];
  assert.deepEqual(py.guards.map((g) => g.says), ['Fails with CourseFull ("no seats left") if course.full.', 'Stops early and returns nothing if student.balance is more than 0.']);
  const rust = readCode(`fn open(path: &str, size: u64) -> Result<File, OpenError> {
    if size > 1_000_000 { return Err(OpenError::TooLarge); }
    File::open(path)
}`, { language: 'rust' }).items[0];
  assert.equal(rust.guards[0].effect.name, 'TooLarge');
  assert.equal(rust.guards[0].readable, false, 'a condition it cannot convert is shown as written, flagged unreadable');
});

test('guards are searchable and filterable', () => {
  const r = readCode(`function a(x: number) { if (x < 0) throw new RangeError("negative"); return Math.sqrt(x); }
function b(y: number) { return y * 2; }`, { language: 'typescript' });
  assert.deepEqual(searchReading(r, { kinds: ['guard'] }).map((i) => i.name), ['a']);
  assert.deepEqual(searchReading(r, { query: 'RangeError' }).map((i) => i.name), ['a', 'RangeError'], 'the guard and the error item both match');
  assert.equal(r.counts.guarded, 1);
});

test('routes: a controller\'s prefix is part of each route (ASP.NET [Route], Spring @RequestMapping)', () => {
  const cs = readCode(`[ApiController]\n[Route("api/[controller]")]\npublic class OrdersController : ControllerBase {\n  [HttpGet("{id}")]\n  public IActionResult One(int id) { return Ok(); }\n\n  [HttpPost]\n  public IActionResult Create() { return Ok(); }\n\n  [HttpGet("/status/orders")]\n  public IActionResult Status() { return Ok(); }\n}`, { language: 'csharp' });
  assert.deepEqual(cs.items.filter((i) => i.route).map((i) => `${i.route.method} ${i.route.path}`), ['GET /api/Orders/{id}', 'POST /api/Orders', 'GET /status/orders']);
  const java = readCode(`@RestController\n@RequestMapping("/api/items")\npublic class ItemsController {\n  @GetMapping("/{id}")\n  public String one() { return "ok"; }\n  @PostMapping\n  public String create() { return "ok"; }\n}`, { language: 'java' });
  assert.deepEqual(java.items.filter((i) => i.route).map((i) => `${i.route.method} ${i.route.path}`), ['GET /api/items/{id}', 'POST /api/items']);
});

test('routes: anonymous and decorated HTTP handlers are named by method and path', () => {
  const ts = readCode(`router.post("/refunds", requireAuth, async (req, res) => {
  if (!req.user) return res.status(401).end();
  res.json(await refunds.create(req.body));
});
app.get('/health', (_req, res) => { res.send("ok"); });`, { language: 'typescript' });
  assert.deepEqual(ts.items.filter((i) => i.route).map((i) => i.name), ['POST /refunds', 'GET /health']);
  assert.equal(ts.items[0].guards[0].says, 'Responds 401 if not req.user.');
  assert.equal(ts.counts.route, 2);
  const py = readCode(`@app.post("/loans")\ndef apply(amount: float, score: int):\n    if score < 500:\n        raise HTTPException(403)\n    return save(amount)\n`, { language: 'python' }).items[0];
  assert.deepEqual(py.route, { method: 'POST', path: '/loans' });
  assert.match(py.says, /^Handles POST \/loans\./);
  const java = readCode(`public class C {\n  @GetMapping("/accounts/{id}")\n  public Account get(String id) {\n    return repo.find(id);\n  }\n}`, { language: 'java' }).items[0];
  assert.deepEqual(java.route, { method: 'GET', path: '/accounts/{id}' });
  const cs = readCode(`public class C {\n  [HttpDelete("docs/{id}")]\n  public IActionResult Remove(string id)\n  {\n    if (!User.IsAdmin()) return Forbid();\n    return Ok();\n  }\n}`, { language: 'csharp' }).items[0];
  assert.deepEqual(cs.route, { method: 'DELETE', path: '/docs/{id}' });
  assert.equal(cs.guards[0].effect.kind, 'responds');
  const go = readCode(`package api\nfunc Routes(r chi.Router) {\n\tr.Get("/orders/{id}", func(w http.ResponseWriter, req *http.Request) {\n\t\tif req.Header.Get("X-Key") == "" {\n\t\t\thttp.Error(w, "no key", 401)\n\t\t\treturn\n\t\t}\n\t\twrite(w)\n\t})\n}`, { language: 'go' });
  assert.ok(go.items.some((i) => i.name === 'GET /orders/{id}'));
  assert.deepEqual(searchReading(ts, { kinds: ['route'] }).length, 2);
  assert.deepEqual(searchReading(ts, { query: 'post refunds' }).map((i) => i.name), ['POST /refunds']);
});

test('quotes: TypeScript strings are never mistaken for Rust lifetimes', () => {
  const r = readCode(`export async function designRoutes(fastify: FastifyInstance) {
  fastify.get('/api/design', async (request, reply) => {
    if (!request.query.path) return reply.code(400).send({ error: 'path' });
    return build();
  });
}`, { language: 'typescript' });
  assert.deepEqual(r.items.map((i) => i.name), ['designRoutes', 'GET /api/design']);
  assert.equal(r.items[1].guards[0].says, 'Responds 400 if not request.query.path.', 'Fastify reply.code(400)');
  const rust = readCode("fn label(x: f64) -> &'static str { if x > 1.0 { \"big\" } else { \"small\" } }", { language: 'rust' }).items[0];
  assert.equal(rust.kind, 'decision');
});
