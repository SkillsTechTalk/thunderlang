// Reading a real app: every endpoint is found, the author's docstring is kept as the meaning, and steps that only
// restate syntax are marked instead of being counted as read. Synthetic FastAPI-style code (no customer code).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { classifyStatement } from '../src/steps.mjs';

const API = `from fastapi import APIRouter, Depends

router = APIRouter()


@router.get(
    "/licences",
    response_model=list[LicenceOut],
    summary="List licences",
)
async def list_licences(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[LicenceOut]:
    """List the import licences the user can see.

    Args:
        skip: how many to skip.
    """
    return db.query(Licence).offset(skip).limit(limit).all()


@router.post("/licences/{licence_id}/approve", status_code=200)
@require_role("supervisor")
async def approve_licence(licence_id: int, db: Session = Depends(get_db)):
    licence = db.get(Licence, licence_id)
    licence.status = "approved"
    db.commit()
    return {"ok": True}


def sign_off_allowed(recon) -> bool:
    """Sign-off is blocked when there is an OCC discrepancy."""
    return not recon.occ_discrepancy


def rule_allows(rules, item):
    actives = [r for r in rules if r.active]
    if not actives:
        return True
    return any(r.matches(item) for r in actives)
`;

const byName = (reading, name) => reading.items.find((i) => i.name === name);

test('Python functions whose header spans several lines are read, with their multi-line route decorator', () => {
  const r = readCode(API, { language: 'python' });
  const list = byName(r, 'list_licences');
  assert.ok(list, 'list_licences is found');
  assert.deepEqual(list.route, { method: 'GET', path: '/licences' });
  assert.deepEqual(list.inputs.map((p) => p.name), ['skip', 'limit', 'db']);
  assert.equal(list.returns, 'list[LicenceOut]');
  assert.ok(list.steps.some((s) => s.line === 21), 'the body starts after the header, not inside it');
  assert.deepEqual(byName(r, 'approve_licence').route, { method: 'POST', path: '/licences/{licence_id}/approve' });
  assert.equal(r.counts.route, 2);
});

test('a Python header split across lines without a decorator is read too', () => {
  const r = readCode('def total(\n    items,\n    tax: float = 0.2,\n):\n    return sum(i.price for i in items)\n', { language: 'python' });
  assert.deepEqual(byName(r, 'total').inputs.map((p) => p.name), ['items', 'tax']);
});

test("the docstring's first paragraph becomes the item's `doc`, without Args sections", () => {
  const r = readCode(API, { language: 'python' });
  assert.equal(byName(r, 'list_licences').doc, 'List the import licences the user can see.');
  assert.equal(byName(r, 'sign_off_allowed').doc, 'Sign-off is blocked when there is an OCC discrepancy.');
  assert.equal(byName(r, 'approve_licence').doc, undefined);
});

test('doc comments are read in brace languages: JSDoc, ///, and Go comments', () => {
  const ts = readCode('/**\n * Whether a refund can be issued.\n * @param order the order\n */\nexport function canRefund(order: Order): boolean {\n  return order.paid && !order.shipped;\n}\n', { language: 'typescript' });
  assert.equal(byName(ts, 'canRefund').doc, 'Whether a refund can be issued.');
  const go = readCode('package x\n\n// CanRefund reports whether a refund can be issued.\nfunc CanRefund(o Order) bool {\n\treturn o.Paid && !o.Shipped\n}\n', { language: 'go' });
  assert.equal(byName(go, 'CanRefund').doc, 'CanRefund reports whether a refund can be issued.');
  const rs = readCode('/// Whether a refund can be issued.\npub fn can_refund(o: &Order) -> bool {\n    o.paid && !o.shipped\n}\n', { language: 'rust' });
  assert.equal(byName(rs, 'can_refund').doc, 'Whether a refund can be issued.');
});

test('Python comprehensions and any/all read as what they produce', () => {
  const steps = byName(readCode(API, { language: 'python' }), 'rule_allows').steps;
  assert.equal(steps[0].says, 'Works out actives: the items in rules where active');
  assert.equal(steps.at(-1).says, 'Returns whether any item in actives matches');
  assert.ok(steps.every((s) => !s.restates));
});

test('steps that only restate syntax are marked and do not count as readable', () => {
  const r = readCode('def helper(x):\n    y = foo.process(x)\n    return x + 1\n', { language: 'python' });
  const h = byName(r, 'helper');
  assert.ok(h.steps.every((s) => s.restates), JSON.stringify(h.steps.map((s) => s.says)));
  assert.equal(h.stepsReadable, 0);
});

test('everyday value shapes are said as what they are', () => {
  const says = (code) => classifyStatement(code).says;
  assert.equal(says('rootCmd := &Command{'), 'Sets root cmd to a new Command');
  assert.equal(says('qop = chal.get("qop")'), 'Sets qop to the "qop" value from chal');
  assert.equal(says('parts = version.split(".")'), 'Sets parts to version split at "."');
  assert.equal(says('prep = r.request.copy()'), 'Sets prep to a copy of request');
  assert.equal(says('seen[arg] = True'), 'Records arg in seen');
  assert.equal(says("request.headers.set('Authorization', token)"), 'Sets "Authorization" on headers');
  assert.equal(says('return request.url is not None and request.method is not None'), 'Returns whether request.url is set and request.method is set');
  assert.equal(says('return host_params, pool_kwargs'), 'Returns host params and pool kwargs');
});

test('a yes/no property reads as a sentence; other property paths stay as they are', async () => {
  const { sayCodeCondition } = await import('../src/steps.mjs');
  assert.equal(sayCodeCondition('order.refunded'), 'order is refunded');
  assert.equal(sayCodeCondition('not order.refunded'), 'order is not refunded');
  assert.equal(sayCodeCondition('!user.isAdmin'), 'user is not admin');
  assert.equal(sayCodeCondition('user.hasAccess'), 'user has access');
  assert.equal(sayCodeCondition('self.cart.items'), 'cart has items', 'a collection used as a condition means it has items');
  assert.equal(sayCodeCondition('not order.items'), 'order has no items');
  assert.equal(sayCodeCondition('order.status'), 'order.status', 'status is not a plural');
  assert.equal(sayCodeCondition('x.y()'), 'x.y()');
});

test('arithmetic in parentheses is a computed value, not an object; += says what it adds', async () => {
  const { classifyStatement } = await import('../src/steps.mjs');
  assert.equal(classifyStatement('return (dough.thickness * 17 + 220) % 300').says, 'Returns a computed value');
  assert.equal(classifyStatement('return ({ a: 1 })').says, 'Returns an object');
  assert.equal(classifyStatement('total += item.price').says, 'Adds item price to total');
  assert.equal(classifyStatement('count += 1').says, 'Adds 1 to count');
});
