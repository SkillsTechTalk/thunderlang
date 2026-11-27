// ThunderBench questions: the same small programs in Thunder and in Python (programs/), and questions a person
// answers by reading one of them. Every answer is COMPUTED by running both programs (run.mjs); a question whose two
// programs disagree fails the benchmark, so the pairs are proven to mean the same thing on every question.
//
// Kinds of question:
//   predict   "What does it give for …?"            answer: the program's output
//   change    "Which line would you change to …?"   answer: the line that holds `find` (exactly one in each file)
//
// Inputs are written once per language, in that language's own syntax.

export const PROGRAMS = [
  {
    id: 'refund',
    thunder: { file: 'refund.thunder', call: 'decide refund' },
    python: { file: 'refund.py', call: 'decide_refund' },
    questions: [
      { kind: 'predict', ask: 'A $100 refund, 12 days after purchase, never refunded before. What happens?', thunder: '100, 12 and false', python: '100, 12, False' },
      { kind: 'predict', ask: 'A $100.01 refund, 12 days after purchase, never refunded before. What happens?', thunder: '100.01, 12 and false', python: '100.01, 12, False' },
      { kind: 'predict', ask: 'A $20 refund, 31 days after purchase, never refunded before. What happens?', thunder: '20, 31 and false', python: '20, 31, False' },
      { kind: 'predict', ask: 'A $5 refund, 1 day after purchase, but the order was already refunded. What happens?', thunder: '5, 1 and true', python: '5, 1, True' },
      { kind: 'change', ask: 'The company now approves refunds up to $150 on their own. Which line changes?', find: '100' },
    ],
  },
  {
    id: 'shipping',
    thunder: { file: 'shipping.thunder', call: 'calculate shipping' },
    python: { file: 'shipping.py', call: 'calculate_shipping' },
    questions: [
      { kind: 'predict', ask: 'A 4 kg parcel, standard delivery. What does shipping cost?', thunder: '4 and false', python: '4, False' },
      { kind: 'predict', ask: 'A 10 kg parcel, express delivery. What does shipping cost?', thunder: '10 and true', python: '10, True' },
      { kind: 'predict', ask: 'An 11 kg parcel, express delivery. What does shipping cost?', thunder: '11 and true', python: '11, True' },
      { kind: 'change', ask: 'Express delivery should cost three times as much, not twice. Which line changes?', find: '* 2' },
    ],
  },
  {
    id: 'loyalty',
    thunder: { file: 'loyalty.thunder', call: 'count points' },
    python: { file: 'loyalty.py', call: 'count_points' },
    questions: [
      { kind: 'predict', ask: 'A customer of 1 year spends $40. How many points?', thunder: '40 and 1', python: '40, 1' },
      { kind: 'predict', ask: 'A customer of 2 years spends $40. How many points?', thunder: '40 and 2', python: '40, 2' },
      { kind: 'predict', ask: 'A customer of 5 years spends $40. How many points?', thunder: '40 and 5', python: '40, 5' },
      { kind: 'change', ask: 'Long-time members should start at 3 years, not 5. Which line changes?', find: '5' },
    ],
  },
  {
    id: 'password',
    thunder: { file: 'password.thunder', call: 'check password' },
    python: { file: 'password.py', call: 'check_password' },
    questions: [
      { kind: 'predict', ask: 'What does it say about "sunshine12"?', thunder: '"sunshine12"', python: '"sunshine12"' },
      { kind: 'predict', ask: 'What does it say about "Sun shine"?', thunder: '"Sun shine"', python: '"Sun shine"' },
      { kind: 'predict', ask: 'What does it say about "Short1"?', thunder: '"Short1"', python: '"Short1"' },
      { kind: 'predict', ask: 'What does it say about "Sunshine1"?', thunder: '"Sunshine1"', python: '"Sunshine1"' },
      { kind: 'change', ask: 'Passwords must now be at least 12 characters. Which line changes?', find: '8' },
    ],
  },
  {
    id: 'grades',
    thunder: { file: 'grades.thunder', call: 'grade' },
    python: { file: 'grades.py', call: 'grade' },
    questions: [
      { kind: 'predict', ask: 'Scores 95, 85, and -1 (a missed test). What grade?', thunder: '[95, 85, -1]', python: '[95, 85, -1]' },
      { kind: 'predict', ask: 'Scores 79 and 80. What grade?', thunder: '[79, 80]', python: '[79, 80]' },
      { kind: 'predict', ask: 'Only a missed test (-1). What grade?', thunder: '[-1]', python: '[-1]' },
      { kind: 'change', ask: 'A "B" should need 85, not 80. Which line changes?', find: '80' },
    ],
  },
  {
    id: 'invoice',
    thunder: { file: 'invoice.thunder', call: 'total invoice' },
    python: { file: 'invoice.py', call: 'total_invoice' },
    questions: [
      { kind: 'predict', ask: 'Items of $120.50 and $99.50, tax 7%. What does the customer pay?', thunder: '[120.50, 99.50] and 0.07', python: '[Decimal("120.50"), Decimal("99.50")], Decimal("0.07")' },
      { kind: 'predict', ask: 'One item of $19.99, tax 7%. What does the customer pay?', thunder: '[19.99] and 0.07', python: '[Decimal("19.99")], Decimal("0.07")' },
      { kind: 'predict', ask: 'Items of $100 and $99.99, tax 10%. What does the customer pay?', thunder: '[100, 99.99] and 0.10', python: '[Decimal("100"), Decimal("99.99")], Decimal("0.10")' },
      { kind: 'change', ask: 'The big-order discount should start at $250. Which line changes?', find: '200' },
    ],
  },
];

// The honesty corpus: Python that Thunder Core cannot say with the same meaning (yet). Reading it as Core must mark
// each one "not translated" and never print something close but different. Each entry says why it is different.
export const HONESTY = [
  { name: 'banker', why: 'Python round() rounds halves to even; Thunder rounds half up', python: 'def banker(x):\n    return round(x)\n' },
  { name: 'floor_div', why: 'floor division', python: 'def floor_div(a, b):\n    return a // b\n' },
  { name: 'safe', why: 'an error handler that names its error kinds', python: 'def safe(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return 0\n' },
  { name: 'first_word', why: 'split with a maximum number of parts', python: 'def first_word(s):\n    return s.split(" ", 1)[0]\n' },
  { name: 'longest', why: 'max with a key function', python: 'def longest(words):\n    return max(words, key=len)\n' },
  { name: 'starts', why: 'startswith with a tuple of choices', python: 'def starts(s):\n    return s.startswith(("a", "b"))\n' },
  { name: 'replace_once', why: 'replace with a count', python: 'def replace_once(s):\n    return s.replace("a", "b", 1)\n' },
];
