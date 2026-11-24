// The whole system: a step's call links to the member it calls in another file (through the file's imports), an
// HTTP request links to the route in this repo that handles it, and an event links to the code listening for it.
// Nothing is guessed: what cannot be linked is listed in `notLinked` with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderModel, readLevel } from '../src/model.mjs';

const memberNamed = (model, name, file) => model.members.find((m) => m.name === name && (!file || m.file === file));
/** Every cross-file or service link as "from-file:from-name -> to-file:to-name (kind)". */
const crossLinks = (model) => model.links.filter((l) => l.crossFile || l.kind === 'sends-to').map((l) => {
  const a = model.members.find((m) => m.id === l.from), b = model.members.find((m) => m.id === l.to);
  return `${a.file}:${a.name} -> ${b.file}:${b.name}${l.kind === 'sends-to' ? ' (sends-to)' : ''}`;
});
const has = (model, expected) => { const got = crossLinks(model); for (const e of expected) assert.ok(got.includes(e), `missing ${e}\n got: ${got.join('\n      ')}`); };

test('JS/TS: ES modules, CommonJS, re-exports, typed fields; external and dynamic imports are not linked', () => {
  const model = thunderModel([
    { path: 'src/orders/service.ts', source: `import { save as store, findOrder } from '../db/orders';
import pricing from './pricing';
import * as audit from '../audit';
import { notify } from '../index';
import express from 'express';
export class OrderService {
  constructor(private readonly repo: OrderRepo) {}
  async place(order) {
    const total = pricing(order);
    await store(order);
    audit.record('placed', order.id);
    notify(order);
    return this.repo.find(order.id);
  }
}
export async function load(id) {
  const plugin = await import(pluginName);
  return findOrder(id);
}
` },
    { path: 'src/orders/pricing.ts', source: 'export default function price(order) {\n  return order.items.length * 10;\n}\n' },
    { path: 'src/db/orders.ts', source: 'export async function save(order) {\n  await db.insert(order);\n}\nexport function findOrder(id) {\n  return db.get(id);\n}\n' },
    { path: 'src/audit/index.js', source: 'exports.record = function (what, id) {\n  log.push({ what, id });\n};\n' },
    { path: 'src/index.ts', source: "export * from './notify';\nexport { OrderRepo } from './repo';\n" },
    { path: 'src/notify.ts', source: 'export function notify(order) {\n  mailer.send(order.email);\n}\n' },
    { path: 'src/repo.ts', source: 'import { OrderRepo } from "./orders/repo";\n' },
    { path: 'src/orders/repo.ts', source: 'export class OrderRepo {\n  find(id) {\n    return rows.get(id);\n  }\n}\n' },
    { path: 'src/orders/service-imports.ts', source: "import { OrderRepo } from './repo';\n" },
  ]);
  has(model, [
    'src/orders/service.ts:place -> src/orders/pricing.ts:price',
    'src/orders/service.ts:place -> src/db/orders.ts:save',
    'src/orders/service.ts:place -> src/audit/index.js:record',
    'src/orders/service.ts:place -> src/notify.ts:notify',
    'src/orders/service.ts:load -> src/db/orders.ts:findOrder',
  ]);
  const link = model.links.find((l) => l.crossFile && model.members.find((m) => m.id === l.to)?.name === 'save');
  assert.equal(link.kind, 'uses');
  assert.equal(link.file, 'src/db/orders.ts');
  assert.equal(link.line, 10);
  // The flow node that makes the call opens the member in the other file.
  const place = memberNamed(model, 'place');
  const node = place.flow.nodes.find((n) => n.line === 10);
  assert.equal(node.uses, memberNamed(model, 'save').id);
  assert.equal(node.usesFile, 'src/db/orders.ts');
  // Not linked, with the reason: an external package, a dynamic import.
  assert.ok(model.notLinked.some((x) => /external package \(express\)/.test(x.why)));
  assert.ok(model.notLinked.some((x) => /dynamic import/.test(x.why) && x.file === 'src/orders/service.ts'));
});

test('TS: a field with a declared type links to that class in another file', () => {
  const model = thunderModel([
    { path: 'a/service.ts', source: "import { OrderRepo } from './repo';\nexport class OrderService {\n  constructor(private readonly repo: OrderRepo) {}\n  get(id: string) {\n    return this.repo.find(id);\n  }\n}\n" },
    { path: 'a/repo.ts', source: 'export class OrderRepo {\n  find(id: string) {\n    return rows.get(id);\n  }\n}\n' },
  ]);
  has(model, ['a/service.ts:get -> a/repo.ts:find']);
});

test('Python: absolute, relative, package, and aliased imports; a class call starts the class', () => {
  const model = thunderModel([
    { path: 'shop/orders/service.py', source: `from .models import Order
from ..billing import charge
from shop import utils
import shop.mail as mail
import requests

def place(data):
    order = Order(data)
    charge.charge_card(order.total)
    utils.log_event("placed")
    mail.send_receipt(order)
    send_later.delay(order.id)
    return order
` },
    { path: 'shop/orders/models.py', source: 'class Order:\n    def __init__(self, data):\n        self.total = data["total"]\n' },
    { path: 'shop/orders/__init__.py', source: '' },
    { path: 'shop/billing/__init__.py', source: '' },
    { path: 'shop/billing/charge.py', source: 'def charge_card(amount):\n    if amount <= 0:\n        raise ValueError("no amount")\n    return gateway.charge(amount)\n' },
    { path: 'shop/__init__.py', source: '' },
    { path: 'shop/utils.py', source: 'def log_event(name):\n    print(name)\n' },
    { path: 'shop/mail.py', source: 'def send_receipt(order):\n    smtp.send(order)\n' },
  ]);
  has(model, [
    'shop/orders/service.py:place -> shop/orders/models.py:__init__',
    'shop/orders/service.py:place -> shop/billing/charge.py:charge_card',
    'shop/orders/service.py:place -> shop/utils.py:log_event',
    'shop/orders/service.py:place -> shop/mail.py:send_receipt',
  ]);
  assert.ok(model.notLinked.some((x) => /external package \(requests\)/.test(x.why)));
});

test('Go: imported packages (by go.mod), other files of the same package, and receivers', () => {
  const model = thunderModel([
    { path: 'go.mod', source: 'module example.com/shop\n\ngo 1.22\n' },
    { path: 'cmd/server/main.go', source: 'package main\n\nimport (\n\t"fmt"\n\t"example.com/shop/internal/orders"\n)\n\nfunc main() {\n\ts := orders.NewService()\n\tfmt.Println(s)\n\tstart(s)\n}\n' },
    { path: 'cmd/server/start.go', source: 'package main\n\nimport "example.com/shop/internal/orders"\n\nfunc start(s *orders.Service) {\n\ts.Place(1)\n}\n' },
    { path: 'internal/orders/service.go', source: 'package orders\n\ntype Service struct {\n\tcount int\n}\n\nfunc NewService() *Service {\n\treturn &Service{}\n}\n\nfunc (s *Service) Place(id int) error {\n\tif id <= 0 {\n\t\treturn fmt.Errorf("bad id")\n\t}\n\ts.count++\n\treturn nil\n}\n' },
  ]);
  has(model, [
    'cmd/server/main.go:main -> internal/orders/service.go:NewService',
    'cmd/server/main.go:main -> cmd/server/start.go:start',
    'cmd/server/start.go:start -> internal/orders/service.go:Place',
  ]);
  assert.ok(model.notLinked.some((x) => /standard library \(fmt\)/.test(x.why)));
});

test('Java: an imported class, its static method, a typed field, and overloads told apart by how many values', () => {
  const model = thunderModel([
    { path: 'src/main/java/com/shop/web/OrderController.java', source: `package com.shop.web;

import com.shop.orders.OrderService;
import java.util.List;

public class OrderController {
  private final OrderService service;

  public OrderController(OrderService service) {
    this.service = service;
  }

  public String place(String id) {
    OrderService.validate(id);
    service.place(id, 2);
    return id;
  }
}
` },
    { path: 'src/main/java/com/shop/orders/OrderService.java', source: `package com.shop.orders;

public class OrderService {
  public static void validate(String id) {
    if (id == null) {
      throw new IllegalArgumentException("id");
    }
  }

  public void place(String id) {
    log(id);
  }

  public void place(String id, int count) {
    log(id + count);
  }
}
` },
  ]);
  has(model, ['src/main/java/com/shop/web/OrderController.java:place -> src/main/java/com/shop/orders/OrderService.java:validate']);
  const link = model.links.find((l) => l.crossFile && model.members.find((m) => m.id === l.to)?.name === 'place');
  assert.ok(link, 'the call to place is linked');
  assert.equal(model.members.find((m) => m.id === link.to).lines[0], 14, 'the two-value place');
});

test('C#, Kotlin, PHP, Ruby, Rust: classes by import or namespace, constructors, and module paths', () => {
  const cs = thunderModel([
    { path: 'Web/Controller.cs', source: 'using Shop.Orders;\nnamespace Shop.Web {\n  public class Controller {\n    public void Place(string id) {\n      var s = new OrderService(id);\n      OrderService.Check(id);\n    }\n  }\n}\n' },
    { path: 'Orders/OrderService.cs', source: 'namespace Shop.Orders {\n  public class OrderService {\n    public OrderService(string id) {\n      Id = id;\n    }\n    public static void Check(string id) {\n      if (id == null) throw new ArgumentException("id");\n    }\n  }\n}\n' },
  ]);
  has(cs, ['Web/Controller.cs:Place -> Orders/OrderService.cs:OrderService', 'Web/Controller.cs:Place -> Orders/OrderService.cs:Check']);

  const kt = thunderModel([
    { path: 'app/Main.kt', source: 'package app\n\nimport shop.OrderService\n\nfun main() {\n    val s = OrderService()\n    s.place("a")\n}\n' },
    { path: 'shop/OrderService.kt', source: 'package shop\n\nclass OrderService {\n    fun place(id: String) {\n        println(id)\n    }\n}\n' },
  ]);
  has(kt, ['app/Main.kt:main -> shop/OrderService.kt:place']);

  const php = thunderModel([
    { path: 'app/Http/OrderController.php', source: '<?php\nnamespace App\\Http;\n\nuse App\\Services\\OrderService;\n\nclass OrderController {\n    public function __construct(private OrderService $orders) {}\n\n    public function store($id) {\n        OrderService::validate($id);\n        $this->orders->place($id);\n    }\n}\n' },
    { path: 'app/Services/OrderService.php', source: '<?php\nnamespace App\\Services;\n\nclass OrderService {\n    public static function validate($id) {\n        if (!$id) {\n            throw new \\Exception("id");\n        }\n    }\n\n    public function place($id) {\n        $this->log($id);\n    }\n}\n' },
  ]);
  has(php, ['app/Http/OrderController.php:store -> app/Services/OrderService.php:validate', 'app/Http/OrderController.php:store -> app/Services/OrderService.php:place']);

  const rb = thunderModel([
    { path: 'app/controllers/orders_controller.rb', source: "require_relative '../models/order'\n\nclass OrdersController\n  def create\n    order = Order.new(params)\n    Order.place(order)\n  end\nend\n" },
    { path: 'app/models/order.rb', source: 'class Order\n  def initialize(params)\n    @params = params\n  end\n\n  def self.place(order)\n    order.save\n  end\nend\n' },
  ]);
  has(rb, ['app/controllers/orders_controller.rb:create -> app/models/order.rb:initialize', 'app/controllers/orders_controller.rb:create -> app/models/order.rb:place']);

  const rs = thunderModel([
    { path: 'src/main.rs', source: 'use crate::orders::place;\n\nfn main() {\n    place(1);\n    crate::orders::cancel(2);\n}\n' },
    { path: 'src/orders.rs', source: 'pub fn place(id: u32) -> bool {\n    id > 0\n}\n\npub fn cancel(id: u32) {\n    println!("{}", id);\n}\n' },
  ]);
  has(rs, ['src/main.rs:main -> src/orders.rs:place', 'src/main.rs:main -> src/orders.rs:cancel']);
});

test('HTTP: a request is linked to the route that handles its method and path; path parameters match anything', () => {
  const model = thunderModel([
    { path: 'web/api.js', source: `export async function loadOrder(id) {
  const res = await fetch(\`/api/orders/\${id}\`);
  return res.json();
}
export async function cancelOrder(id) {
  await axios.delete('/api/orders/' + id);
}
export async function payOrder(id) {
  await fetch('/api/orders/' + id + '/pay', { method: 'POST' });
}
export async function track(url) {
  await fetch(url);
}
export async function stripe() {
  await fetch('https://api.stripe.com/v1/charges', { method: 'POST' });
}
` },
    { path: 'server/routes.js', source: `router.get('/api/orders/:id', async (req, res) => {
  const order = await Order.find(req.params.id);
  res.json(order);
});
router.delete('/api/orders/:id', async (req, res) => {
  await Order.remove(req.params.id);
  res.sendStatus(204);
});
` },
  ]);
  has(model, [
    'web/api.js:loadOrder -> server/routes.js:GET /api/orders/:id (sends-to)',
    'web/api.js:cancelOrder -> server/routes.js:DELETE /api/orders/:id (sends-to)',
  ]);
  const l = model.links.find((x) => x.kind === 'sends-to' && x.method === 'GET');
  assert.equal(l.path, '/api/orders/:value');
  assert.equal(l.route, 'GET /api/orders/:id');
  const why = (name) => model.notLinked.find((x) => x.from === memberNamed(model, name).id)?.why;
  assert.match(why('payOrder'), /no route in this repo handles POST \/api\/orders\/:value\/pay/);
  assert.match(why('track'), /computed URL/);
  assert.match(why('stripe'), /another service at api\.stripe\.com/);
  // Details shows the request and the route it reaches; the route's Details shows who sends to it.
  const d = readLevel(model, 'details', memberNamed(model, 'loadOrder').id);
  const r = d.reliesOn.find((x) => x.kind === 'sends-to');
  assert.equal(r.service, 'GET /api/orders/:value');
  assert.equal(r.route, 'GET /api/orders/:id');
  assert.equal(r.file, 'server/routes.js');
  assert.match(readLevel(model, 'details', memberNamed(model, 'track').id).notLinked[0].why, /computed URL/);
});

test('HTTP: Python requests to FastAPI routes; two matching routes are not guessed between', () => {
  const model = thunderModel([
    { path: 'client.py', source: 'import requests\n\ndef get_order(order_id):\n    return requests.get(f"/orders/{order_id}")\n\ndef any_item(kind, item_id):\n    return requests.get(f"/{kind}/{item_id}")\n' },
    { path: 'api.py', source: '@app.get("/orders/{order_id}")\ndef read_order(order_id: int):\n    return db.get(order_id)\n\n@app.get("/users/{user_id}")\ndef read_user(user_id: int):\n    return db.get(user_id)\n' },
  ]);
  has(model, ['client.py:get_order -> api.py:read_order (sends-to)']);
  assert.match(model.notLinked.find((x) => x.from === memberNamed(model, 'any_item').id).why, /computed URL|2 routes/);
});

test('Events and queues: a publish links to the listeners for the same name; generic names are not matched', () => {
  const model = thunderModel([
    { path: 'orders.js', source: "export function placeOrder(order) {\n  bus.emit('order.placed', order);\n  stream.emit('error', new Error('x'));\n  emails.add({ to: order.email });\n}\nconst emails = new Queue('emails');\n" },
    { path: 'listeners.js', source: "bus.on('order.placed', function (order) {\n  stock.reserve(order);\n});\nstream.on('error', function (e) {\n  console.log(e);\n});\n" },
    { path: 'worker.js', source: "const worker = new Worker('emails', async (job) => {\n  await mailer.send(job.data);\n});\n" },
  ]);
  const got = crossLinks(model);
  assert.ok(got.some((x) => /^orders\.js:placeOrder -> listeners\.js:bus\.on › callback at line 1 \(sends-to\)$/.test(x)), got.join('\n'));
  assert.ok(got.some((x) => /^orders\.js:placeOrder -> worker\.js:.*callback at line 1 \(sends-to\)$/.test(x)), got.join('\n'));
  assert.ok(!got.some((x) => /line 4/.test(x)), 'a stream error is not linked to an unrelated listener');
});

test('Big Picture: which areas call which; a member says what it uses in other files', () => {
  const model = thunderModel([
    { path: 'web/handlers/orders.ts', source: "import { place } from '../../core/orders/place';\nexport function handle(req) {\n  return place(req.body);\n}\n" },
    { path: 'core/orders/place.ts', source: "import { save } from '../../db/store';\nexport function place(order) {\n  save(order);\n  return order;\n}\n" },
    { path: 'db/store.ts', source: 'export function save(order) {\n  rows.push(order);\n}\n' },
  ]);
  const big = readLevel(model, 'big-picture');
  assert.deepEqual(big.calls.map((c) => `${c.from} -> ${c.to}: ${c.calls}`), ['core/orders -> db: 1', 'web/handlers -> core/orders: 1']);
  assert.equal(big.calls[1].examples[0].says, 'Handle calls Place');
  const bp = readLevel(model, 'big-picture', memberNamed(model, 'place').id);
  assert.deepEqual(bp.uses, [{ id: memberNamed(model, 'save').id, label: 'Save', file: 'db/store.ts', crossFile: true, line: 3 }]);
  assert.deepEqual(bp.usedBy.map((u) => [u.label, u.file]), [['Handle', 'web/handlers/orders.ts']]);
});
