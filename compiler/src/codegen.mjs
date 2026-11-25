// Code generation (intent-codegen-v1) , deterministic scaffolds from intent. NO AI: the same
// intent always produces the same code. It generates what the intent fully determines (typed
// interfaces, and the decision logic, which is already executable) and leaves honest TODO
// markers where a human must supply the business logic , never a fake implementation. This is
// the "see how it works, then change it" surface for the playground and `thunder gen`.
//
// Pure and browser-safe so the playground can render it. TypeScript first; the same adapter
// shape (a type map + a body walk) extends to C# / Java / Python.
//
// A rule condition a target cannot express is never replaced by `false`: the generated code calls
// a helper that throws with the IL-GEN-001 message, and generateWithDiagnostics() reports it.

import { exprToJs, exprToCSharp, exprToJava, exprToPython } from './expr.mjs';
import { subjectName } from './parse.mjs';
import { planDecision } from './target-types.mjs';

// Decision inputs as plain names with one type each (declared, else from the examples, else from how the rules use
// them), so generated code type-checks: `amount >= 0` needs a number, not unknown or Object. Money inputs keep an
// exact type (bigint minor units, decimal, BigDecimal, Decimal), never a float.
const TS_PARAM = { number: 'number', bool: 'boolean', string: 'string', money: 'Money' };
const CS_PARAM = { number: 'double', bool: 'bool', string: 'string', money: 'decimal' };
const JAVA_PARAM = { number: 'double', bool: 'boolean', string: 'String', money: 'java.math.BigDecimal' };
const PY_PARAM = { number: 'float', bool: 'bool', string: 'str', money: 'Decimal' };

// Plan every decision for one target: params, translated conditions, and IL-GEN-001 diagnostics for any rule
// condition the target cannot express.
function planAll(ast, translate, target) {
  const plans = (ast.decisions || []).map((d) => planDecision(ast, d, { translate, target }));
  return { plans, diagnostics: plans.flatMap((p) => p.diagnostics) };
}
const notTranslatedNote = (code) => (code == null ? ' , IL-GEN-001 not translated' : '');

export const CODEGEN_SCHEMA = 'intent-codegen-v1';

// TypeScript Money: exact bigint minor units with two tiny helpers. Zero dependencies; needs ES2020 (bigint).
const TS_MONEY_HELPERS = [
  '// Thunder Money: an exact amount in minor units (cents by default), never binary floating point.',
  '// parseMoney("12.30") === 1230n; formatMoney(1230n) === "12.30". Extra precision is an error, not rounded.',
  'export type Money = bigint;',
  'export function parseMoney(text: string, minorUnits = 2): Money {',
  '  const m = /^([+-])?(\\d+)(?:\\.(\\d+))?$/.exec(text.trim());',
  '  if (!m) throw new Error(`"${text}" is not an amount`);',
  '  const frac = m[3] ?? "";',
  '  if (/[1-9]/.test(frac.slice(minorUnits))) throw new Error(`${text} has more than ${minorUnits} decimal places; Thunder Money never rounds silently`);',
  '  const minor = BigInt(m[2] + frac.slice(0, minorUnits).padEnd(minorUnits, "0"));',
  '  return m[1] === "-" ? -minor : minor;',
  '}',
  'export function formatMoney(minor: Money, minorUnits = 2): string {',
  '  const neg = minor < 0n;',
  '  const digits = (neg ? -minor : minor).toString().padStart(minorUnits + 1, "0");',
  '  return (neg ? "-" : "") + (minorUnits ? `${digits.slice(0, -minorUnits)}.${digits.slice(-minorUnits)}` : digits);',
  '}',
  '',
];

// Semantic type -> TypeScript type. Unknown/domain types become a named type (interface stub).
const TS_TYPES = {
  Email: 'string', Url: 'string', UserId: 'string', AccountId: 'string', OrderId: 'string',
  InvoiceId: 'string', CustomerId: 'string', PaymentId: 'string', EventId: 'string',
  Secret: 'string', Token: 'string', Jwt: 'string', Password: 'string', IdempotencyKey: 'string',
  Money: 'Money', Currency: 'string', Percentage: 'number', Count: 'number', Duration: 'number',
  Date: 'string', DateTime: 'string', Flag: 'boolean', TraceId: 'string', CorrelationId: 'string',
  Version: 'string', EnvironmentName: 'string',
};

function tsType(type, domain) {
  if (!type) return 'unknown';
  const list = /^List<(.+)>$/.exec(type);
  if (list) { domain.add(list[1]); return `${tsType(list[1], domain)}[]`; }
  const base = type.replace(/\(.*\)/, '');
  if (base === 'Money') domain.add('Money'); // triggers the exact Money helpers
  if (TS_TYPES[base]) return TS_TYPES[base];
  domain.add(base); // a domain/entity type -> emit an interface stub for it
  return base;
}

const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const pascal = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s).replace(/[^A-Za-z0-9]/g, '');
const fieldsIface = (name, fields, domain) => [
  `export interface ${name} {`,
  ...fields.map((f) => `  ${f.name}: ${tsType(f.type, domain)};`),
  '}', '',
];

/** Generate a deterministic TypeScript scaffold from a parsed intent AST. Returns a string. */
export function toTypeScript(ast) { return buildTypeScript(ast).code; }

function buildTypeScript(ast) {
  const subject = pascal(subjectName(ast) || 'Intent');
  const domain = new Set();
  const L = [];
  const { plans, diagnostics } = planAll(ast, exprToJs, 'TypeScript');

  L.push(
    `// ${subject} , generated from ThunderLang (intent-codegen-v1). Deterministic, no AI.`,
    '// The typed contract and the decision logic below are fully determined by the intent.',
    '// Business logic marked TODO is yours to complete; the guarantees and never-rules state',
    '// what your implementation must uphold. Regenerate any time; edits to TODO bodies are lost.',
    '',
  );

  // Input / output interfaces.
  const ifaces = [];
  if ((ast.inputs || []).length) ifaces.push(...fieldsIface(`${subject}Input`, ast.inputs, domain));
  if ((ast.outputs || []).length) ifaces.push(...fieldsIface(`${subject}Output`, ast.outputs, domain));
  const usesMoney = domain.has('Money') || plans.some((p) => Object.keys(p.money).length);
  domain.delete('Money');
  if (usesMoney) L.push(...TS_MONEY_HELPERS);
  if (diagnostics.length) {
    L.push(
      '// IL-GEN-001: Thunder could not translate some rule conditions. Those rules throw instead of guessing.',
      'function thunderUntranslated(message: string): boolean { throw new Error(message); }',
      '',
    );
  }
  L.push(...ifaces);

  // Decisions , real, first-hit logic (the intent already executes these).
  for (const p of plans) {
    const d = p.decision;
    const params = p.names.map((n) => `${n}: ${TS_PARAM[p.types[n]]}`).join(', ');
    L.push(`// decision ${d.name} , first matching rule wins.`);
    L.push(`export function ${lower(pascal(d.name))}(${params}): string {`);
    for (const { rule: r, code, message } of p.rules) {
      const cond = code ?? `thunderUntranslated(${JSON.stringify(message)})`;
      L.push(`  if (${cond}) return ${JSON.stringify(r.result)}; // rule ${r.name}${notTranslatedNote(code)}`);
    }
    L.push(`  return ${JSON.stringify(d.default ?? 'Undecided')}; // default`);
    L.push('}', '');
  }

  // The mission function , signature is determined; body is a guarded stub.
  const inName = (ast.inputs || []).length ? `${subject}Input` : 'void';
  const outName = (ast.outputs || []).length ? `${subject}Output` : 'void';
  const arg = inName === 'void' ? '' : `input: ${inName}`;
  // A decision often shares the mission's name (RefundDecision); the mission function is then `run`, as in Java and Python.
  const decisionFns = new Set((ast.decisions || []).map((d) => lower(pascal(d.name))));
  const missionFn = decisionFns.has(lower(subject)) ? 'run' : lower(subject);
  L.push(`export function ${missionFn}(${arg}): ${outName} {`);
  for (const r of ast.requires || []) L.push(`  // precondition: ${r}  , TODO: validate`);
  for (const n of ast.neverRules || []) L.push(`  // NEVER: ${n.statement}  , your code must not do this`);
  for (const g of ast.guarantees || []) L.push(`  // GUARANTEE: ${g.statement}  , your code must uphold this${g.verify?.length ? ` (verify: ${g.verify.join(', ')})` : ''}`);
  L.push('  throw new Error("TODO: implement , the intent above defines what this must do.");');
  L.push('}', '');

  // Domain type stubs for any referenced entity types.
  const stubs = [...domain].filter((t) => !TS_TYPES[t] && /^[A-Z]/.test(t)).sort();
  if (stubs.length) {
    L.push('// Domain types referenced by the intent , complete these.');
    for (const t of stubs) L.push(`export interface ${t} { /* TODO: fields */ }`);
    L.push('');
  }

  return { code: L.join('\n'), diagnostics };
}

// ── C# ───────────────────────────────────────────────────────────────────────
const CS_TYPES = {
  Email: 'string', Url: 'string', UserId: 'string', AccountId: 'string', OrderId: 'string',
  InvoiceId: 'string', CustomerId: 'string', Secret: 'string', Token: 'string', Jwt: 'string',
  IdempotencyKey: 'string', Currency: 'string', Date: 'DateTime', DateTime: 'DateTime',
  Money: 'decimal', Percentage: 'decimal', Count: 'int', Duration: 'int', Flag: 'bool',
};
function csType(type, domain) {
  if (!type) return 'object';
  const list = /^List<(.+)>$/.exec(type);
  if (list) return `List<${csType(list[1], domain)}>`;
  const base = type.replace(/\(.*\)/, '');
  if (CS_TYPES[base]) return CS_TYPES[base];
  domain.add(base); return base;
}

/** Generate a deterministic C# scaffold from an intent AST. */
export function toCSharp(ast) { return buildCSharp(ast).code; }

function buildCSharp(ast) {
  const subject = pascal(subjectName(ast) || 'Intent');
  const domain = new Set();
  const { plans, diagnostics } = planAll(ast, exprToCSharp, 'C#');
  const L = [
    `// ${subject} , generated from ThunderLang (intent-codegen-v1). Deterministic, no AI.`,
    '// The record contract and the decision logic are fully determined by the intent;',
    '// business logic marked TODO is yours, bound by the guarantees and never-rules below.',
    '',
    'using System;',
    'using System.Collections.Generic;',
    'using System.Linq;',
    '',
  ];
  const rec = (name, fields) => fields.length
    ? [`public record ${name}(${fields.map((f) => `${csType(f.type, domain)} ${pascal(f.name)}`).join(', ')});`, '']
    : [];
  if ((ast.inputs || []).length) L.push(...rec(`${subject}Input`, ast.inputs));
  if ((ast.outputs || []).length) L.push(...rec(`${subject}Output`, ast.outputs));
  L.push(`public static class ${subject}`, '{');
  if (diagnostics.length) {
    L.push('  // IL-GEN-001: Thunder could not translate some rule conditions. Those rules throw instead of guessing.');
    L.push('  private static bool ThunderUntranslated(string message) => throw new NotImplementedException(message);');
  }
  for (const p of plans) {
    const d = p.decision;
    // A C# member cannot share its class's name (CS0542): a decision named like the mission becomes Decide.
    const method = pascal(d.name) === subject ? 'Decide' : pascal(d.name);
    L.push(`  // decision ${d.name} , first matching rule wins.`);
    L.push(`  public static string ${method}(${p.names.map((n) => `${CS_PARAM[p.types[n]]} ${n}`).join(', ')})`);
    L.push('  {');
    for (const { rule: r, code, message } of p.rules) {
      const cond = code ?? `ThunderUntranslated(${JSON.stringify(message)})`;
      L.push(`    if (${cond}) return ${JSON.stringify(r.result)}; // rule ${r.name}${notTranslatedNote(code)}`);
    }
    L.push(`    return ${JSON.stringify(d.default ?? 'Undecided')}; // default`, '  }');
  }
  const inName = (ast.inputs || []).length ? `${subject}Input` : null;
  const outName = (ast.outputs || []).length ? `${subject}Output` : 'void';
  L.push(`  public static ${outName} Run(${inName ? `${inName} input` : ''})`, '  {');
  for (const r of ast.requires || []) L.push(`    // precondition: ${r}  , TODO: validate`);
  for (const n of ast.neverRules || []) L.push(`    // NEVER: ${n.statement}`);
  for (const g of ast.guarantees || []) L.push(`    // GUARANTEE: ${g.statement}`);
  L.push('    throw new NotImplementedException("TODO: implement , the intent above defines what this must do.");', '  }');
  L.push('}', '');
  return { code: L.join('\n'), diagnostics };
}

// ── Java ─────────────────────────────────────────────────────────────────────
const JAVA_TYPES = {
  Email: 'String', Url: 'String', UserId: 'String', AccountId: 'String', OrderId: 'String',
  InvoiceId: 'String', CustomerId: 'String', Secret: 'String', Token: 'String', Jwt: 'String',
  IdempotencyKey: 'String', Currency: 'String', Date: 'java.time.LocalDate', DateTime: 'java.time.Instant',
  Money: 'java.math.BigDecimal', Percentage: 'double', Count: 'int', Duration: 'long', Flag: 'boolean',
};
function javaType(type, domain) {
  if (!type) return 'Object';
  const list = /^List<(.+)>$/.exec(type);
  if (list) return `java.util.List<${javaType(list[1], domain)}>`;
  const base = type.replace(/\(.*\)/, '');
  if (JAVA_TYPES[base]) return JAVA_TYPES[base];
  domain.add(base); return base;
}

/** Generate a deterministic Java scaffold from an intent AST. */
export function toJava(ast) { return buildJava(ast).code; }

function buildJava(ast) {
  const subject = pascal(subjectName(ast) || 'Intent');
  const domain = new Set();
  const { plans, diagnostics } = planAll(ast, exprToJava, 'Java');
  const L = [
    `// ${subject} , generated from ThunderLang (intent-codegen-v1). Deterministic, no AI.`,
    '// The record contract and the decision logic are fully determined by the intent;',
    '// business logic marked TODO is yours, bound by the guarantees and never-rules below.',
    '',
    `public final class ${subject} {`,
    `  private ${subject}() {}`,
    '',
  ];
  const rec = (name, fields) => fields.length
    ? [`  public record ${name}(${fields.map((f) => `${javaType(f.type, domain)} ${f.name}`).join(', ')}) {}`, '']
    : [];
  if ((ast.inputs || []).length) L.push(...rec(`${subject}Input`, ast.inputs));
  if ((ast.outputs || []).length) L.push(...rec(`${subject}Output`, ast.outputs));
  if (diagnostics.length) {
    L.push('  // IL-GEN-001: Thunder could not translate some rule conditions. Those rules throw instead of guessing.');
    L.push('  private static boolean thunderUntranslated(String message) { throw new UnsupportedOperationException(message); }', '');
  }
  for (const p of plans) {
    const d = p.decision;
    L.push(`  // decision ${d.name} , first matching rule wins.`);
    L.push(`  public static String ${lower(pascal(d.name))}(${p.names.map((n) => `${JAVA_PARAM[p.types[n]]} ${n}`).join(', ')}) {`);
    for (const { rule: r, code, message } of p.rules) {
      const cond = code ?? `thunderUntranslated(${JSON.stringify(message)})`;
      L.push(`    if (${cond}) return ${JSON.stringify(r.result)}; // rule ${r.name}${notTranslatedNote(code)}`);
    }
    L.push(`    return ${JSON.stringify(d.default ?? 'Undecided')}; // default`, '  }');
  }
  const inName = (ast.inputs || []).length ? `${subject}Input` : null;
  const outName = (ast.outputs || []).length ? `${subject}Output` : 'void';
  L.push(`  public static ${outName} run(${inName ? `${inName} input` : ''}) {`);
  for (const r of ast.requires || []) L.push(`    // precondition: ${r}  , TODO: validate`);
  for (const n of ast.neverRules || []) L.push(`    // NEVER: ${n.statement}`);
  for (const g of ast.guarantees || []) L.push(`    // GUARANTEE: ${g.statement}`);
  L.push('    throw new UnsupportedOperationException("TODO: implement , the intent above defines what this must do.");', '  }');
  L.push('}', '');
  return { code: L.join('\n'), diagnostics };
}

// ── Python ───────────────────────────────────────────────────────────────────
const PY_TYPES = {
  Email: 'str', Url: 'str', UserId: 'str', AccountId: 'str', OrderId: 'str',
  InvoiceId: 'str', CustomerId: 'str', Secret: 'str', Token: 'str', Jwt: 'str',
  IdempotencyKey: 'str', Currency: 'str', Date: 'str', DateTime: 'str',
  Money: 'Decimal', Percentage: 'float', Count: 'int', Duration: 'int', Flag: 'bool',
};
function pyType(type, domain) {
  if (!type) return 'object';
  const list = /^List<(.+)>$/.exec(type);
  if (list) return `list[${pyType(list[1], domain)}]`;
  const base = type.replace(/\(.*\)/, '');
  if (base === 'Money') domain.add('Money'); // triggers `from decimal import Decimal`
  if (PY_TYPES[base]) return PY_TYPES[base];
  domain.add(base); return base;
}
// PascalCase/camelCase -> snake_case, for idiomatic Python function names. Field and decision
// input names stay verbatim: the translated conditions reference them by their intent names.
const snake = (s) => pascal(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Generate a deterministic Python scaffold from an intent AST. */
export function toPython(ast) { return buildPython(ast).code; }

function buildPython(ast) {
  const subject = pascal(subjectName(ast) || 'Intent');
  const domain = new Set();
  const { plans, diagnostics } = planAll(ast, exprToPython, 'Python');
  const L = [
    `# ${subject} , generated from ThunderLang (intent-codegen-v1). Deterministic, no AI.`,
    '# The dataclass contract and the decision logic are fully determined by the intent;',
    '# business logic marked TODO is yours, bound by the guarantees and never-rules below.',
    '',
  ];
  const hasData = (ast.inputs || []).length || (ast.outputs || []).length;
  const cls = (name, fields) => fields.length
    ? ['@dataclass', `class ${name}:`, ...fields.map((f) => `    ${f.name}: ${pyType(f.type, domain)}`), '']
    : [];
  const body = [];
  if ((ast.inputs || []).length) body.push(...cls(`${subject}Input`, ast.inputs));
  if ((ast.outputs || []).length) body.push(...cls(`${subject}Output`, ast.outputs));
  // Money is decimal.Decimal: exact, never float.
  const usesMoney = domain.has('Money') || plans.some((p) => Object.keys(p.money).length);
  domain.delete('Money');
  // Postponed annotations so a dataclass may reference a domain stub declared below it.
  if (hasData) L.push('from __future__ import annotations', 'from dataclasses import dataclass');
  if (usesMoney) L.push('from decimal import Decimal');
  if (hasData || usesMoney) L.push('');
  if (diagnostics.length) {
    L.push(
      '# IL-GEN-001: Thunder could not translate some rule conditions. Those rules raise instead of guessing.',
      'def _thunder_untranslated(message: str) -> bool:',
      '    raise NotImplementedError(message)',
      '',
    );
  }
  L.push(...body);
  for (const p of plans) {
    const d = p.decision;
    L.push(`# decision ${d.name} , first matching rule wins.`);
    L.push(`def ${snake(d.name)}(${p.names.map((n) => `${n}: ${PY_PARAM[p.types[n]]}`).join(', ')}) -> str:`);
    for (const { rule: r, code, message } of p.rules) {
      const cond = code ?? `_thunder_untranslated(${JSON.stringify(message)})`;
      L.push(`    if ${cond}:${code == null ? '  # IL-GEN-001 not translated' : ''}`);
      L.push(`        return ${JSON.stringify(r.result)}  # rule ${r.name}`);
    }
    L.push(`    return ${JSON.stringify(d.default ?? 'Undecided')}  # default`, '');
  }
  const inName = (ast.inputs || []).length ? `${subject}Input` : null;
  const outName = (ast.outputs || []).length ? `${subject}Output` : 'None';
  L.push(`def run(${inName ? `input: ${inName}` : ''}) -> ${outName}:`);
  for (const r of ast.requires || []) L.push(`    # precondition: ${r}  , TODO: validate`);
  for (const n of ast.neverRules || []) L.push(`    # NEVER: ${n.statement}`);
  for (const g of ast.guarantees || []) L.push(`    # GUARANTEE: ${g.statement}`);
  L.push('    raise NotImplementedError("TODO: implement , the intent above defines what this must do.")', '');
  const stubs = [...domain].filter((t) => !PY_TYPES[t] && /^[A-Z]/.test(t)).sort();
  if (stubs.length) {
    L.push('# Domain types referenced by the intent , complete these.');
    for (const t of stubs) L.push(`class ${t}: pass  # TODO: fields`);
    L.push('');
  }
  return { code: L.join('\n'), diagnostics };
}

const BUILDERS = {
  typescript: buildTypeScript, ts: buildTypeScript,
  csharp: buildCSharp, cs: buildCSharp,
  java: buildJava,
  python: buildPython, py: buildPython,
};

/**
 * Generate code AND the generation diagnostics for a target. `diagnostics` holds one IL-GEN-001 error
 * per rule condition the target could not translate; the generated code throws at those rules.
 */
export function generateWithDiagnostics(ast, target) {
  const build = BUILDERS[String(target).toLowerCase()];
  if (!build) throw new Error(`Unknown generation target "${target}". Use one of: ${Object.keys(BUILDERS).join(', ')}.`);
  return build(ast);
}

export const GENERATORS = {
  typescript: toTypeScript, ts: toTypeScript,
  csharp: toCSharp, cs: toCSharp,
  java: toJava,
  python: toPython, py: toPython,
};
