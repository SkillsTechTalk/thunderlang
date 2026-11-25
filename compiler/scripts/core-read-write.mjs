#!/usr/bin/env node
// Read <-> write check: does the Thunder Text the reader prints for a Python function already parse as Thunder
// Core? For 20 small functions it shows the reader's text next to the Core a person would write, and measures:
//   - whole functions: does the reader's text compile as Core, unchanged?
//   - step lines: does each step line parse as one Core statement, once the bullet "- " and "(line N)" are removed?
// It also checks that every hand-written Core version compiles. Writes docs/core-read-write.md.
//
//   node scripts/core-read-write.mjs [--check]   (--check: exit 1 if the doc is out of date)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { thunderModel, readLevel } from '../src/model.mjs';
import { compileCore, parseCore } from '../src/core/index.mjs';

export const CASES = [
  ['calculate_discount', `def calculate_discount(total, member):
    if member and total >= 100:
        return total * 0.2
    return 0`, `To calculate discount:
  Receive total and member
  When member is true and total is at least 100:
    Give total * 0.2
  Give 0`],
  ['greet', `def greet(name):
    print(f"Hello, {name}!")`, `To greet:
  Receive name
  say "Hello, {name}!"`],
  ['total_paid', `def total_paid(orders):
    total = 0
    for o in orders:
        if o.paid:
            total += o.price
    return total`, `To total paid:
  Receive orders
  Set total to 0
  For each order in orders:
    When order's paid is true:
      Increase total by order's price
  Give total`],
  ['is_adult', `def is_adult(age):
    return age >= 18`, `To check adult:
  Receive age
  Give age is at least 18`],
  ['biggest', `def biggest(x, y, z):
    if x >= y and x >= z:
        return x
    elif y >= z:
        return y
    else:
        return z`, `To biggest:
  Receive x, y and z
  When x is at least y and x is at least z:
    Give x
  Otherwise when y is at least z:
    Give y
  Otherwise:
    Give z`],
  ['fizzbuzz', `def fizzbuzz(n):
    for i in range(1, n + 1):
        if i % 15 == 0:
            print("FizzBuzz")
        elif i % 3 == 0:
            print("Fizz")
        elif i % 5 == 0:
            print("Buzz")
        else:
            print(i)`, `To fizzbuzz:
  Receive n
  For each i from 1 to n:
    When i mod 15 is 0:
      say "FizzBuzz"
    Otherwise when i mod 3 is 0:
      say "Fizz"
    Otherwise when i mod 5 is 0:
      say "Buzz"
    Otherwise:
      say i`],
  ['average', `def average(numbers):
    return sum(numbers) / len(numbers)`, `To average:
  Receive numbers
  Give the sum of numbers / the count of numbers`],
  ['count_words', `def count_words(text):
    counts = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    return counts`, `To count words:
  Receive text
  Set counts to an empty map
  For each word in the words of lowercase of text:
    Set counts at word to (counts at word otherwise 0) + 1
  Give counts`],
  ['apply_tax', `TAX = 0.07

def apply_tax(price):
    return price * (1 + TAX)`, `Keep tax at 7%

To apply tax:
  Receive price
  Give price * (1 + tax)`],
  ['shipping_cost', `def shipping_cost(weight):
    if weight > 10:
        return 15
    elif weight > 5:
        return 10
    else:
        return 5`, `To shipping cost:
  Receive weight
  When weight is more than 10:
    Give 15
  Otherwise when weight is more than 5:
    Give 10
  Otherwise:
    Give 5`],
  ['safe_divide', `def safe_divide(x, y):
    try:
        return x / y
    except ZeroDivisionError:
        return None`, `To safe divide:
  Receive x and y
  Give x / y
  If this fails:
    Give nothing`],
  ['withdraw', `def withdraw(balance, amount):
    if amount > balance:
        raise ValueError("Insufficient funds")
    return balance - amount`, `To withdraw:
  Receive balance and amount
  When amount is more than balance:
    Stop with "Insufficient funds"
  Give balance - amount`],
  ['countdown', `def countdown(n):
    while n > 0:
        print(n)
        n -= 1`, `To countdown:
  Receive n
  Repeat while n is more than 0:
    say n
    Decrease n by 1`],
  ['sum_up', `def sum_up(n):
    total = 0
    for i in range(1, n + 1):
        total += i
    return total`, `To sum up:
  Receive n
  Set total to 0
  For each i from 1 to n:
    Increase total by i
  Give total`],
  ['paid_orders', `def paid_orders(orders):
    return [o for o in orders if o.paid]`, `To paid orders:
  Receive orders
  Give orders where paid is true`],
  ['cheapest_first', `def cheapest_first(items):
    return sorted(items, key=lambda i: i.price)`, `To cheapest first:
  Receive items
  Give items sorted by price`],
  ['grade', `def grade(score):
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    return "F"`, `To grade:
  Receive score
  When score is at least 90:
    Give "A"
  When score is at least 80:
    Give "B"
  When score is at least 70:
    Give "C"
  Give "F"`],
  ['full_name', `def full_name(first, last):
    return f"{first} {last}"`, `To full name:
  Receive first and last
  Give "{first} {last}"`],
  ['is_empty_cart', `def is_empty_cart(cart):
    return len(cart) == 0`, `To check empty cart:
  Receive cart
  Give cart is empty`],
  ['clamp', `def clamp(value, low, high):
    if value < low:
        return low
    if value > high:
        return high
    return value`, `To clamp:
  Receive value, low and high
  When value is less than low:
    Give low
  When value is more than high:
    Give high
  Give value`],
];

const stepOf = (line) => line.replace(/^\s*-\s*/, '').replace(/\s+\(line \d+\)\s*$/, '').trim();
const STRUCTURE = /^(You give it:|Yes:|No:|No: continue|For each:|Otherwise[,:]?)/;

// What kind of reader line is this (the first words), for the gap list.
function shapeOf(step) {
  if (/^`/.test(step)) return 'code shown as code (`…` (code, not explained))';
  if (/^If .* goes wrong:$/.test(step)) return 'If … goes wrong:';
  const m = step.match(/^(Ask:|Answer:|Sets|Gives back|Adds|For each|Writes a log or message|Calls|Stop:|Stops|Repeats|While|Loops|Tries|Subtracts|Removes|Stores|Keeps|Uses|Creates|Changes)/);
  return m ? m[1] : step.split(/\s+/).slice(0, 2).join(' ');
}

// The mechanical rewrites the reader can adopt first (verb forms and punctuation only; no new meaning).
export const REWRITES = [
  [/^Sets (.+?) to (.+)$/, 'Set $1 to $2'],
  [/^Gives back (.+)$/, 'Give $1'],
  [/^Answer: (.+)$/, 'Give $1'],
  [/^Repeats while (.+)$/, 'Repeat while $1:'],
  [/^For each (.+?) in (.+)$/, 'For each $1 in $2:'],
  [/^Subtracts (.+?) from (.+)$/, 'Decrease $2 by $1'],
  [/^Adds (.+?) to (.+)$/, 'Increase $2 by $1'],
  [/^Ask: (.+)\?$/, 'When $1:'],
];
const rewrite = (s) => { for (const [re, to] of REWRITES) if (re.test(s)) return s.replace(re, to); return s; };
const parsesAsStatement = (s) => {
  // A header line ("When …:") needs a body to parse; give it one.
  const src = s.endsWith(':') ? `${s}\n  say 1` : s;
  const p = parseCore(src);
  return !p.diagnostics.length && p.body.length === 1 && p.body[0].k !== 'unknownVerb';
};

export function measure() {
  const rows = [];
  const lineStats = { total: 0, parse: 0, afterRewrite: 0 };
  const gaps = new Map();
  for (const [name, python, core] of CASES) {
    const model = thunderModel([{ path: `${name}.py`, source: python }]);
    const member = model.members.find((m) => m.name === name || m.id.includes(`#${name}#`)) ?? model.members.find((m) => m.kind !== 'setup');
    const text = member ? readLevel(model, 'text', member.id, { full: true }).text.trimEnd() : '(the reader did not read this function)';
    const whole = compileCore(text).ok;
    const steps = text.split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !STRUCTURE.test(l)).map(stepOf);
    let parsed = 0;
    for (const s of steps) {
      const ok = parsesAsStatement(s);
      if (parsesAsStatement(rewrite(s))) lineStats.afterRewrite++;
      if (ok) parsed++;
      else { const k = shapeOf(s); const g = gaps.get(k) ?? { count: 0, example: s }; g.count++; gaps.set(k, g); }
    }
    lineStats.total += steps.length;
    lineStats.parse += parsed;
    const coreResult = compileCore(core);
    rows.push({ name, python, text, core, whole, steps: steps.length, parsed, coreOk: coreResult.ok, coreDiagnostics: coreResult.diagnostics });
  }
  return { rows, lineStats, gaps: [...gaps].sort((a, b) => b[1].count - a[1].count) };
}

const fence = (lang, s) => `\`\`\`${lang}\n${s}\n\`\`\``;

export function renderDoc({ rows, lineStats, gaps }) {
  const whole = rows.filter((r) => r.whole).length;
  const coreOk = rows.filter((r) => r.coreOk).length;
  const pct = lineStats.total ? Math.round((100 * lineStats.parse) / lineStats.total) : 0;
  const out = [
    '# Read ↔ write: how close is the reader\'s Thunder Text to Thunder Core?',
    '',
    '> Generated by `node compiler/scripts/core-read-write.mjs`. Do not edit by hand; run the script again.',
    '',
    'Thunder\'s rule is that **reading and writing are the same language**: the Thunder Text the reader prints for a',
    'function should be Thunder Core a person can edit and compile back. This page measures how far we are, on 20',
    'small Python functions, so the next step (moving the reader\'s output toward Core) has a concrete list.',
    '',
    '## Results',
    '',
    '| Measure | Result |',
    '| --- | --- |',
    `| Reader's text compiles as Core, unchanged (whole function) | **${whole} of ${rows.length}** |`,
    `| Reader's step lines that parse as a Core statement (bullet and "(line N)" removed) | **${lineStats.parse} of ${lineStats.total}** (${pct}%) |`,
    `| The same step lines after ${REWRITES.length} mechanical rewrites (verb forms and ":" only, listed below) | **${lineStats.afterRewrite} of ${lineStats.total}** (${lineStats.total ? Math.round((100 * lineStats.afterRewrite) / lineStats.total) : 0}%) |`,
    `| Hand-written Core versions that compile | **${coreOk} of ${rows.length}** |`,
    '',
    'No reader output compiles as Core today. That is expected: the reader was built to *describe* code (third',
    'person, "Sets total to 0", "Gives back 0"), and Core is written as instructions ("Set total to 0", "Give 0").',
    'The gap is mostly mechanical, listed below by how often each shape appears.',
    '',
    '## Gap list (reader line shapes that do not parse as Core)',
    '',
    '| Reader shape | Lines | Example | What Core writes | How the reader converges |',
    '| --- | --- | --- | --- | --- |',
  ];
  const fix = {
    'Ask:': ['`When <condition>:` … `Otherwise:`', 'Print a question as `When …:` with the Yes branch indented under it and the No branch as `Otherwise:`; keep "Ask" only in the picture.'],
    'Sets': ['`Set <name> to <value>`', 'Imperative verb ("Set", not "Sets"). Same words otherwise.'],
    'Gives back': ['`Give <value>`', 'Print "Give"; Core also accepts "Give back".'],
    'Adds': ['`Increase <name> by <value>` / `Add <item> to <list>`', 'Print "Increase total by o price" for numbers and "Add … to …" for lists; possessives become `o\'s price`.'],
    'For each': ['`For each <item> in <list>:`', 'Add the closing ":" and drop the separate "For each:" line; a `range(...)` loop becomes `For each i from 1 to n:`.'],
    'Writes a log or message': ['`say <value>`', 'A print/log call becomes `say "…"` with `{name}` holes (already the reader\'s text style).'],
    'code shown as code (`…` (code, not explained))': ['the expression itself', 'Expressions the reader shows as code (`return total * 0.2`) need the No-loss meaning model to print as Core expressions (`Give total * 0.2`).'],
    'Stop:': ['`Stop with "<message>"`', 'Print `Stop with "Insufficient funds"`; the error kind stays in Details.'],
    'Answer:': ['`Give <value>`', 'In a rule card, an answer is what the function gives back: print `Give "A"`, `Give 15`, `Give yes`.'],
    'Stores': ['`Set <map> at <key> to <value>`', 'Print `Set counts at word to (counts at word otherwise 0) + 1`; needs the meaning model for `.get(k, 0)` (shown as code today).'],
    'Tries': ['the protected statement, then `If this fails:`', 'Core attaches `If this fails:` to the statement before it; the reader should print the protected steps, then `If this fails:` (a block of several steps needs a Core `Try:` block, planned).'],
    'If … goes wrong:': ['`If this fails:`', 'v0 catches every failure; naming the kind of failure (`If dividing fails:`) is planned with error kinds.'],
    'Repeats': ['`Repeat while <condition>:`', 'Imperative verb ("Repeat", not "Repeats") and a closing ":".'],
    'Subtracts': ['`Decrease <name> by <value>`', 'Print "Decrease n by 1".'],
  };
  for (const [shape, g] of gaps) {
    const [core, how] = fix[shape] ?? ['(design needed)', 'See the RFC section "Reading and writing converge".'];
    out.push(`| ${shape.replace(/\|/g, '\\|')} | ${g.count} | \`${g.example.replace(/`/g, '').replace(/\|/g, '\\|').slice(0, 70)}\` | ${core} | ${how} |`);
  }
  out.push('', 'The mechanical rewrites measured above: ', '', ...REWRITES.map(([re, to]) => `- \`${String(re).slice(2, -2)}\` → \`${to}\``), '', 'Lines that still fail after them need the reader to print values as Core expressions (possessives such as `o\'s price`, code shown as code, and "Writes a log or message — calls: print(…)").', '', 'Other differences that are not single lines:', '',
    '- **The title line.** The reader prints `Calculate discount` and `You give it: total, member`; Core writes `To calculate discount:` and `Receive total and member`.',
    '- **Yes/no function names.** Python `is_adult` reads as "Is adult?". "is" is a Thunder word, so Core v0 cannot use it in a name (the Core versions say `check adult`). Next: a `To decide whether <name>:` form that makes a yes/no function, matching the reader\'s question title.',
    '- **Truthiness.** Python `if member:` reads as "Member?"; Core asks for `member is true`, because "truthy" differs between languages. The reader should print the explicit comparison when it knows the value is yes/no.',
    '- **Possessives.** The reader prints `o price`; Core writes `o\'s price` (the reader already uses \'s in some places).',
    '- **Line numbers.** `(line N)` is a link to the original code; Core files have their own lines. Thunder Text keeps them as trailing comments (`# line 4`) once the reader prints Core.',
    '',
    '## The 20 functions', '');
  rows.forEach((r, i) => {
    out.push(`### ${i + 1}. \`${r.name}\``, '', 'Python:', '', fence('python', r.python), '', 'What the reader prints today (Thunder Text):', '', fence('text', r.text), '',
      `Thunder Core a person would write${r.coreOk ? ' (compiles)' : ' (**does not compile yet**)'}:`, '', fence('text', r.core), '',
      `Reader's text compiles as Core: ${r.whole ? 'yes' : 'no'}. Step lines that parse as Core: ${r.parsed} of ${r.steps}.`, '');
    if (!r.coreOk) out.push(`Diagnostics: ${r.coreDiagnostics.map((d) => `${d.code} line ${d.line}: ${d.message}`).join('; ')}`, '');
  });
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const doc = renderDoc(measure());
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'core-read-write.md');
  if (process.argv.includes('--check')) {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur !== doc) { console.error('docs/core-read-write.md is out of date: run node compiler/scripts/core-read-write.mjs'); process.exit(1); }
    console.log('docs/core-read-write.md is up to date.');
  } else {
    writeFileSync(path, doc);
    const m = doc.match(/\*\*(\d+) of (\d+)\*\* \((\d+)%\)/);
    console.log(`wrote docs/core-read-write.md${m ? ` (step lines that parse: ${m[1]} of ${m[2]}, ${m[3]}%)` : ''}`);
  }
}
