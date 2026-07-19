// IntentLift now covers the top languages, not just TS/Rust/Perl. Each adapter must find
// functions, infer inputs, and produce a draft that parses + checks clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftSource, SUPPORTED_LANGUAGES, languageForFile } from '../src/lift.mjs';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';

const SAMPLES = {
  python: `def create_invoice(order_id: OrderId, total: Money) -> Invoice:
    if exists(order_id): raise DuplicateInvoice()
    return save(order_id, total)

def test_no_duplicate():
    pass

class DuplicateInvoice(Exception): pass
`,
  java: `public class Inv {
  public Invoice createInvoice(OrderId orderId, Money total) throws DuplicateInvoice {
    if (exists(orderId)) throw new DuplicateInvoice();
    return save(orderId, total);
  }
  @Test void neverDuplicates() {}
}
class DuplicateInvoice extends Exception {}
`,
  csharp: `public class Inv {
  public async Task<Invoice> CreateInvoice(OrderId orderId, Money total) {
    if (Exists(orderId)) throw new DuplicateInvoiceException();
    return await Save(orderId, total);
  }
  [Fact] public void NeverDuplicates() {}
}
class DuplicateInvoiceException : Exception {}
`,
  go: `func CreateInvoice(orderID OrderId, total Money) (Invoice, error) {
  if exists(orderID) { return Invoice{}, errors.New("duplicate invoice") }
  return save(orderID, total)
}
func TestNoDuplicate(t *testing.T) {}
`,
  cpp: `Invoice createInvoice(OrderId orderId, Money total) {
  if (exists(orderId)) throw DuplicateInvoice();
  return save(orderId, total);
}
TEST(Invoice, NeverDuplicates) {}
class DuplicateInvoice {};
`,
  php: `<?php
class Inv {
  public function createInvoice(OrderId $orderId, Money $total): Invoice {
    if (exists($orderId)) throw new DuplicateInvoiceException();
    return save($orderId, $total);
  }
  public function testNeverDuplicates() {}
}
class DuplicateInvoiceException extends Exception {}
`,
  ruby: `def create_invoice(order_id, total)
  raise DuplicateInvoice if exists(order_id)
  save(order_id, total)
end

it "never creates a duplicate" do
end

class DuplicateInvoice < StandardError
end
`,
  kotlin: `fun createInvoice(orderId: OrderId, total: Money): Invoice {
  if (exists(orderId)) throw DuplicateInvoiceException()
  return save(orderId, total)
}
@Test fun neverDuplicates() {}
class DuplicateInvoiceException : Exception()
`,
  scala: `def createInvoice(orderId: OrderId, total: Money): Invoice = {
  if (exists(orderId)) throw new DuplicateInvoiceException()
  save(orderId, total)
}
test("never creates a duplicate") {}
class DuplicateInvoiceException extends Exception
`,
  elixir: `defmodule Invoices do
  def create_invoice(order_id, total) do
    if exists?(order_id), do: raise DuplicateInvoiceError
    save(order_id, total)
  end

  test "never creates a duplicate" do
  end
end

defmodule DuplicateInvoiceError do
  defexception message: "duplicate"
end
`,
};

for (const [lang, src] of Object.entries(SAMPLES)) {
  test(`IntentLift lifts ${lang}: finds the function, infers inputs, parses + checks clean`, () => {
    const r = liftSource(src, { language: lang, file: `input.${lang}` });
    assert.equal(r.ok, true, r.error);
    assert.match(r.intentText, /mission CreateInvoice/, `${lang} should name the mission from the function`);
    assert.match(r.intentText, /input/, `${lang} should infer inputs`);
    // the draft is valid ThunderLang
    const ast = parseIntent(r.intentText);
    assert.equal(ast.mission, 'CreateInvoice');
    const errors = semanticDiagnostics(ast).filter((d) => d.level === 'error');
    assert.deepEqual(errors, [], `${lang} draft should have no errors: ${JSON.stringify(errors)}`);
    // it is humble: never marked verified, always needs review
    assert.match(r.intentText, /needs[_ ]review|review/i);
  });
}

test('the mission has the inferred inputs typed (Java Type-first params resolved)', () => {
  const r = liftSource(SAMPLES.java, { language: 'java', file: 'Inv.java' });
  const ast = parseIntent(r.intentText);
  const names = ast.inputs.map((i) => i.name);
  assert.ok(names.includes('orderId'), `expected orderId in ${JSON.stringify(names)}`);
  assert.ok(names.includes('total'));
});

test('Python def with no matching function still lifts gracefully or reports clearly', () => {
  const r = liftSource('x = 1\n', { language: 'python', file: 'x.py' });
  // no function => not ok, with a clear message (mirrors the other adapters)
  assert.equal(r.ok, false);
  assert.match(r.error, /No functions/i);
});

test('SUPPORTED_LANGUAGES advertises the top languages (>= 14, incl. Kotlin/Scala/Elixir)', () => {
  assert.ok(SUPPORTED_LANGUAGES.length >= 14, `only ${SUPPORTED_LANGUAGES.length}`);
  for (const l of ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'cpp', 'php', 'ruby', 'perl', 'kotlin', 'scala', 'elixir']) {
    assert.ok(SUPPORTED_LANGUAGES.includes(l), `missing ${l}`);
  }
});

test('languageForFile maps the new JVM/BEAM extensions', () => {
  assert.equal(languageForFile('Invoice.kt'), 'kotlin');
  assert.equal(languageForFile('build.gradle.kts'), 'kotlin');
  assert.equal(languageForFile('Invoice.scala'), 'scala');
  assert.equal(languageForFile('script.sc'), 'scala');
  assert.equal(languageForFile('invoices.ex'), 'elixir');
  assert.equal(languageForFile('invoices_test.exs'), 'elixir');
});

import { liftAll } from '../src/lift.mjs';

test('liftAll lifts every function into its own mission (the Atlas view)', () => {
  const py = `def request(method, url): ...
def get(url): ...
def post(url, data): ...
def _internal_helper(x): ...
`;
  const r = liftAll(py, { language: 'python', file: 'api.py' });
  assert.equal(r.ok, true);
  const names = r.missions.map((m) => m.fn);
  assert.ok(names.includes('request') && names.includes('get') && names.includes('post'));
  assert.ok(!names.includes('_internal_helper'), 'publicOnly drops underscore-private');
});

test('liftAll publicOnly keeps exported Go names, drops main/init/unexported', () => {
  const go = `func NewRouter() *Router { return nil }
func main() {}
func init() {}
func (r *Router) Match(req *Request) bool { return true }
func copyConf(c conf) conf { return c }
`;
  const names = liftAll(go, { language: 'go', file: 'mux.go' }).missions.map((m) => m.fn);
  assert.ok(names.includes('NewRouter') && names.includes('Match'));
  assert.ok(!names.includes('main') && !names.includes('init') && !names.includes('copyConf'));
});

test('liftAll publicOnly:false keeps everything', () => {
  const go = `func main() {}\nfunc Exported() {}\n`;
  assert.equal(liftAll(go, { language: 'go', publicOnly: false }).count, 2);
});

test('liftAll on no functions is a clear failure', () => {
  assert.equal(liftAll('x = 1\n', { language: 'python' }).ok, false);
});
