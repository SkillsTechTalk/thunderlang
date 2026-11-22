/**
 * Thunder map (prototype): a whole app read in Thunder, from services down to function cards.
 * Rules come from the real Thunder code reader (readRepo) and plainFromReading. Services, files,
 * and integrations are found with simple, explicit patterns in this prototype; in OpenThunder they
 * come from discovery (archgraph). Everything is read from code: no person has confirmed these rules.
 * Deterministic: same files in, same map out.
 */
import { readRepo } from "../../compiler/src/read-repo.mjs";
import { explainPlain, formatValue, plainFromReading } from "../../compiler/src/plain-contract.mjs";
import type { PlainModel } from "../../compiler/src/plain-contract.d.mts";

export type IntegrationKind = "http" | "external" | "database" | "event-out" | "event-in";
export interface Integration { kind: IntegrationKind; target: string; line: number; file: string }
export interface MapItem {
  id: string; service: string; file: string; name: string; readable: string; line: number;
  kind: "decision" | "function" | "error" | "test" | "route"; status: string; says: string;
  card: PlainModel | null; facts: string[]; outcomes: string[]; unread: Array<{ line: number; text: string; reason: string }>;
}
export interface MapModule { file: string; language: string; items: string[]; integrations: Integration[]; summary: string }
export interface MapService { name: string; languages: string[]; modules: MapModule[]; integrations: Integration[]; summary: string }
export interface MapEdge { from: string; to: string; kind: "http" | "event"; label: string }
export interface Disagreement { items: [string, string]; values: string; answers: [string, string] }
export interface FocusItem { rank: number; kind: "disagreement" | "money" | "personal-data" | "unconfirmed" | "unreadable"; title: string; reason: string; itemId: string }
export interface ThunderMap {
  app: string; summary: string; services: MapService[]; edges: MapEdge[]; items: Record<string, MapItem>;
  lenses: { facts: Record<string, string[]>; outcomes: Record<string, string[]> };
  disagreements: Disagreement[]; focus: FocusItem[]; sources: Record<string, string>;
}

/** "within_window" and "withinWindow" both read "within window". */
export const readable = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Prototype integration patterns. Each is explicit so a reader can see why something was found.
const PATTERNS: Array<{ kind: IntegrationKind; re: RegExp; target: (m: RegExpMatchArray) => string }> = [
  { kind: "http", re: /(?:fetch|requests\.(?:get|post|put|delete))\(\s*["'`]https?:\/\/([a-z0-9-]+)/i, target: m => m[1] },
  { kind: "external", re: /\bstripe\./i, target: () => "Stripe" },
  { kind: "external", re: /\bsendEmail\(/, target: () => "Email provider" },
  { kind: "database", re: /\bdb\.(?:insert|update|select|delete)\(\s*["'`]([\w.]+)/, target: m => m[1] },
  { kind: "event-out", re: /\bevents?\.publish\(\s*["'`]([\w.]+)/, target: m => m[1] },
  { kind: "event-in", re: /\bfunction\s+on([A-Z]\w+)\s*\(/, target: m => readable(m[1]).replace(/ /g, ".") },
];
const MONEY = /^(amount|price|total|charge|balance|refund)/i;
const PERSONAL = /\b(email|phone|address|ssn|birth)/i;

function findIntegrations(file: string, source: string): Integration[] {
  const out: Integration[] = [];
  source.split("\n").forEach((text, i) => {
    for (const p of PATTERNS) { const m = text.match(p.re); if (m) out.push({ kind: p.kind, target: p.target(m), line: i + 1, file }); }
  });
  return out;
}

function decisionSummary(items: MapItem[], integrations: Integration[]) {
  const decisions = items.filter(i => i.kind === "decision" && i.card);
  const unreadable = items.filter(i => i.kind === "function" && i.status !== "read");
  const parts: string[] = [];
  if (decisions.length) parts.push(`decides ${plural(decisions.length, "thing")} (${decisions.map(d => d.readable).join(", ")})`);
  const calls = [...new Set(integrations.filter(i => i.kind === "http" || i.kind === "external").map(i => i.target))];
  if (calls.length) parts.push(`calls ${calls.join(", ")}`);
  const writes = [...new Set(integrations.filter(i => i.kind === "database").map(i => i.target))];
  if (writes.length) parts.push(`writes ${writes.map(w => `the ${w} table`).join(", ")}`);
  const pubs = [...new Set(integrations.filter(i => i.kind === "event-out").map(i => i.target))];
  if (pubs.length) parts.push(`announces ${pubs.join(", ")}`);
  const subs = [...new Set(integrations.filter(i => i.kind === "event-in").map(i => i.target))];
  if (subs.length) parts.push(`reacts to ${subs.join(", ")}`);
  if (unreadable.length) parts.push(`${plural(unreadable.length, "function")} Thunder can't fully read yet`);
  return parts.length ? parts.join("; ") : "nothing Thunder could read";
}

/** Probe two decisions that look like the same rule and return the first case where they answer differently. */
function compare(a: PlainModel, b: PlainModel): { values: string; answers: [string, string] } | null {
  if (a.inputs.length !== b.inputs.length || a.inputs.some((x, i) => x.kind !== b.inputs[i].kind)) return null;
  const literals = (m: PlainModel, i: number) => m.rules.flatMap(r => r.conditions).filter(c => c.input === m.inputs[i].id && typeof c.value === "number").map(c => c.value as number);
  const options = a.inputs.map((input, i) => input.kind === "yesno" ? [true, false]
    : [...new Set([...literals(a, i), ...literals(b, i)].flatMap(n => [n - 1, n, n + 1]))].sort((x, y) => x - y));
  const cases: Array<Array<number | boolean>> = options.reduce<Array<Array<number | boolean>>>((acc, opts) => acc.flatMap(c => opts.map(o => [...c, o])), [[]]);
  for (const values of cases) {
    const va = Object.fromEntries(a.inputs.map((x, i) => [x.id, values[i]]));
    const vb = Object.fromEntries(b.inputs.map((x, i) => [x.id, values[i]]));
    const ra = explainPlain(a, va).outcome, rb = explainPlain(b, vb).outcome;
    if (ra !== rb) return { values: a.inputs.map((x, i) => x.kind === "yesno" ? formatValue(x, values[i] as never) : `${readable(x.id)} ${formatValue(x, values[i] as never)}`).join(", "), answers: [String(ra), String(rb)] };
  }
  return null;
}

export function buildThunderMap(app: string, files: Array<{ path: string; source: string }>): ThunderMap {
  const reading = readRepo(files);
  const items: Record<string, MapItem> = {};
  for (const it of reading.items) {
    const id = `${it.file}#${it.name}`;
    if (items[id]) continue;
    const card = it.kind === "decision" ? plainFromReading(it) : null;
    if (card) card.title = readable(it.name).replace(/^./, c => c.toUpperCase());
    items[id] = {
      id, service: it.file.split("/")[0], file: it.file, name: it.name, readable: readable(it.name), line: it.line,
      kind: it.kind, status: it.status, says: it.says, card,
      facts: (it.inputs ?? []).filter(i => i.type === "number" || i.type === "boolean").map(i => readable(i.name)),
      outcomes: [...new Set([...(it.rules ?? []).map(r => r.result), ...(it.otherwise ? [it.otherwise.result] : [])])].filter(o => /^[A-Z][A-Za-z]*$/.test(o)),
      unread: it.unread ?? [],
    };
  }
  const integrations = files.flatMap(f => findIntegrations(f.path, f.source));
  const serviceNames = [...new Set(files.map(f => f.path.split("/")[0]))].sort();
  const services: MapService[] = serviceNames.map(name => {
    const modules: MapModule[] = files.filter(f => f.path.startsWith(`${name}/`)).map(f => {
      const mine = Object.values(items).filter(i => i.file === f.path && (i.kind === "decision" || i.kind === "function"));
      const ints = integrations.filter(i => i.file === f.path);
      return { file: f.path, language: f.path.endsWith(".py") ? "Python" : "TypeScript", items: mine.map(i => i.id), integrations: ints, summary: decisionSummary(mine, ints) };
    });
    const all = modules.flatMap(m => m.items.map(id => items[id]));
    const ints = modules.flatMap(m => m.integrations);
    return { name, languages: [...new Set(modules.map(m => m.language))], modules, integrations: ints, summary: decisionSummary(all, ints) };
  });
  const edges: MapEdge[] = [];
  for (const i of integrations) {
    const from = i.file.split("/")[0];
    if (i.kind === "http" && serviceNames.includes(i.target)) edges.push({ from, to: i.target, kind: "http", label: `${from} calls ${i.target} over HTTP` });
    if (i.kind === "event-out") for (const sub of integrations.filter(s => s.kind === "event-in" && s.target === i.target)) {
      edges.push({ from, to: sub.file.split("/")[0], kind: "event", label: `${from} announces ${i.target}; ${sub.file.split("/")[0]} reacts` });
    }
  }
  // Lenses: every fact and outcome, and where it appears.
  const facts: Record<string, string[]> = {}, outcomes: Record<string, string[]> = {};
  for (const it of Object.values(items)) {
    for (const f of it.facts) (facts[f] ??= []).push(it.id);
    for (const o of it.outcomes) (outcomes[o] ??= []).push(it.id);
  }
  // Disagreements: decisions with the same readable name in different services.
  const disagreements: Disagreement[] = [];
  const decisions = Object.values(items).filter(i => i.card);
  for (let x = 0; x < decisions.length; x++) for (let y = x + 1; y < decisions.length; y++) {
    const a = decisions[x], b = decisions[y];
    if (a.readable !== b.readable || a.service === b.service) continue;
    const diff = compare(a.card as PlainModel, b.card as PlainModel);
    if (diff) disagreements.push({ items: [a.id, b.id], values: diff.values, answers: diff.answers });
  }
  // Focus: where a person should look first, each with its reason.
  const focus: Omit<FocusItem, "rank">[] = [];
  for (const d of disagreements) {
    const [a, b] = d.items.map(id => items[id]);
    focus.push({ kind: "disagreement", itemId: a.id, title: `${a.service} and ${b.service} disagree on “${a.readable}”`,
      reason: `For ${d.values}: ${a.service} says ${d.answers[0]}, ${b.service} says ${d.answers[1]}.` });
  }
  for (const it of Object.values(items)) {
    const ints = integrations.filter(i => i.file === it.file && i.kind === "external");
    const fileText = files.find(f => f.path === it.file)?.source ?? "";
    if (it.kind === "function" && ints.some(i => i.target === "Stripe")) focus.push({ kind: "money", itemId: it.id, title: `${it.readable} moves money`, reason: "Calls Stripe. Thunder can't fully read this function yet, so read the code." });
    else if (it.kind === "function" && PERSONAL.test(fileText) && ints.length) focus.push({ kind: "personal-data", itemId: it.id, title: `${it.readable} sends personal data`, reason: `Uses a customer's email and calls ${ints.map(i => i.target).join(", ")}.` });
  }
  for (const it of decisions) if (it.facts.some(f => MONEY.test(f)) && !disagreements.some(d => d.items.includes(it.id))) {
    focus.push({ kind: "unconfirmed", itemId: it.id, title: `${it.readable} decides about money`, reason: "Read from code only: no examples, and no person has confirmed this is what the business wants." });
  }
  for (const it of Object.values(items)) if (it.kind === "function" && it.status !== "read" && !focus.some(f => f.itemId === it.id)) {
    focus.push({ kind: "unreadable", itemId: it.id, title: `Thunder can't fully read ${it.readable}`, reason: "Shown as a dashed card. A person should read this code." });
  }
  const order = ["disagreement", "money", "personal-data", "unconfirmed", "unreadable"];
  const ranked = focus.sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind) || p.itemId.localeCompare(q.itemId)).map((f, i) => ({ ...f, rank: i + 1 }));
  const nDecisions = decisions.length;
  const nInts = new Set(integrations.filter(i => i.kind !== "event-in" && i.kind !== "http").map(i => `${i.kind}:${i.target}`)).size;
  const summary = `${plural(services.length, "service")} in ${[...new Set(services.flatMap(s => s.languages))].join(" and ")}. ${plural(nDecisions, "rule")} Thunder can draw, ${plural(nInts, "outside connection")}, and ${plural(ranked.length, "place")} worth looking at first.`;
  return { app, summary, services, edges, items, lenses: { facts, outcomes }, disagreements, focus: ranked, sources: Object.fromEntries(files.map(f => [f.path, f.source])) };
}
