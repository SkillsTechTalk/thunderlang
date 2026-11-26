// Learn Thunder: the Thunder V1 tutorial, shipped in the npm package (`@skillstech/thunderlang/learn`) so every
// release carries a tutorial that matches its language. Twelve short lessons on reading software in Thunder, about
// one small pizza app and a school library. thunderlang.dev/learn and the Skills Tech Talk course are built from
// this file. Every quiz answer is worked out by the compiler (`check`) when the lessons are built: if the compiler
// ever disagrees with what a lesson expects, the build fails (see learn.mjs and test/learn-export.test.mjs).

/**
 * @typedef {{ language: string, label: string, code: string }} LessonFile
 * @typedef {{
 *   slug: string, title: string, idea: string, picture: string,
 *   files: LessonFile[], focus: string,
 *   show: 'steps' | 'card' | 'compare' | 'text' | 'honest' | 'shapes' | 'thing' | 'flow' | 'howto' | 'openthunder',
 *   examples?: string, questions: { q: string, a: string }[],
 *   part?: 'read' | 'write', quiz: QuizQuestion[],
 * }} ReadLesson
 * @typedef {{ prompt: string, choices: string[], expect: string, explain: string, check: (ctx: any) => string }} QuizQuestion
 */

/** The delivery rule in four languages, without doc comments, so only the language differs. */
const strip = (code) => code.split('\n').filter((l) => !/^\s*("""|\/\*\*|\/\/ )/.test(l)).join('\n');

const DELIVERY = {
  python: `def delivery_fee(total: float, distance_km: float) -> str:
    """Nearby orders of $20 or more are delivered free."""
    if total >= 20 and distance_km <= 5:
        return "Free"
    if distance_km > 15:
        return "TooFar"
    return "Standard"
`,
  typescript: `/** Nearby orders of $20 or more are delivered free. */
function deliveryFee(total: number, distanceKm: number): string {
  if (total >= 20 && distanceKm <= 5) return "Free";
  if (distanceKm > 15) return "TooFar";
  return "Standard";
}
`,
  java: `class Delivery {
  /** Nearby orders of $20 or more are delivered free. */
  static String deliveryFee(double total, double distanceKm) {
    if (total >= 20 && distanceKm <= 5) return "Free";
    if (distanceKm > 15) return "TooFar";
    return "Standard";
  }
}
`,
  go: `package delivery

// DeliveryFee: nearby orders of $20 or more are delivered free.
func DeliveryFee(total float64, distanceKm float64) string {
	if total >= 20 && distanceKm <= 5 {
		return "Free"
	}
	if distanceKm > 15 {
		return "TooFar"
	}
	return "Standard"
}
`,
};


/** The school library: a Thing with what it knows and what it can do (lessons 3 and 4). */
const LIBRARY = `from dataclasses import dataclass
from enum import Enum


class Status(Enum):
    ON_SHELF = "on shelf"
    BORROWED = "borrowed"


@dataclass
class Book:
    """A book in the school library."""
    title: str
    status: Status = Status.ON_SHELF


class Library:
    """Lends books to students and takes them back."""

    def __init__(self, max_books: int = 3):
        self.max_books = max_books
        self.overflow = []

    def late_fee(self, days_late: int) -> str:
        """Small fines for late books."""
        if days_late <= 7:
            return "SmallFee"
        return "BigFee"

    def return_book(self, student, book, days_late: int):
        """A student brings a book back."""
        if book not in student.books:
            raise NotBorrowed("This student does not have this book")
        student.books.remove(book)
        if days_late > 0:
            fee = self.late_fee(days_late)
            student.fees.append(fee)
        else:
            student.thanks += 1
        try:
            self.shelf.put(book)
        except ShelfFull:
            self.overflow.append(book)
        finally:
            book.status = Status.ON_SHELF
`;

/** Examples a person adds to check the rule (code has none). */
const DELIVERY_EXAMPLES = `
Examples
  25, 3     gives Free       (a big order nearby)
  20, 5     gives Free       (exactly at both limits)
  19, 3     gives Standard   (one dollar short)
  25, 6     gives Standard   (just too far for free delivery)
  25, 16    gives TooFar     (outside the delivery area)
`;

/** A small app with two doors and one rule (lesson 11: reading a whole app in OpenThunder). */
const PIZZA_APP = `from fastapi import APIRouter

router = APIRouter()


def delivery_fee(total: float, distance_km: float) -> str:
    """Nearby orders of $20 or more are delivered free."""
    if total >= 20 and distance_km <= 5:
        return "Free"
    if distance_km > 15:
        return "TooFar"
    return "Standard"


@router.post("/orders")
def place_order(order):
    """A customer orders pizza."""
    if not order.items:
        raise EmptyOrder("Add at least one pizza")
    fee = delivery_fee(order.total, order.distance_km)
    if fee == "TooFar":
        raise TooFar("We do not deliver that far")
    order.save()
    return order


@router.get("/orders/{order_id}")
def track_order(order_id):
    """A customer checks where their pizza is."""
    order = Order.find(order_id)
    return order.status
`;

// Helpers the quiz checks use: they look only at what the compiler produced.
const flatSteps = (steps) => (steps || []).flatMap((s) => [s, ...flatSteps(s.children), ...flatSteps(s.otherwise)]);
const humanAnswer = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(\w)(.*)$/, (_, a, b) => a.toUpperCase() + b.toLowerCase());
const TS_DELIVERY_16 = strip(DELIVERY.typescript).replace('distanceKm > 15', 'distanceKm > 16');

/** @type {ReadLesson[]} */
export const READ_LESSONS = [
  {
    slug: "pictures",
    part: "read",
    quiz: [
      { prompt: "In order_total, which step happens only when the order has a coupon?", choices: ["Adds item price to total", "Subtracts 5 from total", "Gives back total"], expect: "Subtracts 5 from total",
        explain: "It sits inside the choice \"If order has coupon\", so it only happens on that path. The other two happen for every order.",
        check: ({ item }) => flatSteps(item.steps).find((s) => s.kind === 'branch' && /coupon/.test(s.says)).children[0].says },
    ],
    title: "Software, as pictures",
    idea: "Code is a list of instructions written for a computer. Thunder™ shows the same instructions as a picture written for people. The Thunder compiler reads the code exactly; it never guesses.",
    picture: "A chef's shorthand notes and the recipe card in the cookbook describe the same dish. The code is the shorthand; Thunder is the recipe card anyone can follow.",
    files: [{ language: "python", label: "Python", code: `def order_total(order):
    total = 0
    for item in order.items:
        total += item.price
    if order.has_coupon:
        total -= 5
    return total
` }],
    focus: "order_total",
    show: "steps",
    questions: [
      { q: "In your own words, what does order_total do?", a: "It adds up the price of every item, takes $5 off when the order has a coupon, and gives back the total. You could say that without knowing Python. That is the point." },
      { q: "Who drew this picture, a person or an AI?", a: "Neither. The Thunder compiler read the code with fixed rules and no AI. The same code always gives the same picture." },
    ],
  },
  {
    slug: "shapes",
    part: "read",
    quiz: [
      { prompt: "Which shape means the program stops and says why?", choices: ["Thing", "Rule", "Steps", "Stop"], expect: "Stop",
        explain: "Stop is the octagon, like a stop sign. It ends that path and shows the reason.",
        check: ({ symbols }) => Object.values(symbols).find((s) => s.beginner && s.color === 'failure').name },
      { prompt: "Which shape looks at some facts and picks one answer?", choices: ["Thing", "Rule", "Steps", "Data"], expect: "Rule",
        explain: "A Rule is the diamond: a decision, such as which fee to charge.",
        check: ({ symbols }) => Object.values(symbols).find((s) => s.beginner && s.color === 'question').name },
    ],
    title: "The six shapes",
    idea: "Everything in a program is one of six kinds of thing, and each has its own shape. Learn these six and you can tell what any piece of code is before you read a single word.",
    picture: "Road signs again: a stop sign is an octagon everywhere in the world. Thunder's shapes work the same way in every programming language.",
    files: [],
    show: "shapes",
    questions: [
      { q: "You see a diamond. What kind of thing is it, and what will it do?", a: "A Rule. It looks at some facts and picks one answer, like \"Small fee\" or \"Big fee\"." },
      { q: "Which shape tells you the program gives up and says why?", a: "The octagon: Stop. It ends the path and shows the reason, for example \"This student does not have this book\"." },
    ],
  },
  {
    slug: "things",
    part: "read",
    quiz: [
      { prompt: "How many books can a student have at once, unless someone says otherwise?", choices: ["1", "3", "As many as they like"], expect: "3",
        explain: "What the Library knows includes \"max books: 3 unless told otherwise\". It comes from max_books: int = 3 in the code.",
        check: ({ target }) => target.knows.find((k) => k.label === 'max books').start.match(/\d+/)[0] },
      { prompt: "Book only remembers facts (a title and a status). How does Thunder draw it?", choices: ["As a Thing", "As Data", "As a Rule"], expect: "As Data",
        explain: "It can't do anything, it only remembers facts, so it is Data (a record), drawn smaller than a Thing.",
        check: ({ model }) => (model.things.find((t) => t.name === 'Book').kind === 'thing' ? 'As a Thing' : 'As Data') },
    ],
    title: "Things: what it knows, what it can do",
    idea: "Programs are built from Things. A Thing knows some facts and can do some jobs. Code calls a Thing a class; Thunder just shows the box: what it knows, and what it can do.",
    picture: "A toy robot's instruction card: on one side what's inside it (battery, 3 lights), on the other the buttons it has (walk, beep). You don't need to see the wires.",
    files: [{ language: "python", label: "Python", code: LIBRARY }],
    focus: "Library",
    show: "thing",
    questions: [
      { q: "How many books can a student have at once, if nobody says otherwise?", a: "3. \"max books: a number, 3 unless told otherwise\" is in what the Library knows." },
      { q: "Book and Status are drawn smaller. Why are they not Things?", a: "They only remember facts (a Book's title and status) or list allowed choices (on shelf, borrowed). They can't do anything, so Thunder draws them as Data." },
    ],
  },
  {
    slug: "flow",
    part: "read",
    quiz: [
      { prompt: "A book comes back 3 days late. Which fee does the late fee rule pick?", choices: ["Small fee", "Big fee", "No fee"], expect: "Small fee",
        explain: "3 is at most 7, so the rule picks Small fee. The compiler ran the rule on 3 to check.",
        check: ({ run }) => humanAnswer(run({ 'days late': 3 }, 'late_fee')) },
      { prompt: "The shelf is full when the book comes back. Does the book still end up marked \"on shelf\"?", choices: ["Yes", "No"], expect: "Yes",
        explain: "\"If ShelfFull goes wrong\" puts it on the overflow pile, and \"Always, at the end\" marks it on shelf no matter what happened.",
        check: ({ text }) => (/Always, at the end:\n\s+- Sets the book's status to on shelf/.test(text) ? 'Yes' : 'No') },
    ],
    title: "Follow the flow",
    idea: "When a Thing does a job, it follows a path. Questions split the path into Yes and No. Some paths end at a Stop. Some steps only happen if something goes wrong, and some always happen at the end.",
    picture: "A Choose Your Own Adventure book: at each question you turn to the Yes page or the No page, and some pages say THE END.",
    files: [{ language: "python", label: "Python", code: LIBRARY }],
    focus: "return_book",
    show: "flow",
    questions: [
      { q: "A student returns a book 3 days late. What happens to their fees?", a: "Days late is more than 0, so Yes: the late fee rule works out a fee (Small fee, because 3 is at most 7) and it is added to the student's fees." },
      { q: "The shelf is full. Does the book still end up marked \"on shelf\"?", a: "Yes. \"If ShelfFull goes wrong\" puts it in the overflow pile, and \"Always, at the end\" marks it on shelf no matter what happened before." },
    ],
  },
  {
    slug: "steps",
    part: "read",
    quiz: [
      { prompt: "How many different ways can check_order fail?", choices: ["None", "1", "2", "3"], expect: "2",
        explain: "There are two ✕ steps: EmptyOrder when there are no items, and TooFar when the address is more than 15 km away.",
        check: ({ item }) => String(flatSteps(item.steps).filter((s) => s.kind === 'fail').length) },
    ],
    title: "Read the steps",
    idea: "Most functions are a short list of steps. Each step has a mark that tells you what kind of step it is, so you can scan a function without reading every word.",
    picture: "Road signs: you know what a stop sign means before you read the word. ◇ means a choice, ↻ means repeat, ✕ means something went wrong.",
    files: [{ language: "python", label: "Python", code: `def check_order(order):
    if not order.items:
        raise EmptyOrder("Add at least one pizza")
    if order.distance_km > 15:
        raise TooFar("We do not deliver that far")
    for item in order.items:
        item.checked = True
    count = len(order.items)
    log.info("Order checked")
    return count
` }],
    focus: "check_order",
    show: "steps",
    questions: [
      { q: "Which marks show the two ways this function can fail?", a: "The two ✕ steps: an order with no items fails with EmptyOrder, and an address more than 15 km away fails with TooFar. Each sits inside the ◇ choice that leads to it." },
      { q: "What does the ↻ step repeat, and what happens inside it?", a: "It goes through every item in the order and marks each one as checked (the = step inside it)." },
    ],
  },
  {
    slug: "cards",
    part: "read",
    quiz: [
      { prompt: "An order of exactly $20, exactly 5 km away. What does the card say?", choices: ["Free", "Standard", "TooFar"], expect: "Free",
        explain: "At least $20 and at most 5 km both include the limit itself, so the first rule fits: Free.",
        check: ({ run }) => run({ total: 20, 'distance km': 5 }) },
      { prompt: "An order of $25, 16 km away. What does the card say?", choices: ["Free", "Standard", "TooFar"], expect: "TooFar",
        explain: "It is too far for free delivery, and 16 is over 15, so the second rule fits: TooFar.",
        check: ({ run }) => run({ total: 25, 'distance km': 16 }) },
    ],
    title: "Rules become cards",
    idea: "Some functions decide something: they look at a few facts and pick an answer. Thunder draws each one as a card. You can ask the card a question and see which answer it gives, and why.",
    picture: "A card is a referee's rule book page: the facts it looks at, each rule in order, and the answer when no rule fits. The first rule that fits wins.",
    files: [{ language: "python", label: "Python", code: DELIVERY.python }],
    focus: "delivery_fee",
    show: "card",
    examples: DELIVERY_EXAMPLES,
    questions: [
      { q: "An order of exactly $20, exactly 5 km away. Free or Standard? Decide before you ask the card.", a: "Free. The rule says at least $20 and at most 5 km, and both include the limit itself. Try it on the card to check." },
      { q: "Where did the line under the title come from?", a: "From the programmer's own note in the code (the docstring). Thunder shows it as the author's note, separately from what the code does, because a note can be out of date while the code is what actually runs." },
    ],
  },
  {
    slug: "actions",
    part: "read",
    quiz: [
      { prompt: "What is the address of this door?", choices: ["GET /orders", "POST /orders", "POST /pay"], expect: "POST /orders",
        explain: "The label on the door comes from @router.post(\"/orders\") in the code.",
        check: ({ item }) => `${item.route.method} ${item.route.path}` },
      { prompt: "The delivery fee comes back TooFar. Is the card charged?", choices: ["Yes", "No"], expect: "No",
        explain: "The TooFar stop comes before the Stripe step, and steps run top to bottom, so the action stops first.",
        check: ({ item }) => {
          const stop = item.steps.findIndex((s) => flatSteps(s.children).some((c) => c.kind === 'fail' && /TooFar/.test(c.says)));
          const charge = item.steps.findIndex((s) => /stripe/i.test(s.says));
          return stop >= 0 && stop < charge ? 'No' : 'Yes';
        } },
    ],
    title: "Actions: the doors into an app",
    idea: "An app has doors: things people can do, like placing an order. Thunder labels each one with its address (POST /orders) and shows what happens behind the door, step by step.",
    picture: "A building with labeled doors. The label tells you which door; the steps tell you what happens after you walk through it.",
    files: [{ language: "python", label: "Python", code: `@router.post("/orders")
def place_order(order, card):
    """A customer orders pizza and pays for it."""
    if not order.items:
        raise EmptyOrder("Add at least one pizza")
    total = order_total(order)
    fee = delivery_fee(total, order.distance_km)
    if fee == "TooFar":
        raise TooFar("We do not deliver that far")
    payment = stripe.charge(card, total)
    send_email(order.customer, "Your pizza is on its way")
    return payment
` }],
    focus: "place_order",
    show: "steps",
    questions: [
      { q: "Name the two outside services this action talks to.", a: "Stripe, to charge the card, and email, to tell the customer the pizza is on its way. Thunder names known services instead of saying \"calls a function\"." },
      { q: "If someone lives 20 km away, does their card get charged?", a: "No. The delivery fee comes back as TooFar, so the action fails with TooFar before the Stripe step. Order matters: steps run top to bottom." },
    ],
  },
  {
    slug: "any-language",
    part: "read",
    quiz: [
      { prompt: "Do Python, TypeScript, Java, and Go give the same Thunder for this rule?", choices: ["Yes, exactly the same", "No, each is a little different"], expect: "Yes, exactly the same",
        explain: "The code differs, but the meaning is the same, so the Thunder Text is identical, word for word.",
        check: ({ texts }) => (texts.every((t) => t === texts[0]) ? 'Yes, exactly the same' : 'No, each is a little different') },
    ],
    title: "Same meaning, any language",
    idea: "The delivery rule can be written in Python, TypeScript, Java, or Go. The code looks different every time. The Thunder is identical, because the meaning is identical.",
    picture: "A song played on piano, guitar, or violin. The instruments sound different, but it is the same tune. Thunder is the tune.",
    files: [
      { language: "python", label: "Python", code: strip(DELIVERY.python) },
      { language: "typescript", label: "TypeScript", code: strip(DELIVERY.typescript) },
      { language: "java", label: "Java", code: strip(DELIVERY.java) },
      { language: "go", label: "Go", code: strip(DELIVERY.go) },
    ],
    focus: "delivery fee",
    show: "compare",
    examples: DELIVERY_EXAMPLES,
    questions: [
      { q: "Pick two languages. Name one difference in the code and one difference in the Thunder.", a: "The code differs in small ways: def or function or func, and the or && for joining conditions. The Thunder has no differences at all. That is what human-native means: you read the meaning, not the language." },
      { q: "Why does that matter when AI writes most of the code?", a: "AI can write in whichever language a team uses. You only need to read Thunder to understand all of it." },
    ],
  },
  {
    slug: "thunder-text",
    part: "read",
    quiz: [
      { prompt: "Which line of Thunder Text is the TooFar rule?", choices: ["TooFar when the distance km is over 15.", "TooFar when the total is under 20.", "TooFar when the distance km is at most 5."], expect: "TooFar when the distance km is over 15.",
        explain: "It matches the code's distance_km > 15, in words.",
        check: ({ texts }) => texts[0].split('\n').map((l) => l.trim().replace(/^- /, '')).find((l) => l.startsWith('TooFar')) },
    ],
    title: "Thunder Text: the same thing in words",
    idea: "Every picture has a twin written in plain words, called Thunder Text. Both are made from the same reading of the code, so they always agree. Use the picture to understand; use the text to read closely, review a change, or keep a copy.",
    picture: "A map and written directions for the same trip. Neither one is a translation of the other; both come from the same roads.",
    files: [{ language: "python", label: "Python", code: DELIVERY.python }],
    focus: "delivery_fee",
    show: "text",
    examples: DELIVERY_EXAMPLES,
    questions: [
      { q: "Find the line in the Thunder Text that matches the TooFar rule on the card.", a: "\"TooFar when the distance km is over 15.\" Same rule, same words, same order." },
      { q: "Is Thunder Text made from the picture?", a: "No. Both are made from the same reading of the code. That is why they can never disagree." },
    ],
  },
  {
    slug: "honest",
    part: "read",
    quiz: [
      { prompt: "Thunder can't explain oven_temperature yet. What does it show you?", choices: ["A sentence an AI wrote", "The code itself, marked Not read yet", "Nothing at all"], expect: "The code itself, marked Not read yet",
        explain: "Thunder never invents an explanation. It shows the exact code on a dashed card labeled Not read yet.",
        check: ({ visuals }) => (visuals[0].line === 'dashed' ? 'The code itself, marked Not read yet' : 'A sentence an AI wrote') },
    ],
    title: "Honest by design",
    idea: "Thunder never pretends. When it cannot explain a piece of code yet, it shows the code itself on a dashed card and says Not read yet. Every piece shows where it came from.",
    picture: "A good guide says \"I don't know this street, here is the map\" instead of inventing directions. Dashed means not established; solid means read exactly or confirmed.",
    files: [{ language: "python", label: "Python", code: `def oven_temperature(dough):
    return (dough.thickness * 17 + 220) % 300
` }],
    focus: "oven_temperature",
    show: "honest",
    questions: [
      { q: "Why does Thunder show code here instead of a sentence?", a: "A sentence like \"Returns a computed value\" would only repeat the code without explaining it. Thunder shows the code, dashed, so you know it was not explained, rather than reading a sentence that sounds helpful but says nothing." },
      { q: "Which label would an AI-written explanation get, and how would it look?", a: "AI summary, with a dashed outline, always placed above the exact reading, never instead of it. It helps you understand; it is never the evidence." },
    ],
  },
  {
    slug: "openthunder",
    part: "read",
    title: "Read a whole app in OpenThunder",
    idea: "A real app has many files. OpenThunder, the IDE for Thunder, reads a whole repository. You move from the App to a File, then an Action (a door), then one Rule, and you can read each of them at five levels: Big Picture, Flow, Details, Text, and Original. Every picture is drawn from the code, and the original code is always one click away.",
    picture: "A map app: zoom out to see the whole city, zoom in to one street, then one house. It is the same map at every level.",
    files: [{ language: "python", label: "Python", code: PIZZA_APP }],
    focus: "place_order",
    show: "openthunder",
    quiz: [
      { prompt: "How many doors (actions) does this app have?", choices: ["1", "2", "3"], expect: "2",
        explain: "POST /orders to place an order and GET /orders/{order_id} to track one. delivery_fee is a rule, not a door: nobody can call it from outside.",
        check: ({ all }) => String(all.filter((i) => i.route).length) },
      { prompt: "Which door can stop with TooFar?", choices: ["POST /orders", "GET /orders/{order_id}", "Both"], expect: "POST /orders",
        explain: "Only placing an order asks for the delivery fee and stops when it is TooFar. Tracking an order never does.",
        check: ({ all }) => {
          const doors = all.filter((i) => i.route && flatSteps(i.steps).some((s) => s.kind === 'fail' && /TooFar/.test(s.says)));
          return doors.length > 1 ? 'Both' : `${doors[0].route.method} ${doors[0].route.path}`;
        } },
      { prompt: "delivery_fee looks at two facts and picks one answer. How does OpenThunder draw it?", choices: ["As a rule card", "As a list of steps", "As a Thing"], expect: "As a rule card",
        explain: "A function that only chooses between fixed answers is a Rule, drawn as a card you can ask questions.",
        check: ({ all, visualFor }) => (visualFor(all.find((i) => i.name === 'delivery_fee')).element === 'decision' ? 'As a rule card' : 'As a list of steps') },
    ],
    questions: [
      { q: "A card shows an AI summary chip. Can you rely on it to know what the code does?", a: "No. An AI summary can help you understand, and it is always labeled and dashed, but it is never the evidence. The From code reading, and the original code, are." },
      { q: "A picture looks wrong to you. Where do you check?", a: "The original code, one click away. Every picture is drawn from it, and the code is what actually runs." },
    ],
  },
  {
    slug: "study",
    part: "read",
    title: "Study your own app",
    idea: "Now use Thunder on code you care about: one file in your browser, a whole folder in your terminal, or a whole app in OpenThunder. Converting or rewriting code? Thunder can check that the meaning stayed the same.",
    picture: "A pair of glasses that works on any book. Put them on wherever you are reading.",
    files: [],
    show: "howto",
    quiz: [
      { prompt: "A teammate rewrote the delivery rule in TypeScript and changed 15 km to 16 km. What does thunder same say?", choices: ["Same meaning", "Different meaning"], expect: "Different meaning",
        explain: "thunder same runs both rules on their edge cases. At 16 km the old rule says TooFar and the new one says Standard, so the meaning changed.",
        check: ({ same }) => (same([{ path: 'delivery.py', source: strip(DELIVERY.python) }], [{ path: 'delivery.ts', source: TS_DELIVERY_16 }]) === 'same' ? 'Same meaning' : 'Different meaning') },
      { prompt: "Another teammate only rewrote it in TypeScript, with the same limits. What does thunder same say?", choices: ["Same meaning", "Different meaning"], expect: "Same meaning",
        explain: "The language and the spelling of names changed (distance_km became distanceKm), but every edge case gives the same answer.",
        check: ({ same }) => (same([{ path: 'delivery.py', source: strip(DELIVERY.python) }], [{ path: 'delivery.ts', source: strip(DELIVERY.typescript) }]) === 'same' ? 'Same meaning' : 'Different meaning') },
    ],
    questions: [
      { q: "You want to understand one file someone sent you. Which is fastest?", a: "Semantic Zoom or Thunder Code in your browser: paste the code and read it. Nothing is installed and nothing leaves your browser." },
      { q: "Your team rewrote a service from Python to Java. How do you check nothing changed?", a: "thunder same old-folder new-folder. It reads both, runs every rule on its edge cases, compares the steps, and shows any difference with an example." },
    ],
  },
];

// ── Part 2: write and run ──────────────────────────────────────────────────────────────────────────────────────
// Programs you write in Thunder Core. Every answer is worked out by compiling the lesson's program and running it on
// the Thunder engine (engine-core.mjs, which needs no Python and runs in a browser too). Each lesson names the
// programming concept it teaches, and `commands` are what to type in a terminal to do it yourself.

/** The program `thunder new` writes (a test checks they stay the same). */
export const STARTER_PROGRAM = `# Your first Thunder program. Run it with: thunder run

To greet:
  Receive name
  Give "Hello, {name}!"

say greet with "world"
`;

const CHOOSE = `Set total to $18.50

When total is at least $20:
  say "Delivery is free"
Otherwise:
  say "Delivery costs $3.99"
`;

const LOOP = `Set scores to [90, 75, 100]
Set total to 0
For each score in scores:
  Increase total by score

say "Total: {total}"
say "First: {scores at 1}"
`;

const RECORD = `A Book has:
  Title is text
  Copies is a whole number
  Never allow negative copies

Set book to a Book with title "Matilda" and copies 1
Set book's copies to book's copies - 1
say "{book's title}: {book's copies} left"
Set book's copies to book's copies - 1
If this fails:
  say "Not allowed: {error}"
`;

const FEE_TESTS = `To delivery fee:
  Receive total
  When total is at least $20:
    Give $0
  Otherwise:
    Give $3.99

Test "orders of $20 or more are free":
  Expect delivery fee with $20 to be $0

Test "small orders pay for delivery":
  Expect delivery fee with $5 to be $2.99
`;

const SHOP_PY = `def delivery_fee(total):
    if total >= 20:
        return 0
    return 3.99


def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None
`;

/** A small agent run record (OpenTelemetry, GenAI conventions): a refund that could not reach the payment service. */
const AGENT_RUN = (() => {
  const t = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const ns = (ms) => String(1764064800000000000n + BigInt(ms) * 1000000n);
  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: String(v) } }));
  const fail = (type, message) => ({ status: { code: 2, message }, events: [{ name: 'exception', attributes: kv({ 'exception.type': type, 'exception.message': message }) }] });
  const span = (id, parent, name, s, e, attrs, extra = {}) => ({ traceId: t, spanId: id, ...(parent ? { parentSpanId: parent } : {}), name, startTimeUnixNano: ns(s), endTimeUnixNano: ns(e), attributes: kv(attrs), ...extra });
  const post = (id, s) => span(id, 'c8e0a2b4d6f81a3c', 'POST', s, s + 2900, { 'http.request.method': 'POST', 'url.full': 'https://pay.example.com/v1/refunds', 'error.type': 'ConnectionError' }, fail('ConnectionError', 'Connection refused'));
  return JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [
    span('7c1e4a9b2d3f5061', null, 'invoke_agent support-bot', 0, 12400, { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.agent.name': 'support-bot' }, fail('RuntimeError', 'tool failed')),
    span('c8e0a2b4d6f81a3c', '7c1e4a9b2d3f5061', 'execute_tool refund_payment', 3150, 12350, { 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': 'refund_payment', 'gen_ai.tool.call.arguments': '{"order_id": 1042, "amount": "40.00"}' }, fail('ConnectionError', 'failed after 3 attempts')),
    post('1f3b5d7f9a1c3e50', 3200), post('6a8c0e2a4c6e8a01', 6300), post('b2d4f6b8d0f2b4d6', 9350),
  ] }] }] }, null, 2);
})();

export const WRITE_LESSONS = [
  {
    slug: "first-program",
    part: "write",
    concept: "A program: instructions the computer follows, in order",
    title: "Your first program, in two commands",
    idea: "thunder new hello makes a folder called hello with a program inside. thunder run hello runs it. thunder new does not move you into the folder, so name it when you run it (or type cd hello first, then just thunder run).",
    picture: "A recipe card. Writing it changes nothing; running it is cooking it.",
    commands: ["thunder new hello", "thunder run hello"],
    files: [{ language: "thunder", label: "hello/src/main.thunder", code: STARTER_PROGRAM }],
    show: "run",
    quiz: [
      { prompt: "What does this program print?", choices: ["Hello, world!", "Hello, {name}!", "greet with \"world\""], expect: "Hello, world!",
        explain: "To greet makes a step you can use; the last line uses it with \"world\". {name} inside text is filled in with the value, so it says Hello, world!",
        check: ({ core }) => core.stdout.trim() },
      { prompt: "Change \"world\" to \"Ada\" on the last line. What does it print now?", choices: ["Hello, Ada!", "Hello, world!", "Hello, {name}!"], expect: "Hello, Ada!",
        explain: "The same steps run with a different value. That is the whole point of a step with an input: write it once, use it with anything.",
        check: ({ runCore }) => runCore(STARTER_PROGRAM.replace('"world"', '"Ada"')).stdout.trim() },
    ],
    questions: [
      { q: "You typed thunder new hello, then thunder run, and Thunder said there is no project here. Why?", a: "thunder new made the hello folder but did not move you into it. Run thunder run hello, or cd hello first." },
      { q: "Which lines run first?", a: "To greet only describes a step; it runs when it is used. So the first thing that happens is the last line, which uses greet." },
    ],
  },
  {
    slug: "choose",
    part: "write",
    concept: "Conditions: the program chooses what to do",
    title: "Write a choice and run it",
    idea: "Open hello/src/main.thunder, write your own lines, and run it again. Thunder checks what you wrote first and explains any mistake by its line. By default your program runs as Python (Python 3.10 or newer); add --engine thunder to run it without Python. Python is the only full target today.",
    picture: "A fork in a path with a sign: one way when the total is big enough, the other way otherwise.",
    commands: ["thunder run hello", "thunder run hello --engine thunder"],
    files: [{ language: "thunder", label: "hello/src/main.thunder", code: CHOOSE }],
    show: "run",
    quiz: [
      { prompt: "What does this program print?", choices: ["Delivery costs $3.99", "Delivery is free"], expect: "Delivery costs $3.99",
        explain: "$18.50 is not at least $20, so the Otherwise lines run.",
        check: ({ core }) => core.stdout.trim() },
      { prompt: "Change the total to $20. What does it print now?", choices: ["Delivery is free", "Delivery costs $3.99"], expect: "Delivery is free",
        explain: "\"At least\" includes the limit itself: $20 is at least $20. The edge of a rule is where mistakes hide, so it is worth trying.",
        check: ({ runCore }) => runCore(CHOOSE.replace('$18.50', '$20')).stdout.trim() },
    ],
    questions: [
      { q: "Why is money written $18.50 and not 18.5?", a: "Money in Thunder is exact: $0.10 + $0.20 is exactly $0.30, and it always shows cents. A plain 18.5 would be a number, not money." },
    ],
  },
  {
    slug: "repeat",
    part: "write",
    concept: "Loops and lists: do something for each item",
    title: "Go through a list",
    idea: "A list holds several values in order. For each goes through them one at a time and runs the indented lines for every one. In Thunder the first item is at position 1, the way people count.",
    picture: "A teacher reading a stack of tests, adding each score to a running total.",
    commands: ["thunder run hello"],
    files: [{ language: "thunder", label: "hello/src/main.thunder", code: LOOP }],
    show: "run",
    quiz: [
      { prompt: "What is the total?", choices: ["Total: 265", "Total: 100", "Total: 90"], expect: "Total: 265",
        explain: "The loop runs three times, once for each score: 90 + 75 + 100 = 265.",
        check: ({ core }) => core.stdout.split('\n')[0] },
      { prompt: "What does scores at 1 give?", choices: ["First: 90", "First: 75"], expect: "First: 90",
        explain: "Positions start at 1, so scores at 1 is the first score. (In Python and JavaScript it would be scores[0]; Thunder counts like people do.)",
        check: ({ core }) => core.stdout.split('\n')[1] },
    ],
    questions: [
      { q: "How would you count only the scores of 90 or more?", a: "Inside the loop, add a choice: When score is at least 90: Increase count by 1." },
    ],
  },
  {
    slug: "records",
    part: "write",
    concept: "Records: data with a shape, and rules it must keep",
    title: "Give your data a shape and a rule",
    idea: "A record says what a kind of thing knows (a Book has a title and a number of copies). A Never rule on it is checked every time it changes, so a mistake is caught where it happens, with the rule's own words.",
    picture: "A library card with fixed boxes to fill in, and a line printed at the bottom: copies can never go below zero.",
    commands: ["thunder run hello"],
    files: [{ language: "thunder", label: "hello/src/main.thunder", code: RECORD }],
    show: "run",
    quiz: [
      { prompt: "The second change would make copies -1. What happens?", choices: ["Thunder refuses the change", "Copies becomes -1"], expect: "Thunder refuses the change",
        explain: "Never allow negative copies is checked on every change. The change is refused, and If this fails catches it and says why: the rule, its line, and the value it would have had.",
        check: ({ core }) => (core.stdout.split('\n')[1].startsWith('Not allowed:') ? 'Thunder refuses the change' : 'Copies becomes -1') },
    ],
    questions: [
      { q: "Why put the rule on the record instead of checking before every change?", a: "Because then it cannot be forgotten. Every change to copies, anywhere in the program, is checked by the same rule." },
    ],
  },
  {
    slug: "python-as-thunder",
    part: "write",
    concept: "The same meaning in two languages, and honesty about the rest",
    title: "Read Python as Thunder you can run",
    idea: "thunder read shop.py --as-core turns Python into Thunder Core you can edit and run. A line Thunder cannot say with exactly the same meaning is never turned into something close: it is marked \"Not translated\", with the reason, and a Stop line that explains itself if it ever runs.",
    picture: "A careful interpreter who translates every sentence they are sure of, and says \"I can't translate this one, here is why\" for the rest.",
    commands: ["thunder read shop.py --as-core"],
    files: [{ language: "python", label: "shop.py", code: SHOP_PY }],
    asCore: true,
    show: "run",
    quiz: [
      { prompt: "Which function comes across exactly?", choices: ["delivery fee", "safe divide", "both"], expect: "delivery fee",
        explain: "delivery_fee is a comparison and two answers: Thunder says it exactly. safe_divide uses a Python try with a named error kind, which Core has no step for yet.",
        check: ({ asCore }) => { const exact = asCore.functions.filter((f) => f.exact).map((f) => f.coreName); return exact.length === asCore.functions.length ? 'both' : exact.join(', '); } },
      { prompt: "What happens if the part that was not translated runs?", choices: ["It stops with a clear message", "It guesses what the Python meant"], expect: "It stops with a clear message",
        explain: "The not-translated line becomes Stop with \"Line 8 of the Python was not translated: try:\". Thunder never quietly does something different.",
        check: ({ asCore }) => (/Stop with "Line \d+ of the Python was not translated/.test(asCore.core) ? 'It stops with a clear message' : 'It guesses what the Python meant') },
    ],
    questions: [
      { q: "Why is \"not translated\" better than a close guess?", a: "A close guess looks right and behaves differently, which is the most dangerous kind of mistake. A marked line tells you exactly where to look." },
    ],
  },
  {
    slug: "check-test-verify",
    part: "write",
    concept: "Evidence: checking, testing, and verifying promise different things",
    title: "Check, test, and verify",
    idea: "thunder check reads your program before it runs and finds mistakes like a name that does not exist. thunder test runs your examples (Test blocks) and says which ones fail. thunder verify checks a change to the code, by a person or an AI, against the rules that must stay true. Each answers a different question; none replaces the others.",
    picture: "A spell-checker (check), a practice exam (test), and an inspector who signs off on a renovation (verify).",
    commands: ["thunder check hello", "thunder test hello"],
    files: [{ language: "thunder", label: "hello/src/fee.thunder", code: FEE_TESTS }],
    show: "run",
    quiz: [
      { prompt: "You write say totl instead of say total. When does Thunder tell you?", choices: ["Before it runs: it doesn't know what totl is", "Only when that line runs"], expect: "Before it runs: it doesn't know what totl is",
        explain: "thunder check (and run, before running) reads the whole program first. An unknown name is found by its line, before anything happens.",
        check: ({ compile }) => (compile('Set total to $18.50\nsay totl\n').diagnostics.some((d) => d.code === 'TC201') ? "Before it runs: it doesn't know what totl is" : 'Only when that line runs') },
      { prompt: "Which test fails?", choices: ["small orders pay for delivery", "orders of $20 or more are free", "neither"], expect: "small orders pay for delivery",
        explain: "The program gives $3.99 for a $5 order, but the test expected $2.99. thunder test shows both numbers and the line. Either the test or the program is wrong: a person decides which.",
        check: ({ testCore }) => { const m = testCore(FEE_TESTS).stdout.match(/^FAIL {2}(.+?) \(/m); return m ? m[1] : 'neither'; } },
    ],
    questions: [
      { q: "All your tests pass. Is the program right?", a: "It is right for the examples you wrote. Tests only cover what they check, which is why edge cases (like exactly $20) are worth a test of their own." },
    ],
  },
  {
    slug: "agent-why",
    part: "write",
    concept: "Reading what an AI agent did, and why it stopped",
    title: "Ask what an AI agent did",
    idea: "Agents leave a record of every step (an OpenTelemetry trace). thunder why run.json reads it and tells you in plain words what the agent did, what it changed, and why it stopped. When the record doesn't say whether a tool changes anything, Thunder guesses from the tool's name and says it guessed.",
    picture: "A flight recorder, read back as a short story instead of a wall of numbers.",
    commands: ["thunder why run.json"],
    files: [{ language: "json", label: "run.json", code: AGENT_RUN }],
    why: true,
    show: "run",
    quiz: [
      { prompt: "How many times did the agent try to reach the payment service?", choices: ["3", "1", "0"], expect: "3",
        explain: "Three POST requests in a row failed the same way, so Thunder shows them as one step with 3 tries.",
        check: ({ why }) => String(why.problem.tries) },
      { prompt: "How did Thunder decide that refund_payment changes something?", choices: ["From the tool's name (a guess)", "The tool declared it"], expect: "From the tool's name (a guess)",
        explain: "The record does not say what the tool does, so Thunder used its name, and it says so. When a tool declares what it does (its MCP annotations), Thunder uses that instead.",
        check: ({ why }) => (why.changes[0]?.basis === 'name' ? "From the tool's name (a guess)" : 'The tool declared it') },
    ],
    questions: [
      { q: "The refund did not go through. Was the customer refunded?", a: "Thunder can't know: the record shows the requests failed, not what the payment service did. It says the step may have partly happened, so a person checks." },
    ],
  },
];
