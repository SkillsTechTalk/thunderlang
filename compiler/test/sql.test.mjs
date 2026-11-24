// SQL in Thunder: tables are Data or Things, CHECK and UNIQUE are rules the database enforces, enums are choices,
// and views, functions, procedures, and triggers are steps a person can follow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode } from '../src/read.mjs';
import { thunderModel, modelText, readLevel } from '../src/model.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { sqlCondition } from '../src/sql.mjs';

const SHOP = readFileSync(new URL('./fixtures/sql/shop.sql', import.meta.url), 'utf8');
const model = () => thunderModel([{ path: 'db/shop.sql', source: SHOP }]);
const member = (m, label) => m.members.find((x) => x.label === label);

test('.sql files are read, as "sql" (and postgres, mysql, sqlite name the same reader)', () => {
  assert.equal(readableLanguage('db/schema.sql'), 'sql');
  for (const l of ['sql', 'postgres', 'mysql', 'sqlite', 'tsql']) assert.equal(readCode('CREATE TABLE t (id INT);', { language: l }).language, 'sql');
});

test('tables are Things with their columns in words; an enum type is choices', () => {
  const m = model();
  const orders = m.things.find((t) => t.name === 'orders');
  assert.equal(orders.doc, 'One purchase by one customer.');
  assert.deepEqual(orders.knows.map((k) => [k.label, k.kind, k.start]), [
    ['id', 'a number, given automatically, the id', null],
    ['customer id', 'a customer (by its id), always set', null],
    ['status', 'an order status, always set', '"pending" at first'],
    ['total', 'a number, always set', '0 at first'],
    ['discount', 'a number', '0 at first'],
  ]);
  assert.deepEqual(m.things.find((t) => t.name === 'order_status').choices, ['pending', 'paid', 'shipped', 'cancelled']);
  assert.equal(m.things.find((t) => t.name === 'customers').knows.find((k) => k.label === 'created at').start, 'the moment it is saved');
  assert.equal(m.unknowns.length, 0);
});

test('CHECK and UNIQUE are rules the table enforces: a No stops the row, with what it needs', () => {
  const m = model();
  const orders = m.things.find((t) => t.name === 'orders');
  assert.deepEqual(m.members.filter((x) => x.owner === orders.id).map((x) => x.label), ['Total not negative', 'Discount check']);
  const text = modelText(m, member(m, 'Total not negative').id);
  assert.match(text, /Ask: Is total at least 0\?/);
  assert.match(text, /No:\n\s+- Stop: Refused by the database: the order needs total is at least 0/);
  const d = readLevel(m, 'details', member(m, 'Unique email').id);
  assert.deepEqual(d.stops.map((s) => [s.error, s.message]), [['Refused by the database', 'each email can be used only once']]);
});

test('a view reads as the steps of its query, with table aliases as their tables', () => {
  const m = model();
  const text = modelText(m, member(m, 'Recent big orders').id);
  for (const line of ['Finds the orders', 'Adds the matching customer to each', 'Keeps only those where the order\'s status is "paid" and the order\'s total is at least 100', 'Sorts them by total, highest first', 'Takes the first 20', 'Gives back id, customer name, and total']) assert.ok(text.includes(line), line);
});

test('a PL/pgSQL function: its inputs, IF/ELSIF as questions, RAISE as Stops, and what it saves', () => {
  const m = model();
  const pay = member(m, 'Pay order');
  assert.deepEqual([pay.youGive, pay.youGetBack], [['order id', 'amount'], 'words']);
  const d = readLevel(m, 'details', pay.id);
  assert.deepEqual(d.stops.map((s) => [s.message, s.when.map((w) => `${w.question} ${w.answer}`)]), [
    ['Order … does not exist', ['Is total empty? Yes']],
    ['Not enough money', ['Is total empty? No', 'Is amount less than total? Yes']],
  ]);
  assert.deepEqual(d.changes.map((c) => c.text), ['Records the change in orders: sets status to "paid" where id is order id', 'Records a new payment with order id and amount']);
});

test('a trigger says when the database runs it', () => {
  assert.match(modelText(model(), member(model(), 'Orders audit').id), /After an order is added or changed, runs log order change/);
});

test('MySQL and SQLite tables read the same way', () => {
  const m = thunderModel([{ path: 'app.sql', source: "CREATE TABLE `users` (\n  `id` INT AUTO_INCREMENT PRIMARY KEY,\n  `email` VARCHAR(255) NOT NULL,\n  `age` INTEGER CHECK (`age` >= 13),\n  `active` TINYINT(1) DEFAULT 1,\n  UNIQUE KEY `uniq_email` (`email`)\n);\n" }]);
  const users = m.things.find((t) => t.name === 'users');
  assert.deepEqual(users.knows.map((k) => k.label), ['id', 'email', 'age', 'active']);
  assert.ok(m.members.some((x) => x.owner === users.id && /age/i.test(x.label)));
});

test('conditions read as words', () => {
  assert.equal(sqlCondition("status IN ('paid', 'shipped') AND deleted_at IS NULL"), 'status is one of paid, shipped and deleted at is empty');
  assert.equal(sqlCondition("email LIKE '%@school.org'"), 'email matches "…@school.org"');
  assert.equal(sqlCondition("name LIKE 'A%'"), 'name starts with "A"');
  assert.equal(sqlCondition('o.total >= 100', { aliases: { o: 'orders' } }), "the order's total is at least 100");
});
