// The ThunderLang tutorial. Each lesson is a small, real contract that compiles in the browser.
// compiler/test/learn-lessons.test.mjs proves every lesson compiles, its examples pass, and each
// "Try this" edit produces the outcome the lesson promises.

/**
 * @typedef {{
 *   slug: string, title: string, idea: string, picture: string,
 *   words: { word: string, means: string }[],
 *   source: string,
 *   tryThis: { prompt: string, find: string, replace: string, expect: string, breaksExamples: boolean },
 * }} Lesson
 * idea: one idea in plain words. picture: the mental model. tryThis.breaksExamples: the edit is
 * meant to make an example fail (the failure is the lesson).
 */

/** @type {Lesson[]} */
export const LESSONS = [
  {
    slug: "a-rule",
    title: "Say the rule in plain words",
    idea: "A contract names one business rule. A decision is a question with named inputs, and each when line answers it.",
    picture: "A decision is a short flowchart you can read top to bottom: check a condition, give an answer; otherwise, the fallback answer.",
    words: [
      { word: "contract", means: "Names the rule you are writing." },
      { word: "purpose", means: "One sentence a teammate could check." },
      { word: "decision", means: "The question, with its inputs and their types." },
      { word: "when ... ->", means: "If the condition is true, this is the answer." },
      { word: "otherwise", means: "The answer when no rule matched." },
    ],
    source: `contract Shipping
purpose Orders of $50 or more ship free.

decision ShippingFee(total: number)
  when total >= 50 -> Free
  otherwise -> Standard

examples ShippingFee
  case "a big order": (total: 80) -> Free
  case "a small order": (total: 20) -> Standard
`,
    tryThis: {
      prompt: "Raise the free-shipping threshold to $75.",
      find: "when total >= 50",
      replace: "when total >= 75",
      expect: "Every language updates at once: 50 becomes 75 in TypeScript, Python, Go, Rust, C#, and Java. You changed the rule in one place.",
      breaksExamples: false,
    },
  },
  {
    slug: "examples",
    title: "Examples prove the rule",
    idea: "Examples are real inputs with the answer you expect. ThunderLang runs every one, so a wrong rule shows up immediately.",
    picture: "Examples are the edges of a ruler. The most useful one sits exactly on the line, where off-by-one mistakes hide.",
    words: [
      { word: "examples", means: "A list of cases for one decision." },
      { word: "case \"name\"", means: "A readable name, so a failure says what broke." },
      { word: "(total: 50)", means: "Every input, named. Missing is not the same as zero." },
      { word: "-> Free", means: "The answer this case must get." },
    ],
    source: `contract Shipping
purpose Orders of $50 or more ship free.

decision ShippingFee(total: number)
  when total >= 50 -> Free
  otherwise -> Standard

examples ShippingFee
  case "a big order": (total: 80) -> Free
  case "exactly $50": (total: 50) -> Free
  case "just under": (total: 49.99) -> Standard
`,
    tryThis: {
      prompt: "Make a classic mistake: change >= to >.",
      find: "total >= 50",
      replace: "total > 50",
      expect: "The \"exactly $50\" example fails. The rule still looks reasonable, but the example on the line caught it.",
      breaksExamples: true,
    },
  },
  {
    slug: "combine",
    title: "Combine conditions",
    idea: "Use and, or, and not to build a condition, and parentheses to group it, the same way you would say it out loud.",
    picture: "Read and as \"both\", or as \"either\", and not as \"the opposite\". Parentheses are the pause in the sentence.",
    words: [
      { word: "and", means: "Both sides must be true." },
      { word: "or", means: "Either side is enough." },
      { word: "not", means: "Flips true and false." },
      { word: "( ... )", means: "Group a part so it is decided first." },
    ],
    source: `contract Shipping
purpose Members and orders of $50 or more ship free, unless the item is oversized.

decision ShippingFee(total: number, member: boolean, oversized: boolean)
  when (total >= 50 or member) and not oversized -> Free
  otherwise -> Standard

examples ShippingFee
  case "member, small order": (total: 10, member: true, oversized: false) -> Free
  case "big order": (total: 90, member: false, oversized: false) -> Free
  case "oversized sofa": (total: 900, member: true, oversized: true) -> Standard
  case "small order": (total: 10, member: false, oversized: false) -> Standard
`,
    tryThis: {
      prompt: "Remove the parentheses and see why grouping matters.",
      find: "(total >= 50 or member) and not oversized",
      replace: "total >= 50 or member and not oversized",
      expect: "The \"oversized sofa\" example fails: without the pause, and binds first, so a $900 order ships free even when oversized.",
      breaksExamples: true,
    },
  },
  {
    slug: "order",
    title: "The first matching rule wins",
    idea: "A decision checks rules from top to bottom and stops at the first one that matches. Put the most important rule first.",
    picture: "A queue of doors: you walk through the first one that opens, and never try the rest.",
    words: [
      { word: "several when lines", means: "Checked in order, top to bottom." },
      { word: "plan == \"enterprise\"", means: "Compare text with == and quotes." },
      { word: "waitHours > 24", means: "Compare numbers with <, <=, >, >=." },
    ],
    source: `contract SupportTriage
purpose Route each ticket to the right queue.

decision Priority(plan: string, outage: boolean, waitHours: number)
  when outage -> Urgent
  when plan == "enterprise" or waitHours > 24 -> High
  otherwise -> Normal

examples Priority
  case "outage for an enterprise customer": (plan: "enterprise", outage: true, waitHours: 1) -> Urgent
  case "enterprise question": (plan: "enterprise", outage: false, waitHours: 2) -> High
  case "waited too long": (plan: "free", outage: false, waitHours: 30) -> High
  case "everyday ticket": (plan: "free", outage: false, waitHours: 3) -> Normal
`,
    tryThis: {
      prompt: "Move the enterprise rule above the outage rule.",
      find: `  when outage -> Urgent
  when plan == "enterprise" or waitHours > 24 -> High`,
      replace: `  when plan == "enterprise" or waitHours > 24 -> High
  when outage -> Urgent`,
      expect: "\"outage for an enterprise customer\" now gets High instead of Urgent. Same rules, different order, different behavior.",
      breaksExamples: true,
    },
  },
  {
    slug: "your-turn",
    title: "Write your own",
    idea: "Change this contract into a rule from your own work. Rename it, change the inputs, and add an example on every edge.",
    picture: "One file holds the rule, its reason, and its proof. Every language is generated from it, so they can't drift apart.",
    words: [
      { word: "number", means: "Amounts, counts, and limits." },
      { word: "boolean", means: "Yes or no: true or false." },
      { word: "string", means: "Text, written in quotes." },
    ],
    source: `contract LoanReview
purpose Approve small loans for applicants with good credit. Review the rest.

decision LoanDecision(amount: number, creditScore: number, verifiedIncome: boolean)
  when amount <= 5000 and creditScore >= 700 and verifiedIncome -> Approve
  when creditScore < 500 -> Decline
  otherwise -> Review

examples LoanDecision
  case "small loan, good credit": (amount: 3000, creditScore: 720, verifiedIncome: true) -> Approve
  case "exactly at the limit": (amount: 5000, creditScore: 700, verifiedIncome: true) -> Approve
  case "income not verified": (amount: 3000, creditScore: 720, verifiedIncome: false) -> Review
  case "very low credit": (amount: 1000, creditScore: 450, verifiedIncome: true) -> Decline
`,
    tryThis: {
      prompt: "Add a rule: loans over $50,000 are always reviewed. Put it first.",
      find: "  when amount <= 5000",
      replace: "  when amount > 50000 -> Review\n  when amount <= 5000",
      expect: "A new if appears at the top of every generated function, and all four examples still pass.",
      breaksExamples: false,
    },
  },
];
