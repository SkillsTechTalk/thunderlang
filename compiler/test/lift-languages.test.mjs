// IntentLift now covers the top languages, not just TS/Rust/Perl. Each adapter must find
// functions, infer inputs, and produce a draft that parses + checks clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftSource, SUPPORTED_LANGUAGES } from '../src/lift.mjs';
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
};

for (const [lang, src] of Object.entries(SAMPLES)) {
  test(`IntentLift lifts ${lang}: finds the function, infers inputs, parses + checks clean`, () => {
    const r = liftSource(src, { language: lang, file: `input.${lang}` });
    assert.equal(r.ok, true, r.error);
    assert.match(r.intentText, /mission CreateInvoice/, `${lang} should name the mission from the function`);
    assert.match(r.intentText, /input/, `${lang} should infer inputs`);
    // the draft is valid IntentLang
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

test('SUPPORTED_LANGUAGES advertises the top languages (>= 10)', () => {
  assert.ok(SUPPORTED_LANGUAGES.length >= 10, `only ${SUPPORTED_LANGUAGES.length}`);
  for (const l of ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'cpp', 'php', 'ruby', 'perl']) {
    assert.ok(SUPPORTED_LANGUAGES.includes(l), `missing ${l}`);
  }
});
