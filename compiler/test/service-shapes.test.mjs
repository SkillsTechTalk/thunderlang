// Shapes services use to talk to each other, read so Thunder Trace can link them (synthetic snippets):
// ASP.NET minimal-API routes, an HttpClient under any client-like name, Python's standard-library handler,
// and a fetch whose options object goes over several lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrace } from '../src/trace.mjs';
import { thunderModel } from '../src/model.mjs';

const steps = (path, source, name) => thunderModel([{ path, source }], { name: 'x' }).members.find((m) => m.name === name).flow.nodes.map((n) => n.text);

test('ASP.NET minimal APIs: app.MapPost / app.MapGet are routes (block and expression lambdas)', () => {
  const src = 'var app = WebApplication.Create();\napp.MapPost("/invoices", async (Invoice invoice, Store store) =>\n{\n    return await store.SaveAsync(invoice);\n});\napp.MapGet("/invoices/{id}", (int id, Store store) => store.Find(id));\napp.Run();\n';
  const t = buildTrace([{ name: 'svc', files: [{ path: 'Program.cs', source: src }] }]);
  assert.deepEqual(t.repos[0].routes.map((r) => `${r.method} ${r.path}`).sort(), ['GET /invoices/{id}', 'POST /invoices']);
});

test('an HttpClient under any client-like name sends a request (http, _http, paymentsClient)', () => {
  for (const name of ['http', '_http', 'paymentsClient']) {
    const src = `public class Payer\n{\n    public async Task PayAsync(long cents)\n    {\n        var response = await ${name}.PostAsync("/payments", Body(cents));\n        response.EnsureSuccessStatusCode();\n    }\n}\n`;
    assert.match(steps('Payer.cs', src, 'PayAsync').join('\n'), /Sends a POST request to \/payments/, name);
  }
  // Not a client: a message bus's PostAsync stays what it is.
  const bus = 'public class Notifier\n{\n    public async Task TellAsync()\n    {\n        await bus.PostAsync("/payments", 1);\n    }\n}\n';
  assert.doesNotMatch(steps('Notifier.cs', bus, 'TellAsync').join('\n'), /Sends a POST request/);
});

test("Python's standard-library server: do_POST and the one path it checks are a route; two paths are not guessed", () => {
  const one = 'from http.server import BaseHTTPRequestHandler\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_POST(self):\n        if self.path != "/refunds":\n            return self.send_error(404)\n        self.reply(200)\n';
  const two = 'from http.server import BaseHTTPRequestHandler\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        if self.path == "/a":\n            return self.reply(1)\n        if self.path == "/b":\n            return self.reply(2)\n';
  const t = buildTrace([{ name: 'one', files: [{ path: 'server.py', source: one }] }, { name: 'two', files: [{ path: 'server.py', source: two }] }]);
  assert.deepEqual(t.repos[0].routes.map((r) => `${r.method} ${r.path}`), ['POST /refunds']);
  assert.deepEqual(t.repos[1].routes, []);
});

test('a fetch whose options object spans lines is read whole; a callback opened at the end of a line is not', () => {
  const src = 'export async function send(base: string, body: string) {\n  const response = await fetch(`${base}/refunds`, {\n    method: "POST",\n    body,\n  });\n  return response.json();\n}\n';
  assert.match(steps('a.ts', src, 'send').join('\n'), /Sends a POST request to …\/refunds/);
  const cb = 'export function each(items: number[]) {\n  items.forEach((x) => {\n    console.log(x);\n  });\n}\n';
  assert.doesNotMatch(steps('b.ts', cb, 'each').join('\n'), /items\.forEach\(\(x\) => \{ console/);
});

test('linked across three repositories: TypeScript → C# → Python', () => {
  const web = 'export async function order(base: string) {\n  const r = await fetch(`${base}/orders`, {\n    method: "POST",\n  });\n  return r.json();\n}\n';
  const orders = 'var app = WebApplication.Create();\napp.MapPost("/orders", async (Req req, Svc svc) =>\n{\n    return await svc.PlaceAsync(req);\n});\npublic class Svc\n{\n    public async Task PlaceAsync(Req req)\n    {\n        await http.PostAsync("/charges", Body(req));\n    }\n}\n';
  const billing = 'from http.server import BaseHTTPRequestHandler\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_POST(self):\n        if self.path != "/charges":\n            return self.send_error(404)\n        self.reply(200)\n';
  const t = buildTrace([{ name: 'web', files: [{ path: 'web.ts', source: web }] }, { name: 'orders', files: [{ path: 'Program.cs', source: orders }] }, { name: 'billing', files: [{ path: 'server.py', source: billing }] }]);
  assert.deepEqual(t.links.map((l) => `${l.from.repo}→${l.to.repo} ${l.method} ${l.path}`).sort(), ['orders→billing POST /charges', 'web→orders POST /orders']);
});

test('C# values say what they hold: a filled-in initializer is not empty, 0.08m is 0.08, new() of an object is not empty', () => {
  const src = 'public class Prices\n{\n    public const decimal Rate = 0.08m;\n    public static readonly Dictionary<string, decimal> Unit = new()\n    {\n        ["pen"] = 1.50m,\n    };\n    private readonly List<int> _seen = new();\n    private readonly object _gate = new();\n}\n';
  const knows = Object.fromEntries(thunderModel([{ path: 'Prices.cs', source: src }], { name: 'x' }).things[0].knows.map((k) => [k.name, k.start]));
  assert.equal(knows.Rate, '0.08 at first');
  assert.notEqual(knows.Unit, 'empty at first');
  assert.equal(knows._seen, 'empty at first');
  assert.notEqual(knows._gate, 'empty at first');
});

test('C#: words inside text and a lambda passed as an argument are not methods; a field and its property are one thing', () => {
  const src = 'public class Runner\n{\n    private readonly List<string> _names = new();\n    public IReadOnlyList<string> Names => _names;\n    public async Task RunAsync()\n    {\n        var line = ok ? $"known bug (fails as expected) {name}" : "ok";\n        await Check("prices", async () =>\n        {\n            return await Task.FromResult(true);\n        });\n    }\n    private Task Check(string name, Func<Task<bool>> test) => test();\n}\n';
  const m = thunderModel([{ path: 'Runner.cs', source: src }], { name: 'x' });
  assert.deepEqual(m.members.map((x) => x.name).sort(), ['Check', 'RunAsync']);
  assert.deepEqual(m.things[0].knows.map((k) => k.label), ['names']);
});

test("a folder's big picture does not take one file's description as the whole app's", async () => {
  const { readLevel } = await import('../src/model.mjs');
  const files = [{ path: 'a.py', source: '"""Billing only."""\n\ndef charge(x):\n    return x\n' }, { path: 'b.py', source: 'def ship(x):\n    return x\n' }];
  assert.equal(readLevel(thunderModel(files, { name: 'app' }), 'big-picture').purpose, undefined);
  assert.equal(readLevel(thunderModel(files.slice(0, 1), { name: 'app' }), 'big-picture').purpose, 'Billing only.');
});
