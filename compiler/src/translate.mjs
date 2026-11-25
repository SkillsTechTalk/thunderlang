// Browser-safe decision translator: renders each decision as a readable, typed function in a
// target language. It uses the SAME expression translators (exprTo*) and the SAME input-type
// inference as the executable target adapters (target-*.mjs), minus their test harness, so what
// a reader sees here matches what `thunder test <file> --target <lang>` compiles and runs.
// Deterministic, no AI, no Node imports.
//
// A rule condition a language cannot express is never shown as `false`: the rule calls a helper
// that throws with the IL-GEN-001 message, and translateDecisionsWithDiagnostics() reports it.
// Money inputs render with each language's exact type (bigint minor units, Decimal, BigDecimal,
// decimal, int64/i64 minor units), never a float.
import { exprToJs, exprToPython, exprToGo, exprToRust, exprToCSharp, exprToJava } from './expr.mjs';
import { inputNames, inferInputTypes, strLit, planDecision } from './target-types.mjs';

const RELATIONAL = /^(<=|>=|<|>)$/;

/**
 * Example values decide an input's type first (as the target adapters do). With no example value
 * for an input, fall back to how the rules use it: a relational comparison means number, a bare
 * operand of and/or/not means bool, anything else stays string.
 */
function typesFor(ast, dec) {
  const names = inputNames(dec);
  const types = inferInputTypes(ast, dec);
  const hasExample = (n) => (ast.tests || []).some((t) => t.name === dec.name && (t.cases || []).some((c) => (c.given || {})[n] != null));
  // A declared type (`amount: number`, as the reader and typed contracts emit) wins outright.
  const declared = {};
  for (const raw of dec.inputs || []) {
    const m = String(raw).match(/^\s*(\w+)\s*:\s*(number|boolean|bool|string)\s*$/);
    if (m) declared[m[1]] = m[2] === 'boolean' ? 'bool' : m[2];
  }
  for (const n of names) {
    if (declared[n]) { types[n] = declared[n]; continue; }
    if (types[n] === 'money') continue; // a declared Money input keeps its exact type
    if (hasExample(n)) continue;
    let guess = 'string';
    for (const r of dec.rules || []) {
      const toks = String(r.when || '').split(/\s+|(?=[()])|(?<=[()])/).filter(Boolean);
      toks.forEach((t, i) => {
        if (t !== n) return;
        if (RELATIONAL.test(toks[i - 1] || '') || RELATIONAL.test(toks[i + 1] || '')) guess = 'number';
        else if (guess === 'string' && !/^(==|!=|in)$/.test(toks[i + 1] || '') && !/^(==|!=)$/.test(toks[i - 1] || '')) guess = 'bool';
      });
    }
    types[n] = guess;
  }
  return types;
}

const LANGS = {
  typescript: {
    label: 'TypeScript', translate: exprToJs,
    types: { number: 'number', bool: 'boolean', string: 'string', money: 'bigint' },
    helper: ['function thunderUntranslated(message: string): boolean { throw new Error(message); }'],
    untranslated: (m) => `thunderUntranslated(${strLit(m)})`,
    emit(d, names, types, conds) {
      const params = names.map((n) => `${n}: ${this.types[types[n]]}`).join(', ');
      const L = [`export function ${d.name}(${params}): string {`];
      (d.rules || []).forEach((r, i) => L.push(`  if (${conds[i]}) return ${strLit(r.result)};`));
      L.push(`  return ${strLit(d.default ?? '')};`, '}');
      return L;
    },
  },
  python: {
    label: 'Python', translate: exprToPython,
    types: { number: 'float', bool: 'bool', string: 'str', money: 'Decimal' },
    moneyImport: 'from decimal import Decimal',
    helper: ['def _thunder_untranslated(message: str) -> bool:', '    raise NotImplementedError(message)'],
    untranslated: (m) => `_thunder_untranslated(${strLit(m)})`,
    emit(d, names, types, conds) {
      const params = names.map((n) => `${n}: ${this.types[types[n]]}`).join(', ');
      const L = [`def ${d.name}(${params}) -> str:`];
      (d.rules || []).forEach((r, i) => L.push(`    if ${conds[i]}:`, `        return ${strLit(r.result)}`));
      L.push(`    return ${strLit(d.default ?? '')}`);
      return L;
    },
  },
  go: {
    label: 'Go', translate: exprToGo,
    types: { number: 'float64', bool: 'bool', string: 'string', money: 'int64' },
    helper: ['func thunderUntranslated(message string) bool {', '\tpanic(message)', '}'],
    untranslated: (m) => `thunderUntranslated(${strLit(m)})`,
    emit(d, names, types, conds) {
      const params = names.map((n) => `${n} ${this.types[types[n]]}`).join(', ');
      const L = [`func ${d.name}(${params}) string {`];
      (d.rules || []).forEach((r, i) => L.push(`\tif ${conds[i]} {`, `\t\treturn ${strLit(r.result)}`, '\t}'));
      L.push(`\treturn ${strLit(d.default ?? '')}`, '}');
      return L;
    },
  },
  rust: {
    label: 'Rust', translate: exprToRust,
    types: { number: 'f64', bool: 'bool', string: '&str', money: 'i64' },
    helper: ['fn thunder_untranslated(message: &str) -> bool {', '    panic!("{}", message)', '}'],
    untranslated: (m) => `thunder_untranslated(${strLit(m)})`,
    emit(d, names, types, conds) {
      const params = names.map((n) => `${n}: ${this.types[types[n]]}`).join(', ');
      const L = [`fn ${d.name}(${params}) -> &'static str {`];
      (d.rules || []).forEach((r, i) => L.push(`    if ${conds[i]} {`, `        return ${strLit(r.result)};`, '    }'));
      L.push(`    ${strLit(d.default ?? '')}`, '}');
      return L;
    },
  },
  csharp: {
    label: 'C#', translate: exprToCSharp,
    types: { number: 'double', bool: 'bool', string: 'string', money: 'decimal' },
    helper: ['public static bool ThunderUntranslated(string message) => throw new NotImplementedException(message);'],
    untranslated: (m) => `ThunderUntranslated(${strLit(m)})`,
    emit(d, names, types, conds) {
      const params = names.map((n) => `${this.types[types[n]]} ${n}`).join(', ');
      const L = [`public static string ${d.name}(${params})`, '{'];
      (d.rules || []).forEach((r, i) => L.push(`    if (${conds[i]}) return ${strLit(r.result)};`));
      L.push(`    return ${strLit(d.default ?? '')};`, '}');
      return L;
    },
  },
  java: {
    label: 'Java', translate: exprToJava,
    types: { number: 'double', bool: 'boolean', string: 'String', money: 'java.math.BigDecimal' },
    helper: ['public static boolean thunderUntranslated(String message) { throw new UnsupportedOperationException(message); }'],
    untranslated: (m) => `thunderUntranslated(${strLit(m)})`,
    emit(d, names, types, conds) {
      const params = names.map((n) => `${this.types[types[n]]} ${n}`).join(', ');
      const L = [`public static String ${d.name}(${params}) {`];
      (d.rules || []).forEach((r, i) => L.push(`    if (${conds[i]}) return ${strLit(r.result)};`));
      L.push(`    return ${strLit(d.default ?? '')};`, '}');
      return L;
    },
  },
};

export const TRANSLATE_LANGUAGES = Object.entries(LANGS).map(([key, l]) => ({ key, label: l.label }));

/**
 * Translate every decision into `lang` and report generation diagnostics: one IL-GEN-001 error per
 * rule condition the language cannot express (that rule throws in the output instead of guessing).
 */
export function translateDecisionsWithDiagnostics(ast, lang) {
  const L = LANGS[lang];
  if (!L) throw new Error(`Unknown language ${lang}. Use one of: ${Object.keys(LANGS).join(', ')}.`);
  const comment = lang === 'python' ? '#' : '//';
  const plans = (ast.decisions || []).map((d) => planDecision(ast, d, { translate: L.translate, target: L.label }));
  const diagnostics = plans.flatMap((p) => p.diagnostics);
  const out = [`${comment} Generated from ThunderLang. Deterministic, no AI. The first matching rule wins.`];
  if (L.moneyImport && plans.some((p) => Object.keys(p.money).length)) out.push(L.moneyImport);
  if (diagnostics.length) out.push('', `${comment} IL-GEN-001: Thunder could not translate some rule conditions. Those rules throw instead of guessing.`, ...L.helper);
  for (const p of plans) {
    const conds = p.rules.map(({ code, message }) => code ?? L.untranslated(message));
    out.push('', ...L.emit(p.decision, p.names, typesFor(ast, p.decision), conds));
  }
  return { code: out.join('\n'), diagnostics };
}

/** Translate every decision in a parsed ThunderLang AST into `lang`. Returns source text. */
export function translateDecisions(ast, lang) {
  return translateDecisionsWithDiagnostics(ast, lang).code;
}
