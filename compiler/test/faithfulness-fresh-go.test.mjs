// Faithfulness for Go: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3 (gin, fzf),
// plus Go endings from the audit's patterns. The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('gin#13: an `if init; cond` written over lines keeps its whole condition and its body', () => {
  const t = thunderText('a.go', 'package x\n\nfunc F(out io.Writer) bool {\n\tisTerm := true\n\tif w, ok := out.(*os.File); !ok || os.Getenv("TERM") == "dumb" ||\n\t\t(!isatty.IsTerminal(w.Fd()) && !isatty.IsCygwinTerminal(w.Fd())) {\n\t\tisTerm = false\n\t}\n\treturn isTerm\n}\n');
  assert.match(t, /IsCygwinTerminal/);
  assert.equal(sideOf(t, /Ask: .*IsCygwinTerminal/, /Sets is term to false/), 'yes');
});

test('fzf#11: an early return before the rules is part of the answer (no rule card that drops it)', () => {
  const t = thunderText('a.go', 'package x\n\nfunc resolve(layout layoutType, shape tui.BorderShape) tui.BorderShape {\n\tif shape != tui.BorderLine {\n\t\treturn shape\n\t}\n\tif layout == layoutReverse {\n\t\treturn tui.BorderBottom\n\t}\n\treturn tui.BorderTop\n}\n');
  assert.doesNotMatch(t, /: a rule/);
  assert.equal(sideOf(t, /Ask: Is shape the tui's border line\?/, /Gives back shape/), 'no');
});

test('a bare `return` with named results gives back those results, it does not just "stop"', () => {
  const t = thunderText('a.go', 'package x\n\nfunc split(s string) (head, tail string, err error) {\n\tif s == "" {\n\t\terr = errEmpty\n\t\treturn\n\t}\n\thead = s[:1]\n\treturn\n}\n');
  assert.match(t, /Gives back head, tail and err/);
  assert.doesNotMatch(t, /Stops here/);
});

test('`for {` repeats until something leaves; its steps are kept', () => {
  const t = thunderText('a.go', 'package x\n\nfunc f(c chan int) int {\n\tfor {\n\t\tv := <-c\n\t\tif v > 3 {\n\t\t\treturn v\n\t\t}\n\t}\n}\n');
  assert.match(t, /Repeats until something inside leaves the loop/);
  assert.match(t, /Gives back v/);
});
