/**
 * Colors for plain ThunderLang (.thunder-plain). Each kind of word keeps one hue everywhere it
 * appears: the text, the picture, and the comparison. It reuses the site's ThunderLang palette
 * (globals.css .tok-*), so nothing here uses green or red, which stay reserved for passes/fails.
 * Display only: the grammar lives in compiler/src/plain-contract.mjs.
 */
import type { Token } from "./thunder-tokens";

/** One color role per kind of word. The legend on /try reads from this. */
export const PLAIN_ROLES = {
  structure: { cls: "tok-key", label: "Structure words", sample: "We need · when · Otherwise" },
  question: { cls: "tok-fn", label: "The decision’s question", sample: "When do we approve a refund?" },
  input: { cls: "tok-id", label: "Facts the rule reads", sample: "the amount · on time" },
  compare: { cls: "tok-op", label: "Comparisons", sample: "at least · at most · under" },
  value: { cls: "tok-num", label: "Amounts and numbers", sample: "$100" },
  outcome: { cls: "tok-type", label: "Outcomes", sample: "Approve · Review" },
  name: { cls: "tok-str", label: "Example names", sample: "(at the limit)" },
} as const;

const STRUCTURE = ["all of these are true:", "any of these is true:", "all of these are true", "any of these is true", "We need", "Examples", "Otherwise,", "Otherwise", "whether it is", "Why:", "when", "gives", "in dollars", "a number", "it is", " or "];
const COMPARE = ["at least", "at most", "less than", "more than", "exactly", "under", "below", "over", "above"];

function vocabulary(source: string) {
  const inputs: string[] = [], outcomes: string[] = [];
  let section = "";
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!/^\s/.test(raw) && line) section = line === "We need" ? "need" : line.endsWith("?") ? "decide" : line === "Examples" ? "examples" : "";
    let m;
    if (section === "need" && (m = line.match(/^whether it is (.+?) or (.+?)\.?$/))) inputs.push(m[1], m[2]);
    else if (section === "need" && (m = line.match(/^(the .+?),/))) inputs.push(m[1]);
    else if (section === "decide" && (m = line.match(/^([A-Z][A-Za-z]*) when\b/))) outcomes.push(m[1]);
    else if (section === "decide" && (m = line.match(/^Otherwise,?\s+([A-Z][A-Za-z]*)/))) outcomes.push(m[1]);
  }
  return { inputs: inputs.sort((a, b) => b.length - a.length), outcomes };
}

/** Tokenize a whole plain contract, one array of tokens per line. */
export function tokenizePlain(source: string): Token[][] {
  const { inputs, outcomes } = vocabulary(source);
  const phrases: Array<[string, string]> = [
    ...STRUCTURE.map(p => [p, PLAIN_ROLES.structure.cls] as [string, string]),
    ...COMPARE.map(p => [p, PLAIN_ROLES.compare.cls] as [string, string]),
    ...inputs.map(p => [p, PLAIN_ROLES.input.cls] as [string, string]),
    ...outcomes.map(p => [p, PLAIN_ROLES.outcome.cls] as [string, string]),
  ].sort((a, b) => b[0].length - a[0].length);
  let titled = false;
  return source.split("\n").map(raw => {
    const line = raw.trim();
    if (line.startsWith("#")) return [{ text: raw, cls: "tok-comment" }];
    if (line && !titled && !/^\s/.test(raw)) { titled = true; return [{ text: raw, cls: "font-semibold text-white" }]; }
    if (line.endsWith("?") && !/^\s/.test(raw)) return [{ text: raw, cls: `${PLAIN_ROLES.question.cls} font-semibold` }];
    if (/^Why:/.test(line)) return [{ text: "Why:", cls: PLAIN_ROLES.structure.cls }, { text: raw.slice(4), cls: "text-haze-200" }];
    const out: Token[] = [];
    let i = 0, plain = "";
    const flush = () => { if (plain) { out.push({ text: plain }); plain = ""; } };
    const boundary = (at: number) => at <= 0 || at >= raw.length || /[\s,.(:]/.test(raw[at - 1] ?? " ");
    while (i < raw.length) {
      const name = raw.slice(i).match(/^\([^)]*\)/);
      if (name) { flush(); out.push({ text: name[0], cls: PLAIN_ROLES.name.cls }); i += name[0].length; continue; }
      const num = raw.slice(i).match(/^-?\$?-?\d[\d,]*(?:\.\d+)?/);
      if (num && boundary(i)) { flush(); out.push({ text: num[0], cls: PLAIN_ROLES.value.cls }); i += num[0].length; continue; }
      const hit = phrases.find(([p]) => raw.startsWith(p, i) && (p.startsWith(" ") || boundary(i)) && !/[A-Za-z]/.test(raw[i + p.length] ?? " "));
      if (hit) { flush(); out.push({ text: hit[0], cls: hit[1] }); i += hit[0].length; continue; }
      plain += raw[i++];
    }
    flush();
    return out;
  });
}
