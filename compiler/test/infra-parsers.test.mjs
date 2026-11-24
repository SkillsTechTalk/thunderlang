// The small HCL and Bicep parsers (no library): values, strings with ${…}, heredocs, for expressions, nested
// resources, decorators, and errors kept with their line while the rest of the file is still read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHcl, docAbove } from '../src/hcl.mjs';
import { parseBicep, splitType } from '../src/bicep.mjs';
import { refsIn, isLiteral, toValue, lineIndex, tokenize } from '../src/infra-expr.mjs';

const attrs = (src) => Object.fromEntries(parseHcl(src).body.filter((x) => x.kind === 'attr').map((a) => [a.name, a.value]));
const paths = (n) => refsIn(n).map((r) => r.path.join('.'));

test('lineIndex gives 1-based lines from character offsets', () => {
  const at = lineIndex('a\nbc\n\nd');
  assert.deepEqual([0, 1, 2, 4, 5, 6].map(at), [1, 1, 2, 2, 3, 4]);
});

test('HCL: blocks with labels, attributes, the comment above, and their lines', () => {
  const r = parseHcl('# The group\n# for the app\nresource "azurerm_resource_group" "rg" {\n  name     = "rg-app"\n  location = var.location\n}\n');
  assert.deepEqual(r.errors, []);
  const b = r.body[0];
  assert.deepEqual([b.kind, b.type, b.labels, b.line, b.endLine, b.doc], ['block', 'resource', ['azurerm_resource_group', 'rg'], 3, 6, 'The group for the app']);
  assert.deepEqual(b.body.map((a) => [a.name, a.value.t, a.line]), [['name', 'str', 4], ['location', 'ref', 5]]);
});

test('HCL: literals, lists, objects, and references are told apart', () => {
  const a = attrs('n = 3\nneg = -1\nb = true\nz = null\ns = "x"\nl = ["a", "b"]\no = { a = 1, "b" = "c" }\nr = aws_s3_bucket.site[0].arn\nsp = aws_instance.web[*].id\n');
  for (const k of ['n', 'neg', 'b', 'z', 's', 'l', 'o']) assert.ok(isLiteral(a[k]), k);
  assert.ok(!isLiteral(a.r));
  assert.deepEqual(a.r.path, ['aws_s3_bucket', 'site', '[0]', 'arn']);
  assert.deepEqual(a.sp.path, ['aws_instance', 'web', '*', 'id']);
  assert.deepEqual(toValue(a.o, ''), { a: 1, b: 'c' });
});

test('HCL: a string with ${…} is a template whose references are read; $${ and escapes are text', () => {
  const a = attrs('t = "${var.prefix}-${local.env}-rg"\nlit = "cost $${x} \\"q\\""\n');
  assert.equal(a.t.template, true);
  assert.deepEqual(paths(a.t), ['var.prefix', 'local.env']);
  assert.equal(a.lit.template, false);
  assert.equal(a.lit.v, 'cost ${x} "q"');
});

test('HCL: heredocs (<<EOF and indented <<-EOT) keep their body and lines', () => {
  const r = parseHcl('p = <<-EOT\n    {"Version": "2012-10-17"}\n  EOT\nq = <<EOF\nhello ${var.name}\nEOF\nafter = 1\n');
  const a = Object.fromEntries(r.body.map((x) => [x.name, x]));
  assert.equal(a.p.value.v, '{"Version": "2012-10-17"}\n');
  assert.deepEqual(paths(a.q.value), ['var.name']);
  assert.equal(a.after.line, 7);
});

test('HCL: for expressions, conditionals, calls across lines with trailing commas, and the variables a for binds', () => {
  const a = attrs([
    'names = [for n in var.names : upper(n) if n != ""]',
    'm = { for k, v in var.m : k => v... }',
    'c = var.on ? 1 : 0',
    'x = max(',
    '  local.a,',
    '  local.b,',
    ')',
    'nested = [for x in y : x',
    '  if !contains([',
    '    for e in z : e.c',
    '  ], x)',
    ']',
  ].join('\n'));
  assert.equal(a.names.t, 'for');
  assert.deepEqual(paths(a.names), ['var.names']); // n is bound by the for, not a reference
  assert.equal(a.m.kind, 'obj');
  assert.equal(a.c.t, 'cond');
  assert.deepEqual(a.x.args.map((x) => x.path.join('.')), ['local.a', 'local.b']);
  assert.deepEqual(paths(a.nested), ['y', 'z']);
});

test('HCL: a block that cannot be parsed is reported with its line and skipped; the rest is read', () => {
  const r = parseHcl('resource "a_b" "one" {\n  x = = 1\n}\n\nresource "a_b" "two" {\n  y = 2\n}\n');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].line, 2);
  assert.deepEqual(r.body.map((b) => b.labels[1]), ['two']);
});

test('HCL: single-line blocks, nested blocks, and dynamic blocks', () => {
  const r = parseHcl('resource "x_y" "z" {\n  lifecycle { prevent_destroy = true }\n  dynamic "rule" {\n    for_each = var.rules\n    content {\n      port = rule.value\n    }\n  }\n}\n');
  assert.deepEqual(r.errors, []);
  const body = r.body[0].body;
  assert.deepEqual(body.map((b) => [b.type, b.labels]), [['lifecycle', []], ['dynamic', ['rule']]]);
  assert.equal(body[0].body[0].name, 'prevent_destroy');
});

test('docAbove joins the comment lines just above a line, and leaves out tool pragmas', () => {
  const { comments } = tokenize('# one\n# two\n\n# tflint-ignore: x\nx', 'hcl');
  assert.equal(docAbove(comments, 3), 'one two');
  assert.equal(docAbove(comments, 5), '');
});

test('Bicep: declarations with decorators, types, defaults, and the comment above', () => {
  const r = parseBicep([
    "targetScope = 'subscription'",
    '// The admin password',
    '@secure()',
    "@description('Never shown')",
    'param adminPassword string',
    "param location string = deployment().location",
    'param tags object = {',
    "  env: 'prod'",
    '}',
    'var flagged bool = false',
    "output id string = rg.id",
  ].join('\n'));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.decls.map((d) => [d.kind, d.name, d.line]), [['targetScope', 'targetScope', 1], ['param', 'adminPassword', 3], ['param', 'location', 6], ['param', 'tags', 7], ['var', 'flagged', 10], ['output', 'id', 11]]);
  const p = r.decls[1];
  assert.deepEqual(p.decorators.map((d) => d.name), ['secure', 'description']);
  assert.equal(p.doc, 'The admin password');
  assert.equal(p.typeRaw, 'string');
});

test('Bicep: resources with their type and version, existing, nested resources, loops, and conditions', () => {
  const r = parseBicep([
    "resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {",
    "  name: 'st${uniqueString(resourceGroup().id)}'",
    '  properties: {',
    '    allowBlobPublicAccess: false',
    '  }',
    '  @batchSize(1)',
    "  resource blobs 'blobServices' = {",
    "    name: 'default'",
    '  }',
    '}',
    "resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {",
    "  name: 'kv'",
    '}',
    "resource ra 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (p, i) in principals: if (p != '') {",
    '  name: guid(p)',
    '}]',
    "module net './net.bicep' = if (deploy) {",
    "  name: 'net'",
    '}',
  ].join('\n'));
  assert.deepEqual(r.errors, []);
  const [st, kv, ra, net] = r.decls;
  assert.deepEqual([st.type, st.apiVersion, st.line, st.endLine], ['Microsoft.Storage/storageAccounts', '2023-01-01', 1, 10]);
  const nested = st.value.entries.find((e) => e.nested).nested;
  assert.deepEqual([nested.name, nested.type, nested.decorators.map((d) => d.name)], ['blobs', 'blobServices', ['batchSize']]);
  assert.equal(kv.existing, true);
  assert.equal(ra.value.t, 'for');
  assert.deepEqual(ra.value.vars, ['p', 'i']);
  assert.equal(ra.value.value.t, 'if');
  assert.equal(net.path, './net.bicep');
  assert.equal(net.value.t, 'if');
  assert.deepEqual(splitType('Microsoft.Web/sites@2023-01-01'), { type: 'Microsoft.Web/sites', apiVersion: '2023-01-01' });
});

test('Bicep: safe access, non-null assertions, ternaries across lines, lambdas, spreads, and union types', () => {
  const r = parseBicep([
    'var a = settings.?identity.?principalId',
    "var b = last(split(id!, '/'))!",
    'var c = (sku == \'free\')',
    "  ? 'off'",
    '  : sku',
    'var d = map(items, x => x.name)',
    'var e = { ...base, extra: true }',
    'type mode =',
    "  | 'on'",
    "  | 'off'",
    "var f = storage::blobs.id",
    '#disable-next-line no-unused-vars',
    "var g = 'ok'",
  ].join('\n'));
  assert.deepEqual(r.errors, []);
  const v = Object.fromEntries(r.decls.map((d) => [d.name, d]));
  assert.deepEqual(v.a.value.path, ['settings', 'identity', 'principalId']);
  assert.equal(v.b.value.t, 'call');
  assert.equal(v.c.value.t, 'cond');
  assert.equal(v.d.value.args[1].t, 'lambda');
  assert.ok(v.e.value.entries[0].spread);
  assert.equal(v.mode.kind, 'type');
  assert.deepEqual(v.f.value.path, ['storage', 'blobs', 'id']);
  assert.equal(v.g.value.v, 'ok');
  assert.equal(v.g.line, 13);
});

test('Bicep: multi-line strings and escapes', () => {
  const r = parseBicep("var s = '''\nline one\nline two'''\nvar t = 'it\\'s ${name}'\n");
  const [s, t] = r.decls;
  assert.equal(s.value.v, 'line one\nline two');
  assert.equal(t.value.template, true);
  assert.deepEqual(paths(t.value), ['name']);
});

test('Bicep: a declaration that cannot be parsed is reported and skipped', () => {
  const r = parseBicep("param ok string\nvar broken = (1 +\nparam after int = 3\n");
  assert.ok(r.errors.length >= 1);
  assert.ok(r.decls.some((d) => d.name === 'ok'));
});

test('both parsers stay linear on long input (no backtracking)', () => {
  const big = Array.from({ length: 4000 }, (_, i) => `resource "aws_s3_bucket" "b${i}" {\n  bucket = "b-${i}-\${var.env}"\n  tags = { n = ${i} }\n}\n`).join('');
  const t0 = performance.now();
  const r = parseHcl(big);
  assert.equal(r.body.length, 4000);
  const bicep = Array.from({ length: 4000 }, (_, i) => `resource s${i} 'Microsoft.Storage/storageAccounts@2023-01-01' = {\n  name: 'st${i}'\n}\n`).join('');
  assert.equal(parseBicep(bicep).decls.length, 4000);
  assert.ok(performance.now() - t0 < 3000, 'parses 8,000 declarations in well under 3 seconds');
  // A long unclosed string does not hang.
  assert.ok(parseHcl(`x = "${'a'.repeat(200000)}\n`).body.length <= 1);
});
