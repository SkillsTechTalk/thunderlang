// Browser-safe decision translator: renders each decision as a readable, typed function in a
// target language. It uses the SAME expression translators (exprTo*) and the SAME input-type
// inference as the executable target adapters (target-*.mjs), minus their test harness, so what
// a reader sees here matches what `thunder test <file> --target <lang>` compiles and runs.
// Deterministic, no AI, no Node imports.
import { exprToJs, exprToPython, exprToGo, exprToRust, exprToCSharp, exprToJava } from './expr.mjs';
import { inputNames, inferInputTypes, strLit } from './target-types.mjs';

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

const tryExpr = (fn, when, inputs, fallback) => { try { return fn(when, { inputs }); } catch { return fallback; } };

const LANGS = {
  typescript: {
    label: 'TypeScript',
    types: { number: 'number', bool: 'boolean', string: 'string' },
    emit(d, names, types) {
      const params = names.map((n) => `${n}: ${this.types[types[n]]}`).join(', ');
      const L = [`export function ${d.name}(${params}): string {`];
      for (const r of d.rules || []) L.push(`  if (${tryExpr(exprToJs, r.when, names, 'false')}) return ${strLit(r.result)};`);
      L.push(`  return ${strLit(d.default ?? '')};`, '}');
      return L;
    },
  },
  python: {
    label: 'Python',
    types: { number: 'float', bool: 'bool', string: 'str' },
    emit(d, names, types) {
      const params = names.map((n) => `${n}: ${this.types[types[n]]}`).join(', ');
      const L = [`def ${d.name}(${params}) -> str:`];
      for (const r of d.rules || []) L.push(`    if ${tryExpr(exprToPython, r.when, names, 'False')}:`, `        return ${strLit(r.result)}`);
      L.push(`    return ${strLit(d.default ?? '')}`);
      return L;
    },
  },
  go: {
    label: 'Go',
    types: { number: 'float64', bool: 'bool', string: 'string' },
    emit(d, names, types) {
      const params = names.map((n) => `${n} ${this.types[types[n]]}`).join(', ');
      const L = [`func ${d.name}(${params}) string {`];
      for (const r of d.rules || []) L.push(`\tif ${tryExpr(exprToGo, r.when, names, 'false')} {`, `\t\treturn ${strLit(r.result)}`, '\t}');
      L.push(`\treturn ${strLit(d.default ?? '')}`, '}');
      return L;
    },
  },
  rust: {
    label: 'Rust',
    types: { number: 'f64', bool: 'bool', string: '&str' },
    emit(d, names, types) {
      const params = names.map((n) => `${n}: ${this.types[types[n]]}`).join(', ');
      const L = [`fn ${d.name}(${params}) -> &'static str {`];
      for (const r of d.rules || []) L.push(`    if ${tryExpr(exprToRust, r.when, names, 'false')} {`, `        return ${strLit(r.result)};`, '    }');
      L.push(`    ${strLit(d.default ?? '')}`, '}');
      return L;
    },
  },
  csharp: {
    label: 'C#',
    types: { number: 'double', bool: 'bool', string: 'string' },
    emit(d, names, types) {
      const params = names.map((n) => `${this.types[types[n]]} ${n}`).join(', ');
      const L = [`public static string ${d.name}(${params})`, '{'];
      for (const r of d.rules || []) L.push(`    if (${tryExpr(exprToCSharp, r.when, names, 'false')}) return ${strLit(r.result)};`);
      L.push(`    return ${strLit(d.default ?? '')};`, '}');
      return L;
    },
  },
  java: {
    label: 'Java',
    types: { number: 'double', bool: 'boolean', string: 'String' },
    emit(d, names, types) {
      const params = names.map((n) => `${this.types[types[n]]} ${n}`).join(', ');
      const L = [`public static String ${d.name}(${params}) {`];
      for (const r of d.rules || []) L.push(`    if (${tryExpr(exprToJava, r.when, names, 'false')}) return ${strLit(r.result)};`);
      L.push(`    return ${strLit(d.default ?? '')};`, '}');
      return L;
    },
  },
};

export const TRANSLATE_LANGUAGES = Object.entries(LANGS).map(([key, l]) => ({ key, label: l.label }));

/** Translate every decision in a parsed ThunderLang AST into `lang`. Returns source text. */
export function translateDecisions(ast, lang) {
  const L = LANGS[lang];
  if (!L) throw new Error(`Unknown language ${lang}. Use one of: ${Object.keys(LANGS).join(', ')}.`);
  const comment = lang === 'python' ? '#' : '//';
  const out = [`${comment} Generated from ThunderLang. Deterministic, no AI. The first matching rule wins.`];
  for (const d of ast.decisions || []) {
    out.push('', ...L.emit(d, inputNames(d), typesFor(ast, d)));
  }
  return out.join('\n');
}
