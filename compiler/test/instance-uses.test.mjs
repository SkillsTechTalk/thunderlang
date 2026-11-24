// A call through an instance made in the same file (`library = Library()`, then `library.can_borrow()`)
// links to the method it runs, so Details "Rules it relies on" and Flow's "Open the rule" keep working.
// (OpenThunder found this missing after the cross-file linking work; 0.5.11 had it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderModel } from '../src/model.mjs';

const usesFrom = (m, name) => {
  const from = m.members.find((x) => x.name === name);
  return { links: m.links.filter((l) => l.from === from.id && l.kind === 'uses'), nodes: from.flow.nodes.filter((n) => n.uses) };
};

test('Python: an action calling a rule through a module-level instance (with a route)', () => {
  const source = `from fastapi import APIRouter, HTTPException
router = APIRouter()

class Library:
    def can_borrow(self, books_out, has_late_book):
        return books_out < 3 and not has_late_book

library = Library()

@router.post("/books/{title}/borrow")
def borrow_book(title: str, books_out: int, has_late_book: bool):
    if not library.can_borrow(books_out, has_late_book):
        raise HTTPException(403, "Cannot borrow")
    return {"ok": True}
`;
  const m = thunderModel([{ path: 'library.py', source }]);
  const rule = m.members.find((x) => x.name === 'can_borrow');
  const { links, nodes } = usesFrom(m, 'borrow_book');
  assert.deepEqual(links.map((l) => l.to), [rule.id]);
  assert.equal(links[0].crossFile, undefined, 'same file: not marked cross-file');
  assert.deepEqual(nodes.map((n) => n.uses), [rule.id]);
});

test('Python: the same pattern in a file with no routes', () => {
  const source = 'class L:\n    def ok(self, n):\n        return n < 3\n\nlib = L()\n\ndef go(n):\n    if not lib.ok(n):\n        raise ValueError("no")\n    return 1\n';
  const m = thunderModel([{ path: 'a.py', source }]);
  assert.deepEqual(usesFrom(m, 'go').links.map((l) => l.to), [m.members.find((x) => x.name === 'ok').id]);
});

test('TypeScript: const svc = new Service(); svc.rule()', () => {
  const source = 'class Service {\n  canShip(weight: number): boolean { return weight < 30; }\n}\nconst svc = new Service();\nexport function ship(weight: number) {\n  if (!svc.canShip(weight)) {\n    throw new Error("too heavy");\n  }\n  return "shipped";\n}\n';
  const m = thunderModel([{ path: 'ship.ts', source }]);
  const rule = m.members.find((x) => x.name === 'canShip');
  const { links, nodes } = usesFrom(m, 'ship');
  assert.deepEqual(links.map((l) => l.to), [rule.id]);
  assert.deepEqual(nodes.map((n) => n.uses), [rule.id]);
});

test('an unrelated method with the same name on an untyped value is still not linked', () => {
  const source = 'class Service {\n  canShip(weight: number): boolean { return weight < 30; }\n}\nexport function ship(other: any, weight: number) {\n  if (!other.canShip(weight)) {\n    throw new Error("no");\n  }\n  return 1;\n}\n';
  const m = thunderModel([{ path: 'ship.ts', source }]);
  assert.deepEqual(usesFrom(m, 'ship').links, []);
});
