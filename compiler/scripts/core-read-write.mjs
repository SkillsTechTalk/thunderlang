#!/usr/bin/env node
// Read <-> write check: does the Thunder Text the reader prints for a Python function already parse as Thunder
// Core? For 20 small functions it shows the reader's text next to the Core a person would write, and measures:
//   - whole functions: does the reader's text compile as Core, unchanged?
//   - step lines: does each step line parse as one Core statement, once the bullet "- " and "(line N)" are removed?
// It also checks that every hand-written Core version compiles, and it prints each function as Core from the
// reader's meaning tree (thunder read --as-core), compiles that, and runs it against the original Python on the
// sample inputs below. Writes docs/core-read-write.md.
//
//   node scripts/core-read-write.mjs [--check]   (--check: exit 1 if the doc is out of date)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { thunderModel, readLevel } from '../src/model.mjs';
import { compileCore, parseCore } from '../src/core/index.mjs';
import { pythonToCore } from '../src/core/from-python.mjs';
import { verifyRoundTrip } from '../src/core/round-trip.mjs';
import { findPython } from '../src/core/project.mjs';

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

// Sample inputs for the round trip (Python argument lists; O(...) makes an object with those fields). They cover each
// branch, floats, empty lists, and the error paths.
export const INPUTS = {
  calculate_discount: ['150, True', '99.5, True', '150, False', '100, True'],
  greet: ['"Ada"', '"{x}"'],
  total_paid: ['[O(paid=True, price=1.5), O(paid=False, price=3.25), O(paid=True, price=2.1)]', '[]'],
  is_adult: ['18', '17', '40.5'],
  biggest: ['3, 2, 1', '1, 3, 2', '1, 2, 3', '2, 2, 2'],
  fizzbuzz: ['15', '0'],
  average: ['[1, 2, 3, 4]', '[2.5, 3.5]', '[]'],
  count_words: ['"The cat. the CAT"'],
  apply_tax: ['100', '19.99'],
  shipping_cost: ['11', '10', '6', '5', '0.5'],
  safe_divide: ['6, 3', '1, 0'],
  withdraw: ['100, 30', '100, 100', '10, 30'],
  countdown: ['3', '0'],
  sum_up: ['10', '0', '1'],
  paid_orders: ['[O(paid=True, price=1), O(paid=False, price=2)]', '[]'],
  cheapest_first: ['[O(price=3), O(price=1), O(price=2)]', '[]'],
  grade: ['95', '85', '75', '10', '90'],
  full_name: ['"Ada", "Lovelace"'],
  is_empty_cart: ['[]', '[1]', '""'],
  clamp: ['5, 0, 10', '-1, 0, 10', '11, 0, 10', '0, 0, 10'],
};

// Methods: two small classes. Each method is printed as a Core function that receives the object first, and run next
// to the original on the inputs below (the first input is the object; for a method the object afterwards is compared too).
export const METHOD_CASES = [
  {
    name: 'Account',
    python: `class Account:
    rate = 0.02

    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("amount must be positive")
        self.balance += amount
        return self.balance

    def can_withdraw(self, amount):
        return amount <= self.balance

    def withdraw(self, amount):
        if not self.can_withdraw(amount):
            raise ValueError("insufficient")
        self.balance -= amount

    def interest(self):
        return self.balance * self.rate

    @staticmethod
    def fee(amount):
        return amount * 0.01`,
    calls: [
      ['__init__', 'method', ['Account("a", 1), "b", 7']],
      ['deposit', 'method', ['Account("a", 10), 5', 'Account("a", 10), 0', 'Account("a", 0.1), 0.2']],
      ['can_withdraw', 'method', ['Account("a", 10), 10', 'Account("a", 10), 11']],
      ['withdraw', 'method', ['Account("a", 10), 4', 'Account("a", 10), 50']],
      ['interest', 'method', ['Account("a", 100)', 'Account("a", 0)']],
      ['fee', 'static', ['100', '3.3']],
    ],
  },
  {
    name: 'Cart',
    python: `class Cart:
    def __init__(self):
        self.items = []

    def add(self, item):
        self.items.append(item)

    def total(self):
        total = 0
        for item in self.items:
            total += item.price
        return total

    def is_empty(self):
        return len(self.items) == 0

    def __len__(self):
        return len(self.items)`,
    calls: [
      ['__init__', 'method', ['Cart()']],
      ['add', 'method', ['Cart(), O(price=2)', '(lambda c: (c.items.append(O(price=1)), c)[1])(Cart()), O(price=3)']],
      ['total', 'method', ['(lambda c: (c.items.extend([O(price=1.5), O(price=2.25)]), c)[1])(Cart())', 'Cart()']],
      ['is_empty', 'method', ['Cart()', '(lambda c: (c.items.append(1), c)[1])(Cart())']],
    ],
  },
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

export function measure({ runRoundTrip = !findPython().error } = {}) {
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
    // Printed from the meaning tree (thunder read --as-core), compiled, and run against the original.
    const printed = pythonToCore(python);
    const fn = printed.functions.find((f) => f.name === name) ?? printed.functions[0];
    const printedCompiles = compileCore(printed.core).ok;
    const exact = printedCompiles && !!fn?.exact && !printed.module.notTranslated.length;
    const roundTrip = exact && runRoundTrip ? verifyRoundTrip({ python, core: printed.core, name, inputs: INPUTS[name] ?? [] }) : null;
    rows.push({ name, python, text, core, whole, steps: steps.length, parsed, coreOk: coreResult.ok, coreDiagnostics: coreResult.diagnostics,
      printed: printed.core.trimEnd(), printedCompiles, exact, notTranslated: [...printed.module.notTranslated, ...(fn?.notTranslated ?? [])], assumptions: fn?.assumptions ?? [], roundTrip });
  }
  const classes = METHOD_CASES.map((c) => {
    const printed = pythonToCore(c.python);
    const compiles = compileCore(printed.core).ok;
    const methods = printed.functions.map((f) => {
      const call = c.calls.find(([n]) => n === f.name);
      const rt = f.exact && compiles && call && runRoundTrip ? verifyRoundTrip({ python: c.python, core: printed.core, name: f.name, coreFunction: f.coreName, kind: call[1], cls: c.name, inputs: call[2] }) : null;
      return { name: f.name, coreName: f.coreName, exact: f.exact, notTranslated: f.notTranslated, assumptions: f.assumptions, roundTrip: rt };
    });
    return { name: c.name, python: c.python, printed: printed.core.trimEnd(), compiles, methods };
  });
  return { rows, lineStats, gaps: [...gaps].sort((a, b) => b[1].count - a[1].count), ranRoundTrip: runRoundTrip, classes };
}

const fence = (lang, s) => `\`\`\`${lang}\n${s}\n\`\`\``;

export const RT_START = '<!-- round trip: run by the script when Python 3.10+ is installed -->';
export const RT_END = '<!-- /round trip -->';

export function renderDoc({ rows, lineStats, gaps, ranRoundTrip, classes = [] }) {
  const printedOk = rows.filter((r) => r.printedCompiles).length;
  const exactN = rows.filter((r) => r.exact).length;
  const rtRows = rows.filter((r) => r.roundTrip?.ran);
  const rtSame = rtRows.filter((r) => r.roundTrip.cases.every((c) => c.same)).length;
  const rtCases = rtRows.reduce((n, r) => n + r.roundTrip.cases.length, 0);
  const rtCasesSame = rtRows.reduce((n, r) => n + r.roundTrip.cases.filter((c) => c.same).length, 0);
  const rtTol = rtRows.reduce((n, r) => n + r.roundTrip.cases.filter((c) => c.same && c.tolerance).length, 0);
  const whole = rows.filter((r) => r.whole).length;
  const coreOk = rows.filter((r) => r.coreOk).length;
  const pct = lineStats.total ? Math.round((100 * lineStats.parse) / lineStats.total) : 0;
  const out = [
    '# Read ↔ write: how close is the reader\'s Thunder Text to Thunder Core?',
    '',
    '> Generated by `node compiler/scripts/core-read-write.mjs`. Do not edit by hand; run the script again.',
    '',
    'Thunder\'s rule is that **reading and writing are the same language**: code Thunder reads should come out as',
    'Thunder Core a person can edit and compile back. This page measures that on 20 small Python functions.',
    '',
    '## Printed as Core from the meaning tree (`thunder read <file.py> --as-core`)',
    '',
    'The reader parses Python into a meaning tree. `--as-core` prints that tree as Thunder Core, never from the English',
    'sentences, so each line means what the code means. A line Core cannot say with the same meaning is not rewritten',
    'into something close: it is marked *not translated* and becomes a `Stop with "…"` line, so running it fails',
    'loudly instead of skipping it, and the function is not safe to edit. Then the Core is compiled to Python and run',
    'next to the ORIGINAL function on the sample inputs, comparing the value given back, what is printed, and errors.',
    '',
    '| Measure | Result |',
    '| --- | --- |',
    `| Printed Core that compiles | **${printedOk} of ${rows.length}** |`,
    `| Printed exactly: no line marked not translated | **${exactN} of ${rows.length}** |`,
    RT_START,
    ranRoundTrip
      ? `| Exactly printed functions that give the same results as the original Python on every sample input | **${rtSame} of ${rtRows.length}** (${rtCasesSame} of ${rtCases} inputs${rtTol ? `; ${rtTol} matched within 1e-9 because the Python used binary floats and Core is exact` : ''}) |`
      : '| Same results as the original Python | not run (Python 3.10+ was not found) |',
    RT_END,
    '',
    'Not translated, and why (each is a meaning Core cannot say yet, so Thunder refuses rather than guesses):',
    '',
    ...rows.flatMap((r) => r.notTranslated.map((n) => `- \`${r.name}\`, line ${n.line}: ${n.why}.`)),
    '',
    'Assumptions written next to the Core (kept only for some inputs, never hidden): a Python value used as a',
    'condition (`if member:`) is printed as `member is true`, and the compiled Core stops with an error if the value is',
    'not yes/no, where Python would quietly treat 1, "x", or a non-empty list as true.',
    '',
    '## Methods',
    '',
    'A method is printed as a Core function that receives the object first (Core has functions and records, not',
    'methods): `Account.deposit(self, amount)` becomes `To Account deposit:` with `Receive self and amount`, and',
    '`self.can_withdraw(x)` becomes `Account can withdraw with self and x` (written down as an assumption: a subclass',
    'could replace it). Special methods such as `__len__` change how Python treats the object and are not translated.',
    'Each method is run next to the original, and the object afterwards is compared too.',
    '',
    '| Class | Methods printed exactly | Same results as the original (object afterwards included) |',
    '| --- | --- | --- |',
    ...classes.map((c) => {
      const ex = c.methods.filter((m) => m.exact);
      const ran = ex.filter((m) => m.roundTrip?.ran);
      const cases = ran.reduce((n, m) => n + m.roundTrip.cases.length, 0);
      const same = ran.reduce((n, m) => n + m.roundTrip.cases.filter((x) => x.same).length, 0);
      const tol = ran.reduce((n, m) => n + m.roundTrip.cases.filter((x) => x.same && x.tolerance).length, 0);
      return `| \`${c.name}\` | ${ex.length} of ${c.methods.length}${c.methods.some((m) => !m.exact) ? ` (not: ${c.methods.filter((m) => !m.exact).map((m) => `\`${m.name}\``).join(', ')})` : ''} | ${RT_START} ${ranRoundTrip ? `${ran.filter((m) => m.roundTrip.cases.every((x) => x.same)).length} of ${ran.length} methods, ${same} of ${cases} inputs${tol ? ` (${tol} within 1e-9: Python float, Core exact)` : ''}` : 'not run (Python 3.10+ was not found)'} ${RT_END} |`;
    }),
    '',
    ...classes.flatMap((c) => [`### \`${c.name}\``, '', fence('python', c.python), '', `Printed as Core${c.compiles ? '' : ' (**does not compile**)'}:`, '', fence('text', c.printed), '',
      ...c.methods.filter((m) => !m.exact).map((m) => `- \`${m.name}\` not translated: ${m.notTranslated.map((n) => n.why).join('; ')}.`),
      ...c.methods.flatMap((m) => m.assumptions.map((a) => `- \`${m.name}\` assumes: ${a.says}.`)), '']),
    '## The reader\'s English (Thunder Text)',
    '',
    'Thunder Text describes code for people ("Sets total to 0"); it is not meant to compile. These numbers show how far',
    'its sentences are from Core statements.',
    '',
    '| Measure | Result |',
    '| --- | --- |',
    `| Reader's text compiles as Core, unchanged (whole function) | **${whole} of ${rows.length}** |`,
    `| Reader's step lines that parse as a Core statement (bullet and "(line N)" removed) | **${lineStats.parse} of ${lineStats.total}** (${pct}%) |`,
    `| The same step lines after ${REWRITES.length} mechanical rewrites (verb forms and ":" only, listed below) | **${lineStats.afterRewrite} of ${lineStats.total}** (${lineStats.total ? Math.round((100 * lineStats.afterRewrite) / lineStats.total) : 0}%) |`,
    `| Hand-written Core versions that compile | **${coreOk} of ${rows.length}** |`,
    '',
    'The English is written to *describe* code (third person, "Sets total to 0", "Gives back 0"), and Core is written as',
    'instructions ("Set total to 0", "Give 0"); the Core above is printed from the meaning tree instead.',
    'The remaining sentence shapes are listed below by how often each appears.',
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
      `Reader's text compiles as Core: ${r.whole ? 'yes' : 'no'}. Step lines that parse as Core: ${r.parsed} of ${r.steps}.`, '',
      `Printed as Core by \`thunder read --as-core\` (${r.exact ? 'exact' : r.printedCompiles ? 'compiles; some lines not translated' : '**does not compile**'}):`, '', fence('text', r.printed), '');
    if (r.roundTrip?.ran) out.push(RT_START, `Run next to the original: ${r.roundTrip.cases.filter((c) => c.same).length} of ${r.roundTrip.cases.length} inputs give the same result${r.roundTrip.cases.some((c) => !c.same) ? ` (different: ${r.roundTrip.cases.filter((c) => !c.same).map((c) => `${c.input}: ${c.why}`).join('; ')})` : ''}.`, RT_END, '');
    if (!r.coreOk) out.push(`Diagnostics: ${r.coreDiagnostics.map((d) => `${d.code} line ${d.line}: ${d.message}`).join('; ')}`, '');
  });
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const doc = renderDoc(measure());
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'core-read-write.md');
  if (process.argv.includes('--check')) {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    // Without Python the round-trip lines cannot be measured here; compare everything else.
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const strip = (t) => (findPython().error ? t.replace(new RegExp(`${esc(RT_START)}[\\s\\S]*?${esc(RT_END)}`, 'g'), '').replace(/\n{3,}/g, '\n\n') : t);
    if (strip(cur) !== strip(doc)) { console.error('docs/core-read-write.md is out of date: run node compiler/scripts/core-read-write.mjs'); process.exit(1); }
    console.log('docs/core-read-write.md is up to date.');
  } else {
    writeFileSync(path, doc);
    const m = doc.match(/\*\*(\d+) of (\d+)\*\* \((\d+)%\)/);
    console.log(`wrote docs/core-read-write.md${m ? ` (step lines that parse: ${m[1]} of ${m[2]}, ${m[3]}%)` : ''}`);
  }
}
