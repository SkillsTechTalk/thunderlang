// Faithfulness for Swift: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3
// (Kingfisher, Rectangle). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('Kingfisher#6: `guard self.onShouldApply() else { return }` (a known closure) stops when it is false', () => {
  const t = thunderText('a.swift', 'final class P {\n    var onShouldApply: () -> Bool { get { true } }\n    func received(data: Data) {\n        DispatchQueue.main.async {\n            guard self.onShouldApply() else { return }\n            self.update(data)\n        }\n    }\n}\n');
  const ask = t.split('\n').find((l) => /Ask: .*[Ss]hould apply/.test(l));
  assert.ok(ask, t);
  assert.equal(sideOf(t, /Ask: .*[Ss]hould apply/, /Stops here/), 'no');
});

test('Kingfisher#2: `guard case KingfisherError.responseError = context.error` asks about that case', () => {
  const t = thunderText('a.swift', 'struct R {\n    func retry(context: C) {\n        guard case KingfisherError.responseError = context.error else {\n            handler(.stop)\n            return\n        }\n        handler(.retry)\n    }\n}\n');
  assert.doesNotMatch(t, /Is it kingfisher error\?/);
  assert.match(t, /response error/);
});

test('Kingfisher#12: `do { … }` with no catch is a scope, not error handling', () => {
  const t = thunderText('a.swift', 'class V {\n    func popup() -> Int {\n        do {\n            let title = "x"\n            add(title)\n        }\n        return 1\n    }\n}\n');
  assert.doesNotMatch(t, /handles any error/);
});

test('Rectangle#2: `default: break` in a switch leaves the switch (there is no loop)', () => {
  const t = thunderText('a.swift', 'class M {\n    static func resolve(r: Int) {\n        switch r {\n        case 1:\n            first()\n        default:\n            break\n        }\n    }\n}\n');
  assert.doesNotMatch(t, /Leaves the loop/);
});

test('Rectangle#5: `for x in [ … ] where cond` names the list and keeps the filter', () => {
  const t = thunderText('a.swift', 'class S {\n    func title(processName: String) -> String {\n        for separator in [" — ", " - "] where !processName.isEmpty {\n            use(separator)\n        }\n        return processName\n    }\n}\n');
  assert.doesNotMatch(t, /For each separator in is empty/);
  assert.match(t, /only those where process name is not empty/);
});
