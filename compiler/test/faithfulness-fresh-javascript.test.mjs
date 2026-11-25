// Faithfulness for JavaScript: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3
// (axios, jquery). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText } from './faithfulness-helpers.mjs';

test('axios#6: `bytesSent += chunk.length` adds to a running total; it is never a reset', () => {
  const t = thunderText('a.js', 'function transform(chunk, cb) {\n  bytesSent += chunk.length;\n  cb(null, chunk);\n}\n');
  assert.match(t, /Adds chunk length to bytes sent/);
  assert.doesNotMatch(t, /Sets bytes sent/);
});

test('jquery#15: `return queue || []` gives back the queue (or a new list), not yes or no', () => {
  const t = thunderText('a.js', 'function q(elem, type) {\n  type = ( type || "fx" ) + "queue";\n  var queue = get(elem, type);\n  return queue || [];\n}\n');
  assert.doesNotMatch(t, /whether/);
  // Say less: `||` also skips false, 0, and "" (it is not "when that has no value"), so the ending is its code.
  assert.match(t, /`return queue \|\| \[\];` \(code, not explained\)/);
});

test('a `switch` case `break` leaves the switch, not a loop around it', () => {
  const t = thunderText('a.js', 'function f(xs) {\n  for (const x of xs) {\n    switch (x) {\n      case 1:\n        a();\n        break;\n      default:\n        b();\n    }\n  }\n}\n');
  assert.doesNotMatch(t, /Leaves the loop/);
});
