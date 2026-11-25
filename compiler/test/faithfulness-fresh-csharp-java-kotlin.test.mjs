// Faithfulness for C#, Java, and Kotlin: minimal copies of readings graded false (D) in the fresh audit of
// ThunderLang 1.0.3 (eShopOnWeb, spring-petclinic, jsoup, okhttp). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('eShopOnWeb#12 (C#): a list made with items in it is not "an empty list"', () => {
  const t = thunderText('a.cs', 'class A {\n    void F(string userName) {\n        var claims = new List<Claim> { new Claim(ClaimTypes.Name, userName) };\n        Use(claims);\n    }\n}\n');
  assert.doesNotMatch(t, /empty list/);
});

test('C#: `!(x is List<object>)` keeps its side', () => {
  const t = thunderText('a.cs', 'class A {\n    void F(string k) {\n        if (!(headers[k] is List<object>))\n        {\n            headers[k] = Wrap(headers[k]);\n        }\n    }\n}\n');
  assert.equal(sideOf(t, /Ask: Headers\[previous header\]|Ask: Headers\[k\] is List/, /Stores/), 'no');
});

test('petclinic#4 (Java): `@GetMapping({ "/vets" })` is GET /vets', () => {
  const t = thunderText('VetController.java', 'class VetController {\n\t@GetMapping({ "/vets" })\n\tpublic @ResponseBody Vets showResourcesVetList() {\n\t\tVets vets = new Vets();\n\t\treturn vets;\n\t}\n}\n');
  assert.match(t, /GET \/vets/);
});

test('jsoup#15 (Java): `== null` says null, never "empty" (an empty Attributes is not null)', () => {
  const t = thunderText('E.java', 'class E {\n    Attributes cloneAttributes() {\n        if (attributes == null) return null;\n        Attributes clone = attributes.clone();\n        return clone;\n    }\n}\n');
  assert.match(t, /Ask: Is attributes null\?/);
  assert.doesNotMatch(t, /empty/);
});

test('okhttp#8 (Kotlin): a chain with type arguments gives back a list, not "whether"', () => {
  const t = thunderText('a.kt', 'class D {\n  fun lookup(hostname: String): List<InetAddress> {\n    return call(request)\n      .execute()\n      .filterIsInstance<Dns.Record.IpAddress>()\n      .map { it.address }\n  }\n}\n');
  assert.doesNotMatch(t, /whether/);
});
