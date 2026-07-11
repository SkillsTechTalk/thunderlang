// Data-shape export: turn a mission's typed input/output fields into a JSON Schema, and the
// mission itself into an OpenAPI operation. This makes IntentLang's typed data directly
// consumable by API tooling (validators, codegen, mock servers) , the data-shape sibling of
// the DMN/BPMN decision/lifecycle exporters. Deterministic and pure.

// Map an IntentLang semantic type to a JSON Schema fragment. Handles List<X> recursively,
// known semantic types (with formats), primitives, and opaque custom (PascalCase) types.
export function typeToJsonSchema(type) {
  const t = String(type || '').trim();
  const listMatch = t.match(/^List<(.+)>$/i) || t.match(/^Array<(.+)>$/i);
  if (listMatch) return { type: 'array', items: typeToJsonSchema(listMatch[1]) };

  const SEMANTIC = {
    email: { type: 'string', format: 'email' },
    url: { type: 'string', format: 'uri' },
    uri: { type: 'string', format: 'uri' },
    date: { type: 'string', format: 'date' },
    datetime: { type: 'string', format: 'date-time' },
    timestamp: { type: 'string', format: 'date-time' },
    duration: { type: 'string', format: 'duration' },
    uuid: { type: 'string', format: 'uuid' },
    money: { type: 'number' },
    currency: { type: 'string' },
    percentage: { type: 'number', minimum: 0, maximum: 100 },
    secret: { type: 'string', writeOnly: true },
    token: { type: 'string' },
    jwt: { type: 'string' },
    password: { type: 'string', writeOnly: true },
    version: { type: 'string' },
    environmentname: { type: 'string' },
    idempotencykey: { type: 'string' },
  };
  const PRIMITIVE = {
    string: { type: 'string' }, text: { type: 'string' },
    int: { type: 'integer' }, integer: { type: 'integer' }, number: { type: 'number' }, float: { type: 'number' }, decimal: { type: 'number' },
    bool: { type: 'boolean' }, boolean: { type: 'boolean' },
    object: { type: 'object' }, any: {},
  };
  const key = t.toLowerCase();
  if (SEMANTIC[key]) return { ...SEMANTIC[key] };
  if (PRIMITIVE[key]) return { ...PRIMITIVE[key] };
  // Unknown PascalCase entity -> an opaque object carrying its name (title), so tooling can
  // still reference it. Ids (UserId/AccountId/...) are strings.
  if (/id$/i.test(t)) return { type: 'string', title: t };
  return { type: 'object', title: t };
}

// Build an object schema from a list of typed fields. All declared fields are required by
// default; a field carrying an `optional` modifier is omitted from `required`.
function fieldsToSchema(fields, title) {
  const properties = {};
  const required = [];
  for (const f of fields || []) {
    if (!f.name) continue;
    properties[f.name] = typeToJsonSchema(f.type);
    if (!(f.modifiers || []).some((m) => /optional|nullable/i.test(m))) required.push(f.name);
  }
  const schema = { type: 'object', properties, additionalProperties: false };
  if (required.length) schema.required = required;
  if (title) schema.title = title;
  return schema;
}

/**
 * JSON Schema (draft 2020-12) for a mission's data shape. `which` selects 'input' (default),
 * 'output', or 'both' (an object with input+output sub-schemas).
 */
export function toJSONSchema(ast, { which = 'input' } = {}) {
  const base = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://skillstech.dev/intent/${slugish(ast.mission)}.schema.json` };
  if (which === 'output') return { ...base, ...fieldsToSchema(ast.outputs, `${ast.mission || 'Mission'} output`) };
  if (which === 'both') {
    return { ...base, title: `${ast.mission || 'Mission'}`, type: 'object', properties: { input: fieldsToSchema(ast.inputs, 'input'), output: fieldsToSchema(ast.outputs, 'output') } };
  }
  return { ...base, ...fieldsToSchema(ast.inputs, `${ast.mission || 'Mission'} input`) };
}

/**
 * A minimal OpenAPI 3.1 document with the mission as one operation: the input schema is the
 * request body, the output schema is the 200 response, and declared `errors` become named
 * error responses. Path/method are taken from a declared `api` block when present, else
 * defaulted (POST /<mission-slug>).
 */
export function toOpenAPI(ast) {
  const api = (ast.apis || [])[0];
  const method = (api && api.method ? String(api.method) : 'post').toLowerCase();
  const path = api && api.path ? String(api.path) : `/${slugish(ast.mission)}`;
  const opId = camelish(ast.mission || 'operation');

  const responses = {
    200: { description: 'Success', content: { 'application/json': { schema: fieldsToSchema(ast.outputs, `${ast.mission} output`) } } },
  };
  const ERR_STATUS = (name) => (/notfound|missing|unknown/i.test(name) ? '404' : /unauthor|forbidden|denied/i.test(name) ? '403' : /duplicate|conflict|exists/i.test(name) ? '409' : /invalid|bad/i.test(name) ? '400' : '422');
  for (const e of ast.errors || []) {
    const status = ERR_STATUS(e.name || '');
    responses[status] = { description: e.name };
  }

  const operation = { operationId: opId, summary: ast.title || ast.mission || '', responses };
  if (ast.goal || ast.problem) operation.description = ast.goal || ast.problem;
  if ((ast.inputs || []).length) operation.requestBody = { required: true, content: { 'application/json': { schema: fieldsToSchema(ast.inputs, `${ast.mission} input`) } } };

  return {
    openapi: '3.1.0',
    info: { title: ast.title || ast.mission || 'Intent API', version: '0.1.0' },
    paths: { [path]: { [method]: operation } },
  };
}

const slugish = (s) => String(s || 'mission').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mission';
const camelish = (s) => {
  const parts = String(s || 'operation').split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join('') || 'operation';
};
