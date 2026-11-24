// thunder-model-v1: the Library example, end to end. Things, data, members, flows, links, and unknowns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderModel, askAsQuestion } from '../src/model.mjs';
import { THUNDER_VISUAL } from '../src/visual.mjs';

const LIBRARY = `from dataclasses import dataclass
from enum import Enum


class Status(Enum):
    ON_SHELF = "on shelf"
    BORROWED = "borrowed"
    LOST = "lost"


@dataclass
class Book:
    """A book in the school library."""
    title: str
    status: Status = Status.ON_SHELF
    times_borrowed: int = 0


class Library:
    """Lends books to students and takes them back."""

    def __init__(self, max_books: int = 3):
        self.books = []
        self.max_books = max_books

    def add_book(self, book):
        """Put a new book on the shelf."""
        self.books.append(book)

    def can_borrow(self, books_out: int, has_late_book: bool) -> bool:
        """A student may borrow when they have room and nothing late."""
        return books_out < self.max_books and not has_late_book

    def borrow(self, student, book):
        """A student takes a book home."""
        if book.status != Status.ON_SHELF:
            raise NotAvailable("Someone else has this book")
        if not self.can_borrow(len(student.books), student.has_late_book):
            raise CannotBorrow("Return a book first")
        book.status = Status.BORROWED
        book.times_borrowed += 1
        student.books.append(book)

    def late_fee(self, days_late: int) -> str:
        """Small fines for late books."""
        if days_late <= 0:
            return "NoFee"
        if days_late <= 7:
            return "SmallFee"
        return "BigFee"
`;

const model = () => thunderModel([{ path: 'shop/library.py', source: LIBRARY }], { name: 'library' });
const thing = (m, name) => m.things.find((t) => t.name === name);
const member = (m, name) => m.members.find((x) => x.name === name);
const edge = (flow, from, label) => flow.edges.find((e) => e.from === from && e.label === label);
const nodeText = (flow, id) => flow.nodes.find((n) => n.id === id).text;

test('classes become Things, records, and choices, with what they know and how they start', () => {
  const m = model();
  assert.equal(m.schema, 'thunder-model-v1');
  assert.deepEqual(m.things.map((t) => [t.name, t.kind]), [['Status', 'choices'], ['Book', 'record'], ['Library', 'thing']]);
  assert.deepEqual(thing(m, 'Status').choices, ['on shelf', 'borrowed', 'lost']);
  const book = thing(m, 'Book');
  assert.equal(book.doc, 'A book in the school library.');
  assert.deepEqual(book.knows.map((k) => [k.label, k.kind, k.start]), [['title', 'words', null], ['status', 'a Status', 'on shelf at first'], ['times borrowed', 'a number', '0 at first']]);
  const lib = thing(m, 'Library');
  assert.deepEqual(lib.knows.map((k) => [k.label, k.start]), [['books', 'empty at first'], ['max books', '3 unless told otherwise']]);
  assert.equal(lib.can.length, 5, 'its five methods belong to it');
});

test('methods become members of their Thing: setup, steps, and rules', () => {
  const m = model();
  assert.deepEqual(m.members.map((x) => [x.name, x.kind]), [['__init__', 'setup'], ['add_book', 'steps'], ['can_borrow', 'rule'], ['borrow', 'steps'], ['late_fee', 'rule']]);
  assert.equal(member(m, '__init__').label, 'A new Library starts with');
  assert.deepEqual(member(m, 'borrow').youGive, ['student', 'book']);
  assert.ok(m.members.every((x) => x.owner === thing(m, 'Library').id));
});

test('the borrow flow asks positive yes/no questions, stops on No, and links to the rule it uses', () => {
  const m = model();
  const f = member(m, 'borrow').flow;
  const [q1, q2] = f.nodes.filter((n) => n.kind === 'decision');
  assert.equal(q1.text, "Is the book's status on shelf?");
  assert.match(nodeText(f, edge(f, q1.id, 'no').to), /^Stop: NotAvailable: "Someone else has this book"$/);
  assert.equal(q2.text, 'Can borrow?');
  assert.equal(q2.uses, member(m, 'can_borrow').id);
  assert.match(nodeText(f, edge(f, q2.id, 'no').to), /^Stop: CannotBorrow/);
  assert.equal(nodeText(f, edge(f, q2.id, 'yes').to), "Sets the book's status to borrowed");
  assert.ok(f.nodes.some((n) => n.text === "Adds book to student's books"));
  assert.deepEqual(m.links, [{ from: member(m, 'borrow').id, to: member(m, 'can_borrow').id, kind: 'uses', node: q2.id }]);
});

test('a rule is drawn as questions in order, each Yes giving its answer, otherwise the fallback', () => {
  const f = member(model(), 'late_fee').flow;
  assert.deepEqual(f.nodes.filter((n) => n.kind === 'decision').map((n) => n.text), ['Days late is at most 0?', 'Days late is at most 7?']);
  assert.deepEqual(f.nodes.filter((n) => n.answer).map((n) => n.text), ['No fee', 'Small fee', 'Big fee']);
  assert.ok(f.nodes.find((n) => n.text === 'Big fee').otherwise);
});

test('setup reads as what a new Thing keeps', () => {
  const f = member(model(), '__init__').flow;
  assert.ok(f.nodes.some((n) => n.text === 'Keeps the max books it is given'));
});

test('questions are asked the positive way round', () => {
  assert.deepEqual(askAsQuestion({ says: 'If order has no items' }), { text: "Does order have items?", flip: true });
  assert.deepEqual(askAsQuestion({ says: 'If order.total is at least 20' }), { text: "Is the order's total at least 20?", flip: false });
  assert.deepEqual(askAsQuestion({ says: 'If not self.can_borrow(x)', code: 'if not self.can_borrow(x):' }, 'Can borrow'), { text: 'Can borrow?', flip: true });
});

test('classes in languages not drawn as Things yet are listed as unknowns, never silently dropped', () => {
  const m = thunderModel([{ path: 'Lib.java', source: 'class Library {\n  int maxBooks = 3;\n  boolean canBorrow(int out) { return out < 3; }\n}\n' }]);
  assert.equal(m.things.length, 0);
  assert.match(m.unknowns[0].why, /not drawn as Things yet/);
  assert.ok(m.members.some((x) => x.name === 'canBorrow'));
});

test('TypeScript classes, interfaces, and enums become Things, records, and choices', () => {
  const m = thunderModel([{ path: 'lib.ts', source: 'enum Status { OnShelf = "on shelf", Borrowed = "borrowed" }\n\ninterface Book { title: string; timesBorrowed: number }\n\n/** Lends books. */\nexport class Library {\n  private books: Book[] = [];\n  constructor(private maxBooks: number = 3) {}\n  borrow(book: Book): void {\n    if (book.title === "") throw new Error("No title");\n    this.books.push(book);\n  }\n}\n' }]);
  assert.deepEqual(m.things.map((t) => [t.name, t.kind]), [['Status', 'choices'], ['Book', 'record'], ['Library', 'thing']]);
  assert.deepEqual(m.things[0].choices, ['on shelf', 'borrowed']);
  assert.equal(m.things[2].doc, 'Lends books.');
  assert.equal(m.things[2].knows.find((k) => k.name === 'books').start, 'empty at first');
  assert.ok(m.members.find((x) => x.name === 'borrow').owner === m.things[2].id);
});

test('the symbols and kid step kinds ship as data, with six beginner concepts', () => {
  assert.deepEqual(THUNDER_VISUAL.beginner, ['thing', 'action', 'rule', 'steps', 'data', 'stop']);
  for (const id of THUNDER_VISUAL.beginner) assert.ok(THUNDER_VISUAL.symbols[id].paths.length, id);
  for (const d of Object.values(THUNDER_VISUAL.does)) assert.ok(THUNDER_VISUAL.colors[d.color], d.label);
});

test('yes/no rules are named as questions; rules with named answers are not; rule line ranges are real', () => {
  const m = model();
  assert.equal(member(m, 'can_borrow').yesNo, true);
  assert.equal(member(m, 'late_fee').yesNo, false);
  assert.deepEqual(member(m, 'late_fee').lines, [44, 50]);
});

test('a step that calls another function in the file links to it, wherever the call sits in the line', () => {
  const m = thunderModel([{ path: 'orders.py', source: 'def delivery_fee(total: float) -> str:\n    if total >= 20:\n        return "Free"\n    return "Standard"\n\n\ndef place_order(order):\n    fee = delivery_fee(order.total)\n    return fee\n' }]);
  const place = m.members.find((x) => x.name === 'place_order');
  const step = place.flow.nodes.find((n) => n.uses);
  assert.equal(step.uses, m.members.find((x) => x.name === 'delivery_fee').id);
  assert.equal(m.links.length, 1);
});
