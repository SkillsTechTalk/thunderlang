// Security + type semantic pass , the deterministic checks that catch the mistakes prompt
// engineering routinely ships: secrets travelling over the event bus, sensitive data returned
// from an unauthenticated API, and mistyped fields. No AI; pure functions over the AST.
//
// These sit alongside privacy.mjs (which governs declared `data` blocks): this pass looks at
// TYPED FIELDS (input/output/event payload/api) rather than governed data elements.

import { isRecognizedType } from './data-schema.mjs';

export const SECURITY_SCHEMA = 'intent-security-v1';

// Types that are secret by construction: transporting or exposing them is a leak. Kept tight
// (secret/password/jwt) so the checks never cry wolf on ambiguous names like "token".
const SECRET_TYPES = new Set(['secret', 'password', 'jwt']);

const baseType = (t) => {
  const m = String(t || '').trim().match(/^(?:List|Array)<(.+)>$/i);
  return (m ? m[1] : String(t || '')).trim();
};
const isSecretType = (t) => SECRET_TYPES.has(baseType(t).toLowerCase());

/**
 * Deterministic security + type findings. Returns { code, severity, message, where, line }.
 *   IL-SEC-001  a secret-typed field rides an event payload (secret over the bus)   [blocker]
 *   IL-SEC-002  an API returns a secret-typed output with no auth requirement        [blocker]
 *   IL-TYPE-001 a field uses an unrecognized (lowercase, likely mistyped) type       [info]
 */
export function securityDiagnostics(ast) {
  const out = [];

  // IL-SEC-001 , secrets on the event bus.
  for (const ev of ast.events || []) {
    for (const f of ev.payload || []) {
      if (isSecretType(f.type)) {
        out.push({
          code: 'IL-SEC-001', severity: 'blocker',
          message: `Event "${ev.name}" payload field "${f.name}" is a ${baseType(f.type)}; secrets must not travel over the event bus.`,
          where: ev.name, line: f.line ?? null,
        });
      }
    }
  }

  // IL-SEC-002 , sensitive output from an unauthenticated API. `requires` is the auth gate.
  for (const api of ast.apis || []) {
    const hasAuth = (api.requires || []).length > 0;
    if (isSecretType(api.output) && !hasAuth) {
      out.push({
        code: 'IL-SEC-002', severity: 'blocker',
        message: `API "${api.name}" returns a ${baseType(api.output)} but declares no auth requirement; sensitive output must be authenticated.`,
        where: api.name, line: api.line ?? null,
      });
    }
  }

  // IL-TYPE-001 , unrecognized field type (almost always a typo). Info, gate-safe.
  const checkFields = (fields, where) => {
    for (const f of fields || []) {
      if (f.type && !isRecognizedType(f.type)) {
        out.push({
          code: 'IL-TYPE-001', severity: 'info',
          message: `Field "${f.name}" has an unrecognized type "${f.type}". Use a known semantic type/primitive, or a PascalCase entity name.`,
          where, line: f.line ?? null,
        });
      }
    }
  };
  checkFields(ast.inputs, 'input');
  checkFields(ast.outputs, 'output');
  for (const ev of ast.events || []) checkFields(ev.payload, `event ${ev.name}`);

  return out;
}
