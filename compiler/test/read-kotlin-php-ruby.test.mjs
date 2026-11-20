// Kotlin, PHP, and Ruby rule reading. Every recovered decision is EXECUTED and compared with the
// answer the original code gives. Ruby answers come from running the real Ruby code when `ruby` is
// installed; PHP and Kotlin answers are the ones the source plainly states (no interpreter here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readCode, detectLanguage } from '../src/read.mjs';
import { parseIntent } from '../src/parse.mjs';
import { evaluateDecision } from '../src/runtime.mjs';

const decide = (item, inputs) => evaluateDecision(parseIntent(item.thunder).decisions[0], inputs).result;
const read = (src, language) => readCode(src, { language }).items;
const decision = (src, language, name) => {
  const items = read(src, language).filter((i) => i.kind === 'decision' && (!name || i.name === name));
  assert.equal(items.length, 1, JSON.stringify(read(src, language).map((i) => [i.kind, i.name, i.unread]), null, 1));
  assert.equal(items[0].status, 'read', JSON.stringify(items[0].unread));
  return items[0];
};

let ruby = null;
try { execFileSync('ruby', ['-v'], { stdio: 'ignore' }); ruby = (src, call) => execFileSync('ruby', ['-e', `${src}\nputs(${call}).inspect`], { encoding: 'utf8' }).trim(); } catch { /* no ruby */ }
const rubyLit = (v) => (typeof v === 'string' ? (v.startsWith(':') ? v : JSON.stringify(v)) : String(v));

// ── Kotlin ─────────────────────────────────────────────────────────────────────────────────

test('Kotlin if / else if / else without semicolons', () => {
  const d = decision(`fun decide(amount: Int, vip: Boolean): String {
    if (amount > 1000) {
        return "Review"
    } else if (vip && amount > 100) {
        return "Approve"
    }
    return "Decline"
}`, 'kotlin');
  assert.deepEqual(d.inputs, [{ name: 'amount', type: 'number' }, { name: 'vip', type: 'boolean' }]);
  for (const [a, v, want] of [[2000, false, 'Review'], [500, true, 'Approve'], [500, false, 'Decline'], [50, true, 'Decline']]) assert.equal(decide(d, { amount: a, vip: v }), want);
});

test('Kotlin expression body with when(subject): values, inclusive ranges, until, else', () => {
  const d = decision(`fun grade(score: Int): String = when (score) {
    100 -> "Perfect"
    in 90..99 -> "A"
    in 80 until 90 -> "B"
    else -> "C"
}`, 'kotlin');
  for (const [s, want] of [[100, 'Perfect'], [99, 'A'], [90, 'A'], [89, 'B'], [80, 'B'], [79, 'C']]) assert.equal(decide(d, { score: s }), want);
});

test('Kotlin subject-less when, enum answers, and if used as a value', () => {
  const w = decision(`fun risk(amount: Double, country: String): Risk {
    return when {
        amount > 10000.0 -> Risk.HIGH
        country == "US" || country == "CA" -> Risk.LOW
        else -> Risk.MEDIUM
    }
}`, 'kotlin');
  assert.equal(decide(w, { amount: 20000, country: 'US' }), 'HIGH');
  assert.equal(decide(w, { amount: 10, country: 'CA' }), 'LOW');
  assert.equal(decide(w, { amount: 10, country: 'FR' }), 'MEDIUM');
  const i = decision(`fun size(n: Int) = if (n > 10) "Big" else if (n > 3) "Medium" else "Small"`, 'kotlin');
  for (const [n, want] of [[11, 'Big'], [10, 'Medium'], [4, 'Medium'], [3, 'Small']]) assert.equal(decide(i, { n }), want);
});

test('Kotlin require, check, and throw become checks on an ordinary function', () => {
  const [f] = read(`fun refund(orderId: String, amount: Int): Receipt {
    require(amount > 0) { "amount must be positive" }
    val order = repo.find(orderId) ?: throw NotFoundException("no order")
    if (order.closed) throw IllegalStateException("closed")
    return gateway.refund(order, amount)
}`, 'kotlin').filter((i) => i.name === 'refund');
  assert.equal(f.kind, 'function');
  assert.equal(f.guards[0].effect.name, 'IllegalArgumentException');
  assert.equal(f.guards[0].when, 'not amount > 0'); // ThunderLang's not applies to the whole comparison
  assert.equal(f.guards[0].effect.detail, 'amount must be positive');
  assert.ok(f.guards.some((g) => g.effect.name === 'IllegalStateException' && g.when === 'order.closed'));
});

test('Kotlin Ktor and Spring routes are found', () => {
  const items = read(`fun Application.module() {
    routing {
        post("/refunds") {
            call.respond(HttpStatusCode.OK)
        }
    }
}
@RestController
class C {
    @GetMapping("/health")
    fun health(): String { return "ok" }
}`, 'kotlin');
  assert.ok(items.some((i) => i.route?.method === 'POST' && i.route.path === '/refunds'));
  assert.ok(items.some((i) => i.name === 'health' && i.route?.path === '/health'));
});

// ── PHP ────────────────────────────────────────────────────────────────────────────────────

test('PHP function with $variables, -> fields, elseif, and class constants', () => {
  const d = decision(`<?php
class Refunds {
    public function decide(int $amount, Order $order): string {
        if ($amount > 1000) {
            return 'Review';
        } elseif ($order->vip && $amount > 100) {
            return 'Approve';
        }
        return self::DECLINE;
    }
}`, 'php');
  assert.deepEqual(d.inputs.map((p) => p.name), ['amount', 'order']);
  assert.equal(d.rules[1].when, 'order.vip and amount > 100');
  for (const [a, vip, want] of [[2000, false, 'Review'], [500, true, 'Approve'], [500, false, 'DECLINE']]) assert.equal(decide(d, { amount: a, order: { vip } }), want);
});

test('PHP 8 match with several values, match(true), and switch', () => {
  const m = decision(`<?php function zone(string $country): string {
    return match($country) {
        'US', 'CA' => 'NorthAmerica',
        'FR' => 'Europe',
        default => 'Other',
    };
}`, 'php');
  for (const [c, want] of [['US', 'NorthAmerica'], ['CA', 'NorthAmerica'], ['FR', 'Europe'], ['JP', 'Other']]) assert.equal(decide(m, { country: c }), want);
  const t = decision(`<?php function band(int $score): string {
    return match(true) {
        $score >= 90 => 'A',
        $score >= 80 => 'B',
        default => 'C',
    };
}`, 'php');
  for (const [s, want] of [[95, 'A'], [85, 'B'], [10, 'C']]) assert.equal(decide(t, { score: s }), want);
  const sw = decision(`<?php function tier($plan) {
    switch ($plan) {
        case 'free':
        case 'trial':
            return 'Basic';
        default:
            return 'Plus';
    }
}`, 'php');
  assert.equal(decide(sw, { plan: 'trial' }), 'Basic');
  assert.equal(decide(sw, { plan: 'pro' }), 'Plus');
});

test('PHP guards: throw, Laravel abort and abort_unless, and routes', () => {
  const items = read(`<?php
Route::post('/refunds', function (Request $request) {
    abort_unless($request->user()->isAdmin(), 403);
    if (!$request->amount) {
        abort(422);
    }
    return Refund::create($request->all());
});
class Api {
    #[Route('/orders', methods: ['DELETE'])]
    public function remove(int $id): void {
        if ($id <= 0) {
            throw new InvalidArgumentException("bad id");
        }
        $this->repo->delete($id);
    }
}`, 'php');
  const route = items.find((i) => i.route?.path === '/refunds');
  assert.equal(route.route.method, 'POST');
  assert.equal(route.guards[0].effect.name, '403');
  assert.equal(route.guards[1].effect.name, '422');
  const remove = items.find((i) => i.name === 'remove');
  assert.equal(remove.route.method, 'DELETE');
  assert.equal(remove.guards[0].effect.name, 'InvalidArgumentException');
  assert.equal(remove.guards[0].when, 'id <= 0');
});

// ── Ruby ───────────────────────────────────────────────────────────────────────────────────

const RUBY = `class Refunds
  def decide(amount, vip: false)
    return :review if amount > 1000
    if vip && amount > 100
      :approve
    elsif amount <= 20
      :approve
    else
      :decline
    end
  end

  def tier(plan)
    case plan
    when :free, :trial then "Basic"
    when :pro
      "Plus"
    else
      "Custom"
    end
  end

  def grade(score)
    case score
    when 90..100 then "A"
    when 80...90 then "B"
    else "C"
    end
  end

  def size(n)
    n > 10 ? "Big" : "Small"
  end

  def label(user)
    return "Guest" unless user.signed_in?
    "Member"
  end
end`;

const runRuby = (method, args) => ruby(RUBY, `Refunds.new.${method}(${args})`);

test('Ruby implicit returns, modifier if/unless, symbols, case/when with ranges', { skip: !ruby && 'ruby is not installed' }, () => {
  const items = read(RUBY, 'ruby');
  const by = (n) => { const d = items.find((i) => i.name === n); assert.equal(d.kind, 'decision', `${n}: ${JSON.stringify(d.unread)}`); assert.equal(d.status, 'read', JSON.stringify(d.unread)); return d; };
  const decideRb = by('decide');
  for (const [a, vip] of [[2000, false], [500, true], [500, false], [20, false], [21, false], [101, true], [100, true]]) {
    const want = runRuby('decide', `${a}, vip: ${vip}`).replace(/^:/, '');
    assert.equal(decide(decideRb, { amount: a, vip }), want, `decide(${a}, vip: ${vip})`);
  }
  const tier = by('tier');
  for (const plan of [':free', ':trial', ':pro', ':enterprise']) assert.equal(decide(tier, { plan: plan.slice(1) }), runRuby('tier', plan));
  const grade = by('grade');
  for (const s of [100, 95, 90, 89, 85, 80, 79, 101]) assert.equal(decide(grade, { score: s }), runRuby('grade', s), `grade(${s})`);
  const size = by('size');
  for (const n of [11, 10, 0]) assert.equal(decide(size, { n }), runRuby('size', n));
  const label = by('label');
  for (const signed of [true, false]) {
    const want = ruby(`${RUBY}\nU = Struct.new(:signed_in?)`, `Refunds.new.label(U.new(${signed}))`);
    assert.equal(decide(label, { user: { signed_in: signed } }), want);
  }
});

test('Ruby guards (raise, head, return unless) and Sinatra routes', () => {
  const items = read(`post '/refunds' do
  halt 401 unless signed_in?
  Refund.create(params)
end

class OrdersController
  def destroy(order)
    raise ArgumentError, "missing order" if order.nil?
    raise NotAllowed unless order.owner == current_user
    head :forbidden if order.locked
    order.destroy
  end
end`, 'ruby');
  const route = items.find((i) => i.route?.method === 'POST' && i.route.path === '/refunds');
  assert.equal(route.guards[0].effect.name, '401');
  const d = items.find((i) => i.name === 'destroy');
  assert.equal(d.kind, 'function');
  assert.deepEqual(d.guards.map((g) => g.effect.name), ['ArgumentError', 'NotAllowed', 'forbidden']);
  assert.equal(d.guards[0].readable, false); // order.nil? is not guessed as a field
  assert.equal(d.guards[0].effect.detail, 'missing order');
  assert.equal(d.guards[2].when, 'order.locked');
});

test('Language detection and a branch that does real work is not read', () => {
  assert.equal(detectLanguage('<?php\nfunction a($x) { return 1; }'), 'php');
  assert.equal(detectLanguage('fun main() {\n println("hi")\n}'), 'kotlin');
  assert.equal(detectLanguage('def hello(name)\n  "hi"\nend\n'), 'ruby');
  const [r] = read(`def charge(amount)
  if amount > 100
    log(amount)
    :review
  else
    :ok
  end
end`, 'ruby');
  assert.notEqual(r.kind, 'decision');
  assert.ok(r.unread.length);
});

test('Text built from values ("#{x}", "$x", "${x}") is computed, never a fixed answer', () => {
  const [r] = read(`def label(asset)
  if asset
    "-assetFile #{asset}"
  else
    "-f"
  end
end`, 'ruby');
  assert.notEqual(r.kind, 'decision');
  const [k] = read(`fun greet(vip: Boolean): String {
    if (vip) return "Hi $name"
    return "Hello"
}`, 'kotlin');
  assert.notEqual(k.kind, 'decision');
  const [p] = read(`<?php function greet($vip) { if ($vip) { return "Hi {$name}"; } return 'Hello'; }`, 'php');
  assert.ok(p.kind !== 'decision' || !p.rules.some((x) => x.result.includes('{')));
  const [c] = read(`def current_body
  !!status ? :response_body : :request_body
end`, 'ruby');
  assert.equal(c.rules[0].when, 'status');
});

test('Ruby: rescue, === and `when SomeClass` are never read as plain equality or as the answer', () => {
  const [a] = read(`def cols
  return 80 unless output.tty?
  terminal.size
rescue NoMethodError
  return 80
end`, 'ruby');
  assert.notEqual(a.kind, 'decision');
  assert.ok(a.unread.some((u) => /rescue/.test(u.reason)));
  const [b] = read(`def hit(pattern, name)
  return true if pattern === name
  false
end`, 'ruby');
  assert.notEqual(b.kind, 'decision');
  const [c] = read(`def kind(fault)
  case fault
  when Omission then :omissions
  else :other
  end
end`, 'ruby');
  assert.notEqual(c.kind, 'decision');
  const [d] = read(`def code(level)
  case level
  when HIGH, LOW then :set
  else :unset
  end
end`, 'ruby');
  assert.equal(d.kind, 'decision'); // SCREAMING_CASE constants are values, compared by equality
});

test('Ruby subclass checks, text ordering, and nil labels are not read as comparisons', () => {
  assert.notEqual(read(`def ok?(target)
  return false unless target < Struct
  true
end`, 'ruby')[0].kind, 'decision');
  assert.notEqual(read(`def new?(v)
  v >= "3.2" ? :yes : :no
end`, 'ruby')[0].kind, 'decision');
  assert.notEqual(read(`def t(s)
  case s
  when ".", nil then :both
  else :one
  end
end`, 'ruby')[0].kind, 'decision');
  const [n] = read(`def big?(n)
  n > LIMIT ? :yes : :no
end`, 'ruby');
  assert.equal(n.kind, 'decision'); // a SCREAMING_CASE constant is a number to compare with
});
