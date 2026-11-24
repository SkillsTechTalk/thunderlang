// Terraform in Thunder (spec section 12): what a configuration makes, where, and who can do what. Each `resource`
// is a Resource that knows its arguments in words (a value only when the file writes it; references and functions are
// "worked out when it is applied"); `data` sources look up something that already exists; a `module` is a group of
// its own; `variable`, `locals`, and `output` are Settings (a sensitive one is only named). References and
// `depends_on` are links with their lines, and the order things are created is one Steps card. Role assignments and
// IAM policies are Permissions (wide when they can change everything); open ports, public storage, secrets written
// in the file, and encryption turned off are Facts. Deterministic, browser-safe; reads the file, not the cloud.
import { parseHcl, attrOf, blocksOf } from './hcl.mjs';
import { refsIn, isLiteral, toValue } from './infra-expr.mjs';
import {
  APPLIED, words, typeWords, resourceLabel, providerWords, roleCan, roleIn, WIDE_ROLES, linkKind, valueText, conditionWords,
  keyFacts, isSecretKey, literalEntries, fromAnywhere, portsOpen, topoOrder, addLink, question, leaves,
} from './infra-cloud.mjs';
import { listWords, cap } from './infra-words.mjs';

/** "the storage account main"; a resource named `this` (a common module convention) is just "the storage account". */
export const named = (typeW, name) => (name === 'this' || name === 'default' ? `the ${typeW}` : `the ${typeW} ${name}`);

const RESERVED = new Set(['var', 'local', 'each', 'count', 'path', 'terraform', 'self', 'data', 'module']);
const META = new Set(['count', 'for_each', 'depends_on', 'provider', 'providers', 'lifecycle', 'source', 'version']);
const BACKENDS = { s3: 'an S3 bucket', azurerm: 'an Azure storage account', gcs: 'a Google Cloud Storage bucket', remote: 'HCP Terraform', cloud: 'HCP Terraform', local: 'a file on the computer that runs it', consul: 'Consul', http: 'a web service', kubernetes: 'a Kubernetes secret', pg: 'a PostgreSQL database' };

/** The address a reference points to ('azurerm_storage_account.main', 'data.x.y', 'module.net'), or null. */
export function tfTarget(ref) {
  const p = ref.path;
  if (p[0] === 'data') return p.length >= 3 && !p[1].startsWith('[') ? `data.${p[1]}.${p[2]}` : null;
  if (p[0] === 'module') return p.length >= 2 ? `module.${p[1]}` : null;
  if (RESERVED.has(p[0]) || p.length < 2 || p[1].startsWith('[') || p[1] === '*') return null;
  return /^[a-z][a-z0-9]*_[a-z0-9_]+$/.test(p[0]) ? `${p[0]}.${p[1]}` : null;
}

const attrPath = (parts) => parts.filter((x) => x !== '*' && !x.startsWith('[')).map((x) => words(x)).join(' ');

/** A reference in words: var.location -> "the setting location"; azurerm_resource_group.rg.location -> "the location of the resource group rg". */
export function tfRefWords(ref) {
  if (ref.t !== 'ref') return null;
  const p = ref.path;
  const rest = (k) => attrPath(p.slice(k));
  switch (p[0]) {
    case 'var': return p[1] ? `the setting ${p[1]}${p.length > 2 ? `'s ${rest(2)}` : ''}` : null;
    case 'local': return p[1] ? `the value ${p[1]}${p.length > 2 ? `'s ${rest(2)}` : ''}` : null;
    case 'each': return p[1] === 'key' ? "each item's key" : p.length > 2 ? `each item's ${rest(2)}` : "each item's value";
    case 'count': return 'its number in the count (from 0)';
    case 'path': return p[1] === 'root' ? 'the root folder' : p[1] === 'cwd' ? 'the working folder' : "this module's folder";
    case 'terraform': return p[1] === 'workspace' ? 'the workspace name' : 'Terraform';
    case 'self': return `its own ${rest(1)}`;
    case 'data': return p.length >= 3 ? `${p.length > 3 ? `the ${rest(3)} of ` : ''}the looked-up ${typeWords(p[1])} ${p[2]}` : null;
    case 'module': return p.length >= 2 ? `${p.length > 2 ? `the ${rest(2)} from ` : ''}the module ${p[1]}` : null;
    default: {
      const t = tfTarget(ref);
      if (!t) return p.length === 1 ? `the value ${p[0]}` : null;
      const attr = rest(2);
      return `${attr ? `the ${attr} of ` : ''}the ${typeWords(p[0])} ${p[1]}`;
    }
  }
}

/** Every attribute under a body, nested blocks included, with the block path it sits under. */
function walkAttrs(items, fn, path = []) {
  for (const it of items ?? []) {
    if (it.kind === 'attr') fn(it, path);
    else if (it.type === 'dynamic') { const content = blocksOf(it.body, 'content')[0]; walkAttrs(it.body.filter((x) => x !== content), fn, [...path, it.labels[0]]); if (content) walkAttrs(content.body, fn, [...path, it.labels[0]]); }
    else walkAttrs(it.body, fn, [...path, it.type]);
  }
}

/** A nested block in a few words: "always on: yes; application stack: …; and 3 more". */
function blockSummary(b, refWords, depth = 0) {
  const parts = [];
  for (const it of b.body) {
    if (it.kind === 'attr') parts.push(`${words(it.name)}: ${valueText(it.value, refWords).text}`);
    else parts.push(depth < 1 ? `${words(it.type === 'dynamic' ? it.labels[0] : it.type)} (${blockSummary(it, refWords, depth + 1) || 'empty'})` : `${words(it.type)} (…)`);
  }
  if (!parts.length) return 'set, with nothing inside';
  const shown = parts.slice(0, 4).join('; ');
  return `${shown}${parts.length > 4 ? `; and ${parts.length - 4} more` : ''}`;
}

/** Statements of an IAM policy: [{ effect, actions, notActions, resources, principals, line }]. */
function policyStatements(node, ctx) {
  if (!node) return [];
  if (node.t === 'ref' && node.path[0] === 'data' && node.path[1] === 'aws_iam_policy_document') return ctx.policyDocs.get(node.path[2]) ?? [];
  let doc = null;
  if (node.t === 'call' && node.name === 'jsonencode') doc = toValue(node.args[0], ctx.src);
  else if (node.t === 'str') {
    const text = node.template ? node.parts.map((p) => (typeof p === 'string' ? p : 'REF')).join('') : node.v;
    try { doc = JSON.parse(text); } catch { doc = null; }
  }
  const sts = doc && typeof doc === 'object' ? doc.Statement ?? doc.statement : null;
  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]).map((v) => (v && typeof v === 'object' && 'ref' in v ? `(${APPLIED})` : String(v)));
  return (Array.isArray(sts) ? sts : sts ? [sts] : []).filter((s) => s && typeof s === 'object').map((s) => ({
    effect: String(s.Effect ?? 'Allow'), actions: arr(s.Action), notActions: arr(s.NotAction), resources: arr(s.Resource ?? s.NotResource),
    principals: s.Principal == null ? [] : typeof s.Principal === 'string' ? [{ type: '*', ids: [s.Principal] }] : Object.entries(s.Principal).map(([type, ids]) => ({ type, ids: arr(ids) })),
    line: node.line,
  }));
}

/** IAM actions in words: '*' -> "do anything"; 's3:*' -> "do anything in S3". */
function actionsWords(actions, notActions = []) {
  if (notActions.length) return `do anything except ${listWords(notActions.slice(0, 4))}${notActions.length > 4 ? ` and ${notActions.length - 4} more` : ''}`;
  if (!actions.length) return 'do nothing';
  if (actions.includes('*')) return 'do anything';
  const all = actions.filter((a) => /:\*$/.test(a)).map((a) => a.split(':')[0].toUpperCase());
  const rest = actions.filter((a) => !/:\*$/.test(a));
  const parts = [...(all.length ? [`do anything in ${listWords(all)}`] : []), ...(rest.length ? [rest.length > 4 ? `${rest.slice(0, 4).join(', ')}, and ${rest.length - 4} more` : listWords(rest)] : [])];
  return parts.join(', and ');
}
const READ_ONLY = (a) => /:(Describe|Get|List|Head|BatchGet|Query|Scan|Lookup|Search|View|Read)[A-Za-z]*\*?$/.test(a);
function statementWide(st) {
  if (st.notActions.length) return 'every action except a few';
  if (st.actions.includes('*')) return 'every action on every resource it names';
  const svc = st.actions.find((a) => /:\*$/.test(a));
  if (svc) return `every ${svc.split(':')[0].toUpperCase()} action`;
  if (st.resources.includes('*') && st.actions.some((a) => !READ_ONLY(a))) return 'changes to every resource of those kinds (Resource "*")';
  return null;
}
const resourcesWords = (rs) => (!rs.length ? 'what it is attached to' : rs.includes('*') ? 'every resource' : rs.length === 1 ? rs[0] : `${listWords(rs.slice(0, 3))}${rs.length > 3 ? ` and ${rs.length - 3} more` : ''}`);
const principalWords = (ps) => listWords(ps.flatMap((p) => p.ids.map((id) => (id === '*' ? 'anyone' : p.type === 'Service' ? `the service ${id}` : p.type === 'Federated' ? `sign-ins from ${id}` : `the AWS account or role ${id}`))));

/** Read a Terraform file. Returns { items, things, settings, facts, links, permissions, unknowns, purpose }. */
export function readTerraform(src, file = 'main.tf') {
  const parsed = parseHcl(src);
  const { body, comments } = parsed;
  const blocks = body.filter((b) => b.kind === 'block');
  const things = [], settings = [], facts = [], links = [], permissions = [];
  const unknowns = parsed.errors.map((e) => ({ file, line: e.line, why: `Not read yet: ${e.why}.` }));
  const factIds = new Set();
  const fact = (kind, says, line) => { const id = `${file}#${kind}#${line}`; if (!factIds.has(id)) { factIds.add(id); facts.push({ id, kind, says, file, line }); } };
  const refWords = tfRefWords;

  // Locals: what each one refers to, so a resource that uses a local is linked to what the local names.
  const localRefs = new Map();
  for (const b of blocksOf(body, 'locals')) for (const a of b.body) if (a.kind === 'attr') localRefs.set(a.name, refsIn(a.value));
  const targetsOf = (node) => {
    const out = [];
    const visit = (refs, depth) => {
      for (const r of refs) {
        if (r.path[0] === 'local' && depth < 3 && localRefs.has(r.path[1])) { visit(localRefs.get(r.path[1]), depth + 1); continue; }
        const t = tfTarget(r);
        if (t) out.push({ to: t, ref: r });
      }
    };
    visit(refsIn(node), 0);
    return out;
  };
  // IAM policy documents written in this file, for policies that use them.
  const ctx = { src: parsed.src, policyDocs: new Map() };
  for (const b of blocks) if (b.type === 'data' && b.labels[0] === 'aws_iam_policy_document') {
    ctx.policyDocs.set(b.labels[1], blocksOf(b.body, 'statement').map((s) => {
      const list = (n) => { const a = attrOf(s.body, n)?.value; return !a ? [] : a.t === 'list' ? a.items.map((x) => (x.t === 'str' && !x.template ? x.v : `(${APPLIED})`)) : [`(${APPLIED})`]; };
      return {
        effect: attrOf(s.body, 'effect')?.value?.v ?? 'Allow', actions: list('actions'), notActions: list('not_actions'), resources: [...list('resources'), ...list('not_resources')],
        principals: blocksOf(s.body, 'principals').map((p) => ({ type: attrOf(p.body, 'type')?.value?.v ?? '*', ids: (() => { const a = attrOf(p.body, 'identifiers')?.value; return a?.t === 'list' ? a.items.map((x) => (x.t === 'str' && !x.template ? x.v : `(${APPLIED})`)) : []; })() })),
        line: s.line,
      };
    }));
  }

  // ── Resources, data sources, and modules ──
  const declared = [];
  for (const b of blocks) {
    if (b.type === 'resource' && b.labels.length >= 2) declared.push({ b, kind: 'resource', type: b.labels[0], name: b.labels[1], address: `${b.labels[0]}.${b.labels[1]}` });
    else if (b.type === 'data' && b.labels.length >= 2) declared.push({ b, kind: 'data', type: b.labels[0], name: b.labels[1], address: `data.${b.labels[0]}.${b.labels[1]}` });
    else if (b.type === 'module' && b.labels.length >= 1) declared.push({ b, kind: 'module', type: 'module', name: b.labels[0], address: `module.${b.labels[0]}` });
  }
  const byAddress = new Map(declared.map((d) => [d.address, d]));
  const link = (from, to, kind, line) => addLink(links, file, from, to, kind, line);

  for (const d of declared) {
    const { b, type, name, address } = d;
    const where = d.kind === 'module' ? `The module ${name}` : cap(named(typeWords(type), name));
    const knows = [];
    const know = (k) => knows.push({ start: null, ...k });
    if (d.kind === 'data') know({ name: 'looks-up', label: 'Looks up', kind: `an existing ${typeWords(type)}, made elsewhere (Terraform only reads it)`, line: b.line });
    if (d.kind === 'module') {
      const source = attrOf(b.body, 'source'), version = attrOf(b.body, 'version');
      if (source) know({ name: 'source', label: 'Uses the module', kind: valueText(source.value, refWords).text, line: source.line });
      if (version) know({ name: 'version', label: 'Version', kind: valueText(version.value, refWords).text, line: version.line });
    }
    for (const it of b.body) {
      if (it.kind === 'attr') {
        if (it.name === 'count') { know({ name: 'count', label: 'How many', kind: countWords(it.value, refWords), line: it.line, ...(isLiteral(it.value) ? {} : { computed: true }) }); continue; }
        if (it.name === 'for_each') { know({ name: 'for_each', label: 'One for each', kind: forEachWords(it.value, refWords).replace(/^one for each (of )?/, ''), line: it.line, ...(isLiteral(it.value) ? {} : { computed: true }) }); continue; }
        if (it.name === 'depends_on') {
          const ts = it.value.t === 'list' ? it.value.items.flatMap((x) => targetsOf(x)) : targetsOf(it.value);
          for (const t of ts) link(address, t.to, 'uses', it.line);
          know({ name: 'depends_on', label: 'Waits for', kind: listWords(ts.map((t) => tfRefWords({ t: 'ref', path: t.to.split('.') }) ?? t.to)), line: it.line });
          continue;
        }
        if (it.name === 'provider') { know({ name: 'provider', label: 'Uses the provider', kind: it.value.t === 'ref' ? it.value.path.join('.') : valueText(it.value, refWords).text, line: it.line }); continue; }
        if (d.kind === 'module' && (it.name === 'source' || it.name === 'version' || it.name === 'providers')) continue;
        const v = valueText(it.value, refWords);
        const secret = isSecretKey(it.name) && (it.value.t === 'str' || v.computed);
        const isLit = it.value.t === 'str' && !it.value.template;
        know({ name: it.name, label: cap(words(it.name)), kind: secret ? (isLit ? 'a secret written in the file (its value is not shown)' : `a secret${v.from?.length ? ` from ${listWords(v.from)}` : ''} (its value is not shown)`) : v.text, line: it.line, ...(v.computed ? { computed: true } : {}), ...(secret ? { secret: true } : {}) });
      } else if (it.type === 'lifecycle') {
        for (const a of it.body) {
          if (a.kind !== 'attr') { if (a.type === 'precondition' || a.type === 'postcondition') know({ name: a.type, label: a.type === 'precondition' ? 'Checks first' : 'Checks after', kind: `${conditionWords(attrOf(a.body, 'condition')?.value, refWords)}${attrOf(a.body, 'error_message') ? `, or stops: "${valueText(attrOf(a.body, 'error_message').value, refWords).text}"` : ''}`, line: a.line }); continue; }
          if (a.name === 'prevent_destroy' && a.value.t === 'bool' && a.value.v) know({ name: 'prevent_destroy', label: 'Protected', kind: 'Terraform refuses to destroy it (prevent_destroy)', line: a.line });
          else if (a.name === 'create_before_destroy' && a.value.t === 'bool' && a.value.v) know({ name: 'create_before_destroy', label: 'When replaced', kind: 'makes the new one before removing the old one', line: a.line });
          else if (a.name === 'ignore_changes') know({ name: 'ignore_changes', label: 'Ignores changes to', kind: a.value.t === 'list' ? listWords(a.value.items.map((x) => (x.t === 'ref' ? words(x.path.join('.')) : valueText(x, refWords).text))) || 'nothing' : a.value.t === 'ref' && a.value.path[0] === 'all' ? 'everything (it is only made, never updated)' : valueText(a.value, refWords).text, line: a.line });
          else if (a.name === 'replace_triggered_by') know({ name: 'replace_triggered_by', label: 'Replaced when these change', kind: listWords((a.value.items ?? []).map((x) => tfRefWords(x) ?? 'a value')), line: a.line });
        }
      } else if (it.type === 'dynamic') {
        const fe = attrOf(it.body, 'for_each');
        know({ name: it.labels[0], label: cap(words(it.labels[0])), kind: `one block for each ${fe ? forEachWords(fe.value, refWords).replace(/^one for each /, '') : 'item'}`, line: it.line, computed: true });
      } else if (it.type !== 'connection' && it.type !== 'provisioner') {
        const nm = attrOf(it.body, 'name')?.value;
        know({ name: it.type, label: cap(words([it.type, ...it.labels].join(' '))) + (nm?.t === 'str' && !nm.template ? ` ${nm.v}` : ''), kind: blockSummary(it, refWords), line: it.line });
      } else know({ name: it.type, label: it.type === 'provisioner' ? `Runs (${it.labels[0] ?? 'provisioner'})` : 'Connects with', kind: blockSummary(it, refWords), line: it.line });
    }
    // Links: every reference to another resource, under the key it sits in.
    walkAttrs(b.body, (a) => {
      if (a.name === 'depends_on') return;
      for (const lf of leaves(a.value, a.name, a.line)) for (const t of targetsOf(lf.value)) link(address, t.to, linkKind(lf.key, { toLookup: t.to.startsWith('data.'), fromType: type, secretValue: /secret$/.test(t.to.split('.').at(-2) ?? '') && t.ref.path.at(-1) === 'value' }), lf.line);
    });
    // Facts from what the resource says about itself.
    walkAttrs(b.body, (a) => {
      keyFacts(a.name, a.value, (kind, says) => fact(kind, says, a.line), where);
      if (a.value.t === 'obj') for (const e of literalEntries(a.value)) keyFacts(e.key, e.value, (kind, says) => fact(kind, says, e.line), where);
    });
    ingressFacts(d, fact);
    const perms = permissionsOf(d, ctx, file, refWords);
    for (const p of perms) { const k = p.role && knows.find((kn) => kn.name === 'role_definition_id'); if (k) { k.kind = `${p.role} (a built-in role)`; delete k.computed; } }
    permissions.push(...perms);
    things.push({
      kind: 'resource', name: address, label: d.kind === 'module' ? `Module ${name}` : resourceLabel(type, name), resourceType: type, address, file,
      lines: [b.line, b.endLine], knows, choices: [], ...(b.doc ? { doc: b.doc } : {}), ...(d.kind === 'data' ? { existing: true } : {}),
    });
  }
  for (const p of permissions) if (p.wide) fact('wide-permission', `${cap(p.who)} can ${p.can} on ${p.on}: ${p.why}.`, p.line);

  // ── Settings: variables, locals, outputs ──
  for (const b of blocks) {
    if (b.type === 'variable' && b.labels[0]) {
      const n = b.labels[0];
      const sens = attrOf(b.body, 'sensitive')?.value;
      const secret = (sens?.t === 'bool' && sens.v) || isSecretKey(n);
      const def = attrOf(b.body, 'default'), desc = attrOf(b.body, 'description'), ty = attrOf(b.body, 'type');
      if (secret && def && def.value.t === 'str' && !def.value.template && def.value.v) fact('secret-in-plain-config', `The setting ${n} is a secret, but its default value is written in the file.`, def.line);
      settings.push({ name: n, source: 'parameter', secret: !!secret, file, line: b.line,
        ...(def && !secret ? { default: valueText(def.value, refWords).text.replace(` (${APPLIED})`, '') } : {}), ...(ty ? { type: typeExprWords(ty.value, parsed.src) } : {}),
        ...(desc?.value.t === 'str' && desc.value.v ? { doc: desc.value.v.trim() } : {}) });
    } else if (b.type === 'locals') {
      for (const a of b.body) if (a.kind === 'attr') {
        const lit = isLiteral(a.value);
        const secret = isSecretKey(a.name) && a.value.t === 'str';
        if (secret && lit && a.value.v) fact('secret-in-plain-config', `The value ${a.name} looks like a secret and is written in the file.`, a.line);
        settings.push({ name: a.name, source: lit ? 'literal' : 'computed', secret, file, line: a.line, ...(lit ? {} : { computed: true }), ...(lit && !secret ? { default: valueText(a.value, refWords).text } : {}) });
      }
    } else if (b.type === 'output' && b.labels[0]) {
      const sens = attrOf(b.body, 'sensitive')?.value;
      const desc = attrOf(b.body, 'description');
      const val = attrOf(b.body, 'value');
      const from = val ? valueText(val.value, refWords) : null;
      settings.push({ name: b.labels[0], source: 'computed', secret: !!(sens?.t === 'bool' && sens.v), computed: true, output: true, file, line: b.line,
        ...(from?.from?.length ? { from: from.from.slice(0, 3) } : {}), ...(desc?.value.t === 'str' && desc.value.v ? { doc: desc.value.v.trim() } : {}) });
    } else if (b.type === 'provider') {
      walkAttrs(b.body, (a) => { keyFacts(a.name, a.value, (kind, says) => fact(kind, says, a.line), `The ${providerWords(b.labels[0])} provider`); });
    }
  }

  // ── The order things are created: one Steps card ──
  const steps = [];
  for (const b of blocksOf(body, 'terraform')) {
    for (const be of blocksOf(b.body, 'backend')) steps.push({ kind: 'call', says: `Keeps what it made (its state) in ${BACKENDS[be.labels[0]] ?? `the ${be.labels[0]} backend`}`, code: `backend "${be.labels[0]}"`, line: be.line });
    const cl = blocksOf(b.body, 'cloud')[0];
    if (cl) steps.push({ kind: 'call', says: 'Keeps what it made (its state) in HCP Terraform', code: 'cloud { … }', line: cl.line });
  }
  for (const b of blocksOf(body, 'provider')) {
    const p = b.labels[0] ?? '';
    const bits = [];
    for (const k of ['region', 'location', 'project', 'subscription_id', 'zone']) {
      const a = attrOf(b.body, k);
      if (a) bits.push(`${k === 'subscription_id' ? 'the subscription' : `the ${words(k)}`} ${valueText(a.value, refWords).text}`);
    }
    const alias = attrOf(b.body, 'alias');
    steps.push({ kind: 'call', says: `Works in ${providerWords(p)}${bits.length ? `, in ${listWords(bits)}` : ''}${alias ? ` (as ${p}.${valueText(alias.value, refWords).text})` : ''}`, code: `provider "${p}"`, line: b.line });
  }
  const edges = links.filter((l) => byAddress.has(l.to)).map((l) => [l.from, l.to]);
  const order = topoOrder(declared.map((d) => d.address), edges);
  for (const addr of order) {
    const d = byAddress.get(addr);
    const { b, type, name } = d;
    const inLink = links.find((l) => l.from === addr && l.kind === 'runs-in' && byAddress.has(l.to));
    const inWords = inLink ? ` in the ${typeWords(byAddress.get(inLink.to).type)} ${byAddress.get(inLink.to).name}` : '';
    const head = d.kind === 'resource' ? `resource "${type}" "${name}"` : d.kind === 'data' ? `data "${type}" "${name}"` : `module "${name}"`;
    const src = attrOf(b.body, 'source');
    const what = d.kind === 'module' ? `the module ${name}${src ? ` (${valueText(src.value, refWords).text})` : ''}` : named(typeWords(type), name);
    const verb = d.kind === 'data' ? 'Looks up' : d.kind === 'module' ? 'Uses' : 'Creates';
    let step = { kind: 'call', says: `${verb} ${what}${inWords}`, code: head, line: b.line };
    const count = attrOf(b.body, 'count'), fe = attrOf(b.body, 'for_each');
    if (count) {
      const c = count.value;
      const cond = c.t === 'cond' ? c : null;
      if (cond && isZero(cond.no)) step = { kind: 'branch', says: question(conditionWords(cond.test, refWords)), code: `count = ${parsed.src.slice(c.s, c.e)}`, line: count.line, children: [step] };
      else if (cond && isZero(cond.yes)) step = { kind: 'branch', says: question(conditionWords({ t: 'unary', op: '!', x: cond.test }, refWords)), code: `count = ${parsed.src.slice(c.s, c.e)}`, line: count.line, children: [step] };
      else if (c.t === 'num') { if (c.v === 0) step.says += ' (none: count is 0)'; else if (c.v !== 1) step.says = `${verb} ${c.v} of ${what}${inWords}`; }
      else step = { kind: 'loop', says: `As many times as ${valueText(c, refWords).text.replace(` (${APPLIED})`, '')}`, code: `count = ${parsed.src.slice(c.s, c.e)}`, line: count.line, children: [step] };
    } else if (fe) step = { kind: 'loop', says: `For each ${forEachWords(fe.value, refWords).replace(/^one for each /, '')}`, code: `for_each = ${parsed.src.slice(fe.value.s, fe.value.e)}`, line: fe.line, children: [step] };
    steps.push(step);
  }
  const base = file.slice(file.lastIndexOf('/') + 1);
  const items = [];
  if (declared.length) {
    const first = Math.min(...steps.map((s) => s.line)), last = Math.max(...declared.map((d) => d.b.endLine));
    items.push({
      id: `apply:${first}`, name: 'apply', label: `Applying ${base}`, title: `What applying ${base} makes, in order`, line: first, endLine: last,
      inputs: [], returns: null, provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0, stepsReadable: 1,
      says: `Applying ${base} makes ${declared.filter((d) => d.kind === 'resource').length} resource${declared.filter((d) => d.kind === 'resource').length === 1 ? '' : 's'}${declared.some((d) => d.kind === 'module') ? ` and uses ${declared.filter((d) => d.kind === 'module').length} module${declared.filter((d) => d.kind === 'module').length === 1 ? '' : 's'}` : ''}, in the order they rely on each other.`,
      headline: `Applying ${base}: ${steps.length} step${steps.length === 1 ? '' : 's'}.`, guards: [], unread: [],
    });
  }
  const top = comments.find((c) => c.line === 1);
  return { items, things, settings, facts, links, permissions, unknowns, purpose: top && top.text && !/^(disable|tflint)/.test(top.text) ? top.text : null };
}

const isZero = (n) => n?.t === 'num' && n.v === 0;
function countWords(n, refWords) {
  if (n.t === 'num') return n.v === 0 ? 'none (count is 0)' : String(n.v);
  if (n.t === 'cond' && isZero(n.no)) return `${n.yes.t === 'num' ? n.yes.v === 1 ? 'one' : n.yes.v : valueText(n.yes, refWords).text}, only when ${conditionWords(n.test, refWords)}`;
  if (n.t === 'cond' && isZero(n.yes)) return `${n.no.t === 'num' ? n.no.v === 1 ? 'one' : n.no.v : valueText(n.no, refWords).text}, only when ${conditionWords({ t: 'unary', op: '!', x: n.test }, refWords)}`;
  return valueText(n, refWords).text;
}
function forEachWords(n, refWords) {
  if (isLiteral(n)) { const v = valueText(n, refWords).text; return `one for each of ${v}`; }
  const inner = n.t === 'call' && /^(toset|tomap|tolist)$/.test(n.name) && n.args.length === 1 ? n.args[0] : n;
  if (inner.t === 'cond') return `one for each item in ${valueText(inner.yes, refWords).from?.[0] ?? 'a list'}, only when ${conditionWords(inner.test, refWords)}`;
  const v = valueText(inner, refWords);
  return `one for each item in ${v.from?.length === 1 ? v.from[0] : `a list ${APPLIED}`}`;
}
function typeExprWords(n, src) {
  const raw = src.slice(n.s, n.e).replace(/\s+/g, ' ');
  if (n.t === 'ref') return { string: 'words', number: 'a number', bool: 'yes or no', any: 'anything' }[n.path[0]] ?? raw;
  if (n.t === 'call' && n.args.length === 1) { const inner = typeExprWords(n.args[0], src); return { list: `a list of ${inner}`, set: `a set of ${inner}`, map: `a map of ${inner}` }[n.name] ?? raw; }
  return raw.length > 60 ? `${raw.slice(0, 59)}…` : raw;
}

// ── Permissions ─────────────────────────────────────────────────────────────────────────────────────────────

function scopeWords(n, refWords) {
  if (!n) return { on: 'what it is attached to', wide: false };
  if (n.t === 'ref') {
    const p = n.path;
    if ((p[0] === 'data' && p[1] === 'azurerm_subscription') || (p[0] === 'data' && p[1] === 'azurerm_subscriptions')) return { on: 'the whole subscription', wide: true };
    if (/management_group/.test(p[0] === 'data' ? p[1] : p[0])) return { on: `the management group ${p[0] === 'data' ? p[2] : p[1]} (every subscription in it)`, wide: true };
    const t = tfTarget(n);
    if (t) { const parts = t.split('.'); return { on: parts[0] === 'data' ? `the ${typeWords(parts[1])} ${parts[2]}` : parts[0] === 'module' ? `what the module ${parts[1]} makes` : `the ${typeWords(parts[0])} ${parts[1]}` }; }
    return { on: `the scope ${refWords(n) ?? APPLIED}`, wide: false };
  }
  const text = n.t === 'str' ? (n.template ? n.parts.map((x) => (typeof x === 'string' ? x : '{…}')).join('') : n.v) : null;
  if (text != null) {
    if (/^\/subscriptions\/[^/]+\/?$/i.test(text)) return { on: 'the whole subscription', wide: true };
    if (/managementGroups\//i.test(text)) return { on: 'a management group (every subscription in it)', wide: true };
    const rg = /\/resourceGroups\/([^/]+)\/?$/i.exec(text);
    if (rg) return { on: `the resource group ${rg[1]}` };
    if (/^projects\/|^organizations\/|^folders\//.test(text)) return { on: text };
    return { on: text.includes('/') ? `the resource ${text.split('/').filter(Boolean).pop()}` : text };
  }
  return { on: valueText(n, refWords).text };
}

function azurePrincipal(n, refWords) {
  if (!n) return 'someone';
  if (n.t === 'ref') {
    const p = n.path;
    if (p[0] === 'data' && p[1] === 'azurerm_client_config') return 'whoever runs Terraform';
    if (p[0] === 'var') return `the identity given in the setting ${p[1]}`;
    const t = tfTarget(n);
    if (t && !t.startsWith('module.') && !t.startsWith('data.')) {
      if (p.includes('identity')) return `the ${typeWords(p[0])} ${p[1]} (its own identity)`;
      if (p[0] === 'azurerm_user_assigned_identity') return `the managed identity ${p[1]}`;
      return `the ${typeWords(p[0])} ${p[1]}`;
    }
    return refWords(n) ?? 'an identity worked out when it is applied';
  }
  if (n.t === 'str' && !n.template) return `the identity ${n.v}`;
  return `an identity ${APPLIED}`;
}

function roleOf(body) {
  const name = attrOf(body, 'role_definition_name')?.value;
  if (name?.t === 'str' && !name.template) return { role: name.v };
  const id = attrOf(body, 'role_definition_id')?.value;
  if (id) { const r = roleIn(id.t === 'str' ? (id.v ?? id.parts.filter((x) => typeof x === 'string').join('')) : ''); if (r) return { role: r }; }
  return { role: null, node: name ?? id };
}

function permissionsOf(d, ctx, file, refWords) {
  const { b, type, name } = d;
  if (d.kind !== 'resource') return [];
  const out = [];
  const add = (who, can, on, line, wide = false, why, role) => out.push({ id: `${file}#permission#${line}#${out.length}`, who, can, on, wide: !!wide, ...(wide && why ? { why } : {}), ...(role ? { role } : {}), file, line, says: `${cap(who)} can ${can} on ${on}` });
  const val = (k) => attrOf(b.body, k)?.value;
  if (type === 'azurerm_role_assignment') {
    const { role, node } = roleOf(b.body);
    const scope = scopeWords(val('scope'), refWords);
    const wide = role && WIDE_ROLES.has(role) && scope.wide;
    add(azurePrincipal(val('principal_id'), refWords), role ? roleCan(role) : `act in the role ${node ? valueText(node, refWords).text : 'it is given'}`, scope.on, b.line, wide, wide ? `${role} of ${scope.on}` : undefined, role);
  } else if (type === 'azurerm_key_vault_access_policy' || type === 'azurerm_key_vault') {
    const pols = type === 'azurerm_key_vault' ? blocksOf(b.body, 'access_policy') : [b];
    for (const p of pols) {
      const perms = ['secret', 'key', 'certificate', 'storage'].map((k) => { const a = attrOf(p.body, `${k}_permissions`)?.value; return a?.t === 'list' && a.items.length ? `${listWords(a.items.map((x) => (x.v ?? '…').toLowerCase()))} ${k}s` : null; }).filter(Boolean);
      if (!perms.length) continue;
      const kv = type === 'azurerm_key_vault' ? `the key vault ${name}` : scopeWords(attrOf(p.body, 'key_vault_id')?.value, refWords).on;
      const all = perms.some((x) => /\bpurge\b|\ball\b/.test(x));
      add(azurePrincipal(attrOf(p.body, 'object_id')?.value, refWords), listWords(perms), kv, p.line, all, all ? 'it can purge or do everything to them' : undefined);
    }
  } else if (/^aws_iam_(role_policy|user_policy|group_policy|policy)$/.test(type)) {
    const who = type === 'aws_iam_policy' ? `whoever is given ${named('policy', name)}` : type === 'aws_iam_role_policy' ? iamWho('IAM role', val('role'), refWords) : type === 'aws_iam_user_policy' ? iamWho('IAM user', val('user'), refWords) : iamWho('IAM group', val('group'), refWords);
    for (const st of policyStatements(val('policy'), ctx)) if (/^allow$/i.test(st.effect)) { const w = statementWide(st); add(who, actionsWords(st.actions, st.notActions), resourcesWords(st.resources), attrOf(b.body, 'policy').line, w, w); }
  } else if (type === 'aws_iam_role') {
    for (const st of policyStatements(val('assume_role_policy'), ctx)) if (/^allow$/i.test(st.effect) && st.principals.length) {
      const anyone = st.principals.some((p) => p.ids.includes('*'));
      add(principalWords(st.principals), 'act as this role', `the IAM role ${name}`, attrOf(b.body, 'assume_role_policy').line, anyone, anyone ? 'anyone can take on this role' : undefined);
    }
    for (const ip of blocksOf(b.body, 'inline_policy')) for (const st of policyStatements(attrOf(ip.body, 'policy')?.value, ctx)) if (/^allow$/i.test(st.effect)) { const w = statementWide(st); add(`the IAM role ${name}`, actionsWords(st.actions, st.notActions), resourcesWords(st.resources), ip.line, w, w); }
  } else if (/^aws_iam_(role|user|group)_policy_attachment$/.test(type) || type === 'aws_iam_policy_attachment') {
    const arn = val('policy_arn');
    const kind = type.includes('_user_') ? 'IAM user' : type.includes('_group_') ? 'IAM group' : 'IAM role';
    const who = type === 'aws_iam_policy_attachment' ? `the roles, users, and groups it lists` : iamWho(kind, val(kind === 'IAM user' ? 'user' : kind === 'IAM group' ? 'group' : 'role'), refWords);
    const pname = arn?.t === 'str' && !arn.template ? arn.v.split('/').pop() : null;
    const can = pname ? `do what the AWS policy ${pname} allows` : arn?.t === 'ref' && arn.path[0] === 'aws_iam_policy' ? `do what ${named('policy', arn.path[1])} allows` : `do what the policy in ${(arn && (refWords(arn) ?? valueText(arn, refWords).from?.[0])) ?? `a value ${APPLIED}`} allows`;
    const wide = pname && /^(AdministratorAccess|PowerUserAccess|IAMFullAccess)$/.test(pname);
    add(who, can, 'what that policy names', b.line, wide, wide ? `${pname} can do almost anything in the account` : undefined);
  } else if (/^google_.*_iam_(member|binding)$/.test(type)) {
    const role = val('role');
    const roleName = role?.t === 'str' && !role.template ? role.v : null;
    const members = type.endsWith('_binding') ? (val('members')?.items ?? []) : [val('member')].filter(Boolean);
    const level = type.replace(/^google_/, '').replace(/_iam_(member|binding)$/, '');
    const target = ['project', 'folder', 'organization'].includes(level) ? `the ${level} ${valueText(val(level === 'organization' ? 'org_id' : level === 'folder' ? 'folder' : 'project') ?? { t: 'str', v: '(its default)', template: false, parts: [] }, refWords).text}` : `the ${words(level)} ${valueText(val(level.split('_').pop()) ?? val('name') ?? { t: 'null' }, refWords).text}`;
    const wide = roleName && WIDE_ROLES.has(roleName) && ['project', 'folder', 'organization'].includes(level);
    for (const m of members) {
      const who = gcpMember(m, refWords);
      add(who, roleName ? `act as ${roleName}` : `act in the role ${valueText(role, refWords).text}`, target, m.line ?? b.line, wide, wide ? `${roleName} on ${target}` : undefined, roleName);
    }
  }
  return out;
}

function iamWho(kind, n, refWords) {
  if (!n) return `the ${kind}`;
  if (n.t === 'ref' && /^aws_iam_(role|user|group)$/.test(n.path[0])) return named(kind, n.path[1]);
  if (n.t === 'str' && !n.template) return `the ${kind} ${n.v}`;
  return `the ${kind} ${refWords(n) ?? APPLIED}`;
}
function gcpMember(n, refWords) {
  if (n.t !== 'str' || n.template) return `the member ${valueText(n, refWords).text}`;
  const v = n.v;
  if (v === 'allUsers') return 'anyone on the internet';
  if (v === 'allAuthenticatedUsers') return 'anyone with a Google account';
  const [kind, id] = v.split(':');
  return { serviceAccount: `the service account ${id}`, user: `the user ${id}`, group: `the group ${id}`, domain: `everyone in ${id}` }[kind] ?? v;
}

// ── Open ports ──────────────────────────────────────────────────────────────────────────────────────────────

function strList(n) {
  if (!n) return [];
  if (n.t === 'list') return n.items.filter((x) => x.t === 'str' && !x.template).map((x) => x.v);
  if (n.t === 'str' && !n.template) return [n.v];
  return [];
}

function ingressFacts(d, fact) {
  const { b, type, name } = d;
  const where = cap(named(typeWords(type), name));
  const v = (body, k) => attrOf(body, k)?.value;
  const num = (n) => (n?.t === 'num' ? n.v : n?.t === 'str' && !n.template ? n.v : null);
  const report = (ports, line) => { if (ports.beyondWeb) fact('public-ingress', `${where} lets anyone on the internet reach ${ports.says}.`, line); };
  if (type === 'aws_security_group') {
    for (const r of blocksOf(b.body, 'ingress')) {
      if (fromAnywhere([...strList(v(r.body, 'cidr_blocks')), ...strList(v(r.body, 'ipv6_cidr_blocks'))])) report(portsOpen(num(v(r.body, 'from_port')), num(v(r.body, 'to_port')), num(v(r.body, 'protocol'))), r.line);
    }
  } else if (type === 'aws_security_group_rule') {
    if (num(v(b.body, 'type')) === 'ingress' && fromAnywhere([...strList(v(b.body, 'cidr_blocks')), ...strList(v(b.body, 'ipv6_cidr_blocks'))])) report(portsOpen(num(v(b.body, 'from_port')), num(v(b.body, 'to_port')), num(v(b.body, 'protocol'))), b.line);
  } else if (type === 'aws_vpc_security_group_ingress_rule') {
    if (fromAnywhere([...strList(v(b.body, 'cidr_ipv4')), ...strList(v(b.body, 'cidr_ipv6'))])) report(portsOpen(num(v(b.body, 'from_port')), num(v(b.body, 'to_port')), num(v(b.body, 'ip_protocol'))), b.line);
  } else if (type === 'azurerm_network_security_rule' || type === 'azurerm_network_security_group') {
    const rules = type === 'azurerm_network_security_rule' ? [b] : blocksOf(b.body, 'security_rule');
    for (const r of rules) {
      if (String(num(v(r.body, 'direction')) ?? '').toLowerCase() !== 'inbound' || String(num(v(r.body, 'access')) ?? '').toLowerCase() !== 'allow') continue;
      if (!fromAnywhere([...strList(v(r.body, 'source_address_prefix')), ...strList(v(r.body, 'source_address_prefixes'))])) continue;
      const ports = [...strList(v(r.body, 'destination_port_range')), ...strList(v(r.body, 'destination_port_ranges'))];
      for (const p of ports.length ? ports : ['*']) report(p === '*' ? { says: 'every port', beyondWeb: true } : portsOpen(p, null, num(v(r.body, 'protocol'))), r.line);
    }
  } else if (type === 'google_compute_firewall') {
    const dir = String(num(v(b.body, 'direction')) ?? 'INGRESS').toUpperCase();
    if (dir === 'INGRESS' && fromAnywhere(strList(v(b.body, 'source_ranges')))) {
      for (const a of blocksOf(b.body, 'allow')) {
        const ports = strList(v(a.body, 'ports'));
        for (const p of ports.length ? ports : ['*']) report(portsOpen(p === '*' ? null : p, null, num(v(a.body, 'protocol'))), a.line);
      }
    }
  } else if (type === 'google_storage_bucket_iam_member' || type === 'google_storage_bucket_iam_binding') {
    const ms = type.endsWith('_binding') ? strList(v(b.body, 'members')) : strList(v(b.body, 'member'));
    if (ms.some((m) => m === 'allUsers' || m === 'allAuthenticatedUsers')) fact('storage-public', `${where} lets ${ms.includes('allUsers') ? 'anyone on the internet' : 'anyone with a Google account'} into the bucket.`, b.line);
  }
}
