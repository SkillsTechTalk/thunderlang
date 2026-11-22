// switch / match in six languages. Each recovered decision is EXECUTED on inputs and compared with
// what the code itself would answer, so the test checks meaning, not just shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { parseIntent } from '../src/parse.mjs';
import { evaluateDecision } from '../src/runtime.mjs';

const decide = (item, inputs) => evaluateDecision(parseIntent(item.thunder).decisions[0], inputs).result;
const only = (src, language) => {
  const items = readCode(src, { language }).items.filter((i) => i.kind === 'decision');
  assert.equal(items.length, 1, JSON.stringify(readCode(src, { language }).items.map((i) => [i.kind, i.name, i.unread]), null, 1));
  assert.equal(items[0].status, 'read', JSON.stringify(items[0].unread));
  return items[0];
};

test('TypeScript switch with fall-through and default', () => {
  const d = only(`function zone(country: string): string {
  switch (country) {
    case "US":
    case "CA":
      return "NorthAmerica";
    case "FR":
      return "Europe";
    default:
      return "Other";
  }
}`, 'typescript');
  assert.equal(d.rules[0].when, 'country == "US" or country == "CA"');
  for (const [c, want] of [['US', 'NorthAmerica'], ['CA', 'NorthAmerica'], ['FR', 'Europe'], ['JP', 'Other']]) assert.equal(decide(d, { country: c }), want);
});

test('Java arrow switch expression with several labels and enum constants', () => {
  const d = only(`class P { static String tier(Plan plan) {
    return switch (plan) {
      case FREE, TRIAL -> "Basic";
      case PRO -> "Plus";
      default -> "Custom";
    };
  } }`, 'java');
  assert.equal(d.rules[0].when, 'plan == FREE or plan == TRIAL');
  assert.equal(decide(d, { plan: 'TRIAL' }), 'Basic');
  assert.equal(decide(d, { plan: 'ENTERPRISE' }), 'Custom');
});

test('C# switch expression with relational patterns and discard', () => {
  const d = only(`static class G { public static string Letter(int score) => score switch {
    >= 90 => "A",
    >= 80 => "B",
    _ => "F",
  }; }`, 'csharp');
  assert.deepEqual(d.rules.map((r) => r.when), ['score >= 90', 'score >= 80']);
  for (const [s, want] of [[95, 'A'], [90, 'A'], [89, 'B'], [10, 'F']]) assert.equal(decide(d, { score: s }), want);
});

test('Go value switch and subject-less switch', () => {
  const v = only(`package p
func Color(status string) string {
	switch status {
	case "ok", "done":
		return "Green"
	case "late":
		return "Amber"
	}
	return "Red"
}`, 'go');
  assert.equal(decide(v, { status: 'done' }), 'Green');
  assert.equal(decide(v, { status: 'lost' }), 'Red');
  const c = only(`package p
func Band(temp float64) string {
	switch {
	case temp < 0:
		return "Freezing"
	case temp < 20:
		return "Cool"
	default:
		return "Warm"
	}
}`, 'go');
  for (const [t, want] of [[-5, 'Freezing'], [0, 'Cool'], [19, 'Cool'], [25, 'Warm']]) assert.equal(decide(c, { temp: t }), want);
});

test('Rust match with alternatives, ranges, guards, and a catch-all binding', () => {
  const d = only(`fn shipping(weight: u32, region: Region) -> &'static str {
    match weight {
        0 => "Free",
        1..=5 => "Small",
        w if w > 100 => "Freight",
        _ => "Standard",
    }
}`, 'rust');
  assert.deepEqual(d.rules.map((r) => r.when), ['weight == 0', 'weight >= 1 and weight <= 5', 'weight > 100']);
  for (const [w, want] of [[0, 'Free'], [1, 'Small'], [5, 'Small'], [6, 'Standard'], [101, 'Freight']]) assert.equal(decide(d, { weight: w }), want);
  const e = only(`fn label(region: Region) -> &'static str {
    match region {
        Region::Us | Region::Ca => "Domestic",
        other => "International",
    }
}`, 'rust');
  assert.equal(e.rules[0].when, 'region == Us or region == Ca');
  assert.equal(decide(e, { region: 'Mx' }), 'International');
});

test('Python match with alternatives, guard, and wildcard', () => {
  const d = only(`def priority(level: str, minutes: int) -> str:
    match level:
        case "critical" | "high":
            return "Page"
        case "low" if minutes > 60:
            return "Ticket"
        case _:
            return "Ignore"
`, 'python');
  assert.equal(decide(d, { level: 'high', minutes: 0 }), 'Page');
  assert.equal(decide(d, { level: 'low', minutes: 90 }), 'Ticket');
  assert.equal(decide(d, { level: 'low', minutes: 10 }), 'Ignore');
});

test('a switch with any case doing real work is not shown as rules, and says why', () => {
  const r = readCode(`function handle(kind: string) {
  switch (kind) {
    case "a": return "A";
    case "b": log(kind); return "B";
    default: return "C";
  }
}`, { language: 'typescript' }).items[0];
  assert.equal(r.kind, 'function');
  assert.match(r.unread[0].reason, /does more than give a fixed answer/);
});

test('single-quoted labels with punctuation, a trailing null case, and TypeScript strings', () => {
  const r = readCode(`export function honesty(p: string): string | null {
  switch (p) {
    case 'deterministic':
    case 'scanner':
      return 'tool_verified';
    case 'user-claim':
      return 'user_authored';
    default:
      return 'none';
  }
}`, { language: 'typescript' }).items[0];
  assert.equal(r.kind, 'decision', JSON.stringify(r.unread));
  assert.equal(decide(r, { p: 'user-claim' }), 'user_authored');
  assert.equal(decide(r, { p: 'scanner' }), 'tool_verified');
});
