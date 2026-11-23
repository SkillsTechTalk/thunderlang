// Learn Thunder: the Thunder V1 tutorial. Seven short lessons on reading software in Thunder, all about one small
// pizza-delivery app. Every picture and every line of Thunder Text is produced from the code below by the real
// Thunder compiler when the site is built; compiler/test/learn-thunder.test.mjs proves each lesson shows what it says.

/**
 * @typedef {{ language: string, label: string, code: string }} LessonFile
 * @typedef {{
 *   slug: string, title: string, idea: string, picture: string,
 *   files: LessonFile[], focus: string,
 *   show: 'steps' | 'card' | 'compare' | 'text' | 'honest',
 *   examples?: string, questions: { q: string, a: string }[],
 * }} ReadLesson
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

/** Examples a person adds to check the rule (code has none). */
const DELIVERY_EXAMPLES = `
Examples
  25, 3     gives Free       (a big order nearby)
  20, 5     gives Free       (exactly at both limits)
  19, 3     gives Standard   (one dollar short)
  25, 6     gives Standard   (just too far for free delivery)
  25, 16    gives TooFar     (outside the delivery area)
`;

/** @type {ReadLesson[]} */
export const READ_LESSONS = [
  {
    slug: "pictures",
    title: "Software, as pictures",
    idea: "Code is a list of instructions written for a computer. Thunder shows the same instructions as a picture written for people. The Thunder compiler reads the code exactly; it never guesses.",
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
    slug: "steps",
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
];
