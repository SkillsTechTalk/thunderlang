// Code generation (intent-codegen-v1) , deterministic scaffolds from intent. NO AI: the same
// intent always produces the same code. It generates what the intent fully determines (typed
// interfaces, and the decision logic, which is already executable) and leaves honest TODO
// markers where a human must supply the business logic , never a fake implementation. This is
// the "see how it works, then change it" surface for the playground and `intent gen`.
//
// Pure and browser-safe so the playground can render it. TypeScript first; the same adapter
// shape (a type map + a body walk) extends to C# / Java.

import { exprToJs } from './expr.mjs';
import { subjectName } from './parse.mjs';

export const CODEGEN_SCHEMA = 'intent-codegen-v1';

// Semantic type -> TypeScript type. Unknown/domain types become a named type (interface stub).
const TS_TYPES = {
  Email: 'string', Url: 'string', UserId: 'string', AccountId: 'string', OrderId: 'string',
  InvoiceId: 'string', CustomerId: 'string', PaymentId: 'string', EventId: 'string',
  Secret: 'string', Token: 'string', Jwt: 'string', Password: 'string', IdempotencyKey: 'string',
  Money: 'number', Currency: 'string', Percentage: 'number', Count: 'number', Duration: 'number',
  Date: 'string', DateTime: 'string', Flag: 'boolean', TraceId: 'string', CorrelationId: 'string',
  Version: 'string', EnvironmentName: 'string',
};

function tsType(type, domain) {
  if (!type) return 'unknown';
  const list = /^List<(.+)>$/.exec(type);
  if (list) { domain.add(list[1]); return `${tsType(list[1], domain)}[]`; }
  const base = type.replace(/\(.*\)/, '');
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
export function toTypeScript(ast) {
  const subject = pascal(subjectName(ast) || 'Intent');
  const domain = new Set();
  const L = [];

  L.push(
    `// ${subject} , generated from IntentLang (intent-codegen-v1). Deterministic, no AI.`,
    '// The typed contract and the decision logic below are fully determined by the intent.',
    '// Business logic marked TODO is yours to complete; the guarantees and never-rules state',
    '// what your implementation must uphold. Regenerate any time; edits to TODO bodies are lost.',
    '',
  );

  // Input / output interfaces.
  if ((ast.inputs || []).length) L.push(...fieldsIface(`${subject}Input`, ast.inputs, domain));
  if ((ast.outputs || []).length) L.push(...fieldsIface(`${subject}Output`, ast.outputs, domain));

  // Decisions , real, first-hit logic (the intent already executes these).
  for (const d of ast.decisions || []) {
    const inputs = d.inputs || [];
    const params = inputs.map((i) => `${i}: unknown`).join(', ');
    L.push(`// decision ${d.name} , first matching rule wins.`);
    L.push(`export function ${lower(pascal(d.name))}(${params}): string {`);
    for (const r of d.rules || []) {
      let cond;
      try { cond = exprToJs(r.when, { inputs }); }
      catch { cond = `false /* TODO: could not translate "${r.when}" */`; }
      L.push(`  if (${cond}) return ${JSON.stringify(r.result)}; // rule ${r.name}`);
    }
    L.push(`  return ${JSON.stringify(d.default ?? 'Undecided')}; // default`);
    L.push('}', '');
  }

  // The mission function , signature is determined; body is a guarded stub.
  const inName = (ast.inputs || []).length ? `${subject}Input` : 'void';
  const outName = (ast.outputs || []).length ? `${subject}Output` : 'void';
  const arg = inName === 'void' ? '' : `input: ${inName}`;
  L.push(`export function ${lower(subject)}(${arg}): ${outName} {`);
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

  return L.join('\n');
}

export const GENERATORS = { typescript: toTypeScript, ts: toTypeScript };
