// GitHub Actions workflows in Thunder: how an app is built, tested, and released. Each job is an Action whose badge
// says WHEN it runs ("When someone pushes to main", "On a schedule: every day at 02:00 UTC"), its steps in words:
// well-known actions ("Gets the code", "Sets up Node 22"), `run:` commands one per step, `if:` as a question, `needs:`
// as its order, and `exit 1` as a Stop. `permissions:` become Permissions ("This workflow can read the code"),
// secrets are named and never shown, and values worked out when it runs say so. Deterministic, browser-safe.
import { parseYaml, get, entry, text, list } from './yaml.mjs';
import { shellSteps, conditionQuestion, cronWords, secretsIn, sayExpressions, hasExpression, expressionsIn, valueWords, listWords, orWords, cap, lc, SECRET_NAME } from './infra-words.mjs';

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const texts = (n) => list(n).map(text).filter((x) => x != null);

/** Every scalar under a node, with its line (for finding secrets and expressions). */
function scalars(n, out = []) {
  if (!n) return out;
  if (n.t === 'map') for (const e of n.entries) { out.push({ v: e.key, line: e.line }); scalars(e.value, out); }
  else if (n.t === 'seq') for (const x of n.items) scalars(x, out);
  else if (n.v != null) out.push({ v: String(n.v), line: n.line, node: n });
  return out;
}
/** The last line a node covers (a block scalar covers all of its lines). */
function lastLine(n) {
  if (!n) return 0;
  if (n.t === 'map') return Math.max(n.line, ...n.entries.map((e) => Math.max(e.line, lastLine(e.value))));
  if (n.t === 'seq') return Math.max(n.line, ...n.items.map(lastLine));
  if (n.block) return (n.valueLine ?? n.line) + Math.max(0, String(n.v).replace(/\n+$/, '').split('\n').length - 1);
  return n.line;
}

// ── When it runs ───────────────────────────────────────────────────────────────────────────────────────

const PR_TYPES = { opened: 'opened', synchronize: 'updated', reopened: 'reopened', closed: 'closed', edited: 'edited', labeled: 'labeled', unlabeled: 'unlabeled', ready_for_review: 'marked ready for review', review_requested: 'given a reviewer', assigned: 'assigned', converted_to_draft: 'turned into a draft' };
const OTHER_EVENTS = {
  workflow_dispatch: 'someone starts it by hand', workflow_call: 'another workflow calls it', issue_comment: 'someone comments on an issue or pull request',
  issues: 'something happens to an issue', merge_group: 'a pull request joins the merge queue', repository_dispatch: 'another system asks it to run',
  pull_request_review: 'someone reviews a pull request', pull_request_review_comment: 'someone comments on a pull request review', create: 'a branch or tag is made',
  delete: 'a branch or tag is deleted', deployment: 'a deployment is made', deployment_status: "a deployment's status changes", fork: 'someone forks the repository',
  watch: 'someone stars the repository', page_build: 'GitHub Pages is built', label: 'a label changes', milestone: 'a milestone changes', discussion: 'something happens to a discussion',
  check_run: 'a check runs', check_suite: 'a group of checks runs', status: "a commit's status changes", registry_package: 'a package is published or updated', public: 'the repository is made public',
};
const pathsWords = (cfg) => {
  const paths = texts(get(cfg, 'paths'));
  const ignore = texts(get(cfg, 'paths-ignore'));
  if (paths.length) return paths.length <= 3 ? ` and changes ${orWords(paths)}` : ' and changes certain files';
  if (ignore.length) return ' (unless it changes only files it ignores)';
  return '';
};

function eventPhrase(ev, cfg) {
  if (ev === 'push') {
    const branches = texts(get(cfg, 'branches')), tags = texts(get(cfg, 'tags')), notBranches = texts(get(cfg, 'branches-ignore'));
    const parts = [];
    if (branches.length) parts.push(orWords(branches));
    if (tags.length) parts.push(`a tag like ${orWords(tags)}`);
    const base = parts.length ? `someone pushes to ${parts.join(' or ')}` : notBranches.length ? `someone pushes to any branch except ${orWords(notBranches)}` : 'someone pushes';
    return base.replace('pushes to a tag', 'pushes a tag') + pathsWords(cfg);
  }
  if (ev === 'pull_request' || ev === 'pull_request_target') {
    const types = texts(get(cfg, 'types'));
    const branches = texts(get(cfg, 'branches'));
    const what = types.length ? orWords([...new Set(types.map((t) => PR_TYPES[t] ?? words(t)))]) : 'opened or updated';
    return `a pull request${branches.length ? ` to ${orWords(branches)}` : ''} is ${what}${pathsWords(cfg)}${ev === 'pull_request_target' ? " (it runs with this repository's own access, even for pull requests from forks)" : ''}`;
  }
  if (ev === 'release') {
    const types = texts(get(cfg, 'types'));
    return types.length ? `a release is ${orWords(types.map((t) => words(t)))}` : 'something happens to a release';
  }
  if (ev === 'workflow_run') {
    const names = texts(get(cfg, 'workflows'));
    const types = texts(get(cfg, 'types'));
    return `the ${orWords(names.map((n) => `"${n}"`)) || 'other'} workflow ${types.length && types.every((t) => t === 'requested') ? 'starts' : 'finishes'}`;
  }
  return OTHER_EVENTS[ev] ?? `the ${words(ev)} event happens`;
}

/** The workflow's triggers in words, and the list of events. */
export function triggerWords(onNode) {
  const events = [];
  if (onNode?.t === 'str') events.push({ ev: onNode.v, cfg: null, line: onNode.line });
  else if (onNode?.t === 'seq') for (const x of onNode.items) events.push({ ev: text(x), cfg: null, line: x.line });
  else if (onNode?.t === 'map') for (const e of onNode.entries) events.push({ ev: e.key, cfg: e.value, line: e.line });
  const phrases = [];
  for (const { ev, cfg } of events) {
    if (ev === 'schedule') {
      for (const s of list(cfg)) { const c = text(get(s, 'cron')); if (c) { const w = cronWords(c); phrases.push(w ? `on a schedule: ${w}` : `on a schedule (cron ${c})`); } }
      continue;
    }
    phrases.push(eventPhrase(ev, cfg));
  }
  if (!phrases.length) return { when: 'When nothing (it has no triggers)', events };
  const first = phrases[0].startsWith('on a schedule') ? cap(phrases[0]) : `When ${phrases[0]}`;
  const comma = phrases.length > 2 || phrases.some((p) => / or | and /.test(p));
  const when = phrases.length === 1 ? first : comma ? `${first}, or ${phrases.slice(1).join(', or ')}` : `${first} or ${phrases[1]}`;
  return { when, events };
}

// ── Permissions ───────────────────────────────────────────────────────────────────────────────────────

const SCOPES = {
  contents: 'the code', packages: 'packages', 'pull-requests': 'pull requests', issues: 'issues', actions: 'workflow runs', checks: 'checks',
  deployments: 'deployments', statuses: 'commit statuses', 'security-events': 'security alerts', pages: 'GitHub Pages', attestations: 'attestations',
  discussions: 'discussions', 'repository-projects': 'projects', models: 'GitHub Models',
};
function permissionsOf(n, who, file, keyLine) {
  const out = [];
  const add = (can, on, line, extra = {}) => out.push({ id: `${file}#permission#${line}#${out.length}`, who, can, on, wide: false, file, line, says: `${who} ${can === 'not use' ? 'cannot use' : `can ${can}`} ${on}${extra.wide ? ' (wide)' : ''}`, ...extra });
  if (n?.t === 'str') {
    const v = String(n.v ?? '').trim();
    if (v === 'write-all') add('change', 'everything in the repository', n.line, { wide: true, why: 'write-all lets it change every part of the repository: code, packages, releases, settings for workflows, and more.' });
    else if (v === 'read-all') add('read', 'everything in the repository', n.line);
    return out;
  }
  if (n?.t === 'map') {
    if (!n.entries.length) add('not use', 'anything in the repository', keyLine);
    for (const e of n.entries) {
      const level = text(e.value);
      if (e.key === 'id-token') { if (level === 'write') add('ask for', 'an identity token (to sign in to other services without a stored password)', e.line); continue; }
      add(level === 'write' ? 'write' : level === 'read' ? 'read' : 'not use', SCOPES[e.key] ?? words(e.key), e.line);
    }
  }
  return out;
}

// ── Well-known actions in words ────────────────────────────────────────────────────────────────────────

/** A version given to a setup action: "22", or "(the node for this run)" when it is worked out when it runs. */
const ver = (v) => {
  if (v == null || v === '') return '';
  if (hasExpression(v)) { const x = expressionsIn(v); return x.length === 1 ? ` (${valueWords(x[0].expr) ?? 'its version is worked out when it runs'})` : ' (its version is worked out when it runs)'; }
  return ` ${v}`;
};
const SETUP = { 'setup-node': 'Node', 'setup-python': 'Python', 'setup-java': 'Java', 'setup-go': 'Go', 'setup-dotnet': '.NET', 'setup-ruby': 'Ruby' };

function actionWords(uses, w) {
  const u = String(uses).trim();
  if (u.startsWith('./')) return `Uses the action in ${u.slice(2)}`;
  if (u.startsWith('docker://')) return `Runs the image ${u.slice(9)}`;
  const repo = u.split('@')[0];
  const [owner, name = '', ...sub] = repo.split('/');
  const path = sub.join('/');
  const key = `${owner}/${name}`.toLowerCase();
  const W = (k) => (w[k] != null ? sayExpressions(String(w[k])) : null);
  if (key === 'actions/checkout') {
    const bits = [];
    if (w.repository) bits.push(`of ${W('repository')}`);
    if (w.ref) bits.push(`at ${W('ref')}`);
    if (String(w['fetch-depth']) === '0') bits.push('with its whole history');
    return `Gets the code${bits.length ? ` ${bits.join(' ')}` : ''}`;
  }
  const setupName = /^actions\/(setup-\w+)$/.exec(key)?.[1] ?? (key === 'ruby/setup-ruby' ? 'setup-ruby' : null);
  if (setupName && SETUP[setupName]) {
    const lang = SETUP[setupName];
    const vkey = Object.keys(w).find((k) => /-version$/.test(k) && k !== 'check-latest');
    const vfile = Object.keys(w).find((k) => /-version-file$/.test(k));
    let s = `Sets up ${lang}${vkey ? ver(String(w[vkey])) : vfile ? ` (the version in ${w[vfile]})` : ''}`;
    if (setupName === 'setup-java' && w.distribution) s += ` (${w.distribution})`;
    if (w['registry-url']) s += /registry\.npmjs\.org/.test(String(w['registry-url'])) ? ', ready to publish to npm' : `, ready to publish to ${W('registry-url')}`;
    if (w.cache) s += ', reusing saved downloads';
    return s;
  }
  const known = {
    'pnpm/action-setup': () => `Sets up pnpm${ver(w.version)}`, 'oven-sh/setup-bun': () => `Sets up Bun${ver(w['bun-version'])}`, 'denoland/setup-deno': () => 'Sets up Deno',
    'hashicorp/setup-terraform': () => 'Sets up Terraform', 'azure/setup-kubectl': () => 'Sets up kubectl', 'azure/setup-helm': () => 'Sets up Helm', 'astral-sh/setup-uv': () => 'Sets up uv',
    'dtolnay/rust-toolchain': () => `Sets up Rust${u.includes('@') && !/^[0-9a-f]{40}$/.test(u.split('@')[1]) ? ` ${u.split('@')[1]}` : ''}`,
    'docker/setup-buildx-action': () => 'Sets up Docker Buildx (for building images)', 'docker/setup-qemu-action': () => 'Sets up QEMU (for building images for other processors)',
    'actions/cache': () => (path === 'save' ? `Saves files to reuse next time${w.path ? ` (${W('path')})` : ''}` : `Reuses saved files${w.path ? ` (${W('path')})` : ''}`),
    'actions/upload-artifact': () => `Saves ${w.path ? W('path') : 'files'}${w.name ? ` as "${W('name')}"` : ''} for later jobs and people to download`,
    'actions/download-artifact': () => `Gets the saved files${w.name ? ` "${W('name')}"` : ''}`,
    'docker/login-action': () => `Signs in to ${w.registry ? W('registry') : 'Docker Hub'}`,
    'docker/build-push-action': () => `${String(w.push) === 'true' ? 'Builds and pushes the image' : hasExpression(w.push) ? 'Builds the image (and pushes it when that is worked out to be true)' : 'Builds the image'}${w.tags && !hasExpression(w.tags) ? ` ${listWords(String(w.tags).split(/[\n,]/).map((t) => t.trim()).filter(Boolean))}` : ''}`,
    'docker/metadata-action': () => "Works out the image's names and labels",
    'azure/login': () => 'Signs in to Azure', 'azure/webapps-deploy': () => `Deploys the app to Azure${w['app-name'] ? ` (${W('app-name')})` : ''}`, 'azure/k8s-deploy': () => 'Deploys to the Kubernetes cluster',
    'azure/arm-deploy': () => 'Deploys an Azure template', 'aws-actions/configure-aws-credentials': () => 'Signs in to AWS', 'aws-actions/amazon-ecr-login': () => 'Signs in to the Amazon image registry',
    'google-github-actions/auth': () => 'Signs in to Google Cloud', 'actions/github-script': () => 'Runs a small script that uses GitHub',
    'softprops/action-gh-release': () => 'Makes a GitHub release', 'actions/create-release': () => 'Makes a GitHub release',
    'github/codeql-action': () => (path === 'init' ? 'Gets the code scanner ready' : path === 'analyze' ? 'Scans the code for security problems' : path === 'upload-sarif' ? 'Uploads security scan results' : path === 'autobuild' ? 'Builds the code for the scanner' : 'Uses the code scanner'),
    'actions/labeler': () => 'Labels pull requests by the files they change', 'actions/stale': () => 'Marks old issues and pull requests as stale',
    'actions/configure-pages': () => 'Gets GitHub Pages ready', 'actions/upload-pages-artifact': () => 'Saves the site for GitHub Pages', 'actions/deploy-pages': () => 'Publishes the site to GitHub Pages',
    'peaceiris/actions-gh-pages': () => 'Publishes the site to GitHub Pages', 'codecov/codecov-action': () => 'Sends test coverage to Codecov',
    'actions/dependency-review-action': () => 'Checks new dependencies for known problems',
  }[key];
  if (known) return known();
  return `Uses ${repo}`;
}

// ── A workflow file ────────────────────────────────────────────────────────────────────────────────────

/**
 * Read a GitHub Actions workflow: jobs as items (kind 'function' with a 'When' route), plus permissions, settings
 * (secrets named only), and facts. Throws on YAML Thunder cannot read, so the file is listed as not read.
 */
export function readWorkflow(src, file = 'workflow.yml') {
  const root = parseYaml(src);
  if (!root || root.t !== 'map' || !get(root, 'jobs')) throw new Error('This is not a GitHub Actions workflow: it has no jobs.');
  const name = text(get(root, 'name'));
  const onEntry = entry(root, 'on') ?? entry(root, 'true');
  const { when, events } = triggerWords(onEntry?.value);
  const evNames = events.map((e) => e.ev);
  const permissions = [], settings = [], facts = [], links = [];
  const fact = (kind, says, line, extra = {}) => facts.push({ id: `${file}#${kind}#${line}`, kind, says, file, line, ...extra });
  const setting = (sname, source, line, secret = source === 'secret' || SECRET_NAME.test(sname)) => { if (!settings.some((x) => x.name === sname && x.source === source)) settings.push({ name: sname, source, secret, file, line, ...(source === 'computed' ? { computed: true } : {}) }); };

  // Settings: inputs given when it starts, secrets and variables it names, and environment values.
  for (const ev of ['workflow_dispatch', 'workflow_call']) {
    const cfg = get(onEntry?.value, ev);
    for (const e of get(cfg, 'inputs')?.entries ?? []) setting(e.key, 'parameter', e.line, false);
    for (const e of get(cfg, 'secrets')?.entries ?? []) setting(e.key, 'secret', e.line, true);
  }
  for (const s of scalars(root)) {
    for (const sec of secretsIn(s.v)) setting(sec, 'secret', s.line, true);
    for (const x of expressionsIn(s.v)) { const m = /^vars\.([\w-]+)$/.exec(x.expr); if (m) setting(m[1], 'variable', s.line, false); }
  }
  const envSettings = (envNode, where) => {
    for (const e of envNode?.t === 'map' ? envNode.entries : []) {
      const v = text(e.value) ?? '';
      const secret = secretsIn(v).length > 0;
      setting(e.key, secret ? 'secret' : hasExpression(v) ? 'computed' : 'literal', e.line, secret || SECRET_NAME.test(e.key));
      if (!secret && !hasExpression(v) && v && SECRET_NAME.test(e.key) && !/^(true|false|\d+)$/i.test(v)) fact('secret-in-plain-env', `${where} sets ${e.key} to a value written in the workflow file, not taken from a secret.`, e.line);
    }
  };
  envSettings(get(root, 'env'), 'The workflow');

  const wfPerm = entry(root, 'permissions');
  if (wfPerm) permissions.push(...permissionsOf(wfPerm.value, 'This workflow', file, wfPerm.line));

  // A pull_request_target or workflow_run trigger runs with the repository's access for code anyone can send.
  const untrusted = evNames.filter((e) => e === 'pull_request_target' || e === 'workflow_run');
  let checksOutHead = null;

  const jobsNode = get(root, 'jobs');
  // A job's own name, unless part of it is worked out when it runs ("Test on Node ${{ matrix.node }}"): then its id.
  const jobLabel = new Map((jobsNode.entries ?? []).map((j) => { const n = text(get(j.value, 'name')); return [j.key, n && !hasExpression(n) ? n : cap(words(j.key))]; }));
  const items = [];
  for (const j of jobsNode.entries ?? []) {
    const job = j.value;
    const label = jobLabel.get(j.key);
    const steps = [];
    const needs = texts(get(job, 'needs'));
    if (needs.length) {
      steps.push({ kind: 'call', says: `After ${listWords(needs.map((n) => `the ${jobLabel.get(n) ?? n} job`))} ${needs.length === 1 ? 'finishes' : 'finish'}`, code: `needs: ${needs.join(', ')}`, line: entry(job, 'needs').line });
      for (const n of needs) { const other = jobsNode.entries.find((x) => x.key === n); if (other) links.push({ from: `${j.key}:${j.line}`, to: `${n}:${other.line}`, kind: 'uses', file, line: entry(job, 'needs').line }); }
    }
    const jp = entry(job, 'permissions');
    if (jp) permissions.push(...permissionsOf(jp.value, `The ${label} job`, file, jp.line));
    envSettings(get(job, 'env'), `The ${label} job`);
    const env = get(job, 'environment');
    const envName = env?.t === 'map' ? text(get(env, 'name')) : text(env);
    const gate = [];
    if (envName) gate.push({ kind: 'call', says: `Deploys to the ${sayExpressions(envName)} environment (it may need someone's approval first)`, code: `environment: ${envName}`, line: entry(job, 'environment').line });
    const runsOn = get(job, 'runs-on');
    const body = [];
    if (runsOn) {
      const ro = runsOn.t === 'str' ? text(runsOn) : runsOn.t === 'seq' ? texts(runsOn).join(', ') : text(get(runsOn, 'group')) ?? 'a chosen computer';
      const roWords = hasExpression(ro) && expressionsIn(ro).length === 1 ? valueWords(expressionsIn(ro)[0].expr) ?? 'a computer worked out when it runs' : sayExpressions(ro);
      body.push({ kind: 'call', says: `Runs on ${roWords}`, code: `runs-on: ${ro}`, line: entry(job, 'runs-on').line });
    }
    const container = get(job, 'container');
    const image = container?.t === 'map' ? text(get(container, 'image')) : text(container);
    if (image) body.push({ kind: 'call', says: `Runs inside the image ${sayExpressions(image)}`, code: `container: ${image}`, line: entry(job, 'container').line });
    for (const sv of get(job, 'services')?.entries ?? []) body.push({ kind: 'call', says: `Starts ${sv.key} alongside it${text(get(sv.value, 'image')) ? ` (the image ${sayExpressions(text(get(sv.value, 'image')))})` : ''}`, code: `services: ${sv.key}`, line: sv.line });
    const reusable = text(get(job, 'uses'));
    if (reusable) {
      const inherit = text(get(job, 'secrets')) === 'inherit';
      body.push({ kind: 'call', says: `Runs the workflow ${reusable}${inherit ? ' (and gives it all of this workflow\'s secrets)' : ''}`, code: `uses: ${reusable}`, line: entry(job, 'uses').line });
    }
    // Steps, with each `if:` asked as a question; neighbours that share a question share one branch.
    const stepNodes = list(get(job, 'steps'));
    let open = null;
    for (const sn of stepNodes) {
      envSettings(get(sn, 'env'), 'A step');
      const got = stepOf(sn, { fact, file, untrusted, onHead: (line) => { checksOutHead ??= line; } });
      const cond = text(get(sn, 'if'));
      if (!cond) { open = null; body.push(...got); continue; }
      const q = conditionQuestion(cond);
      if (q.always) { for (const g of got) g.says += ' (even if an earlier step failed)'; open = null; body.push(...got); continue; }
      if (q.evenAfterFailure) for (const g of got) g.says += ' (even if an earlier step failed)';
      if (open && open.cond === cond) { open.step.children.push(...got); continue; }
      const step = { kind: 'branch', says: q.question, code: `if: ${cond}`, line: entry(sn, 'if').line, children: got };
      open = { cond, step };
      body.push(step);
    }
    // A matrix runs the job once for each combination.
    const matrix = get(get(job, 'strategy'), 'matrix');
    let main = [...gate, ...body];
    if (matrix) {
      const dims = matrix.t === 'map' ? matrix.entries.filter((e) => e.key !== 'include' && e.key !== 'exclude') : [];
      const dimWords = dims.map((d) => `${words(d.key)} (${d.value.t === 'seq' ? listWords(texts(d.value).map(sayExpressions)) : 'worked out when it runs'})`);
      const extra = list(get(matrix, 'include')).length;
      const says = matrix.t !== 'map' ? 'For each combination in the matrix (worked out when it runs)' : dims.length === 1 ? `For each ${dimWords[0]}` : dims.length ? `For each combination of ${listWords(dimWords)}` : 'For each combination it lists';
      main = [{ kind: 'loop', says: `${says}${extra && dims.length ? `, plus ${extra} more` : ''}`, code: 'strategy: matrix', line: entry(get(job, 'strategy'), 'matrix').line, children: body }];
      main = [...gate, ...main];
    }
    const jobIf = text(get(job, 'if'));
    if (jobIf) {
      const q = conditionQuestion(jobIf);
      if (q.always) steps.push(...main.map((m, k) => (k === 0 ? { ...m, says: `${m.says} (even if an earlier job failed)` } : m)));
      else steps.push({ kind: 'branch', says: q.question, code: `if: ${jobIf}`, line: entry(job, 'if').line, children: main });
    } else steps.push(...main);
    if (String(text(get(job, 'continue-on-error'))) === 'true') steps.push({ kind: 'call', says: 'If this job fails, the workflow carries on anyway', code: 'continue-on-error: true', line: entry(job, 'continue-on-error').line });
    const flat = (xs) => xs.flatMap((x) => [x, ...flat(x.children ?? []), ...flat(x.otherwise ?? [])]);
    const all = flat(steps);
    const readable = all.filter((x) => x.kind !== 'other').length;
    const [method, ...rest] = when.split(' ');
    items.push({
      id: `${j.key}:${j.line}`, name: j.key, label, title: when, when, line: j.line, endLine: lastLine(job), route: { method, path: rest.join(' ') },
      inputs: [], returns: null, provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0,
      stepsReadable: all.length ? Math.round((readable / all.length) * 100) / 100 : 0,
      says: `The ${label} job runs ${lc(when)}.`, headline: `${label}: ${lc(when)}.`, guards: [], unread: [],
    });
  }

  for (const p of permissions) if (p.wide) fact('write-all-permissions', `${p.who} has write-all permissions: it can change everything in the repository.`, p.line);
  if (untrusted.length) {
    const secrets = settings.filter((s) => s.source === 'secret' && s.name !== 'GITHUB_TOKEN').map((s) => s.name);
    if (checksOutHead || secrets.length) {
      const why = [checksOutHead && "it gets the pull request's own code", secrets.length && `it uses the secret${secrets.length === 1 ? '' : 's'} ${listWords(secrets)}`].filter(Boolean).join(' and ');
      fact('untrusted-trigger-with-secrets', `It runs on ${untrusted.join(' and ')}, with this repository's access, for changes anyone can send, and ${why}.`, onEntry?.line ?? 1);
    }
  }
  return { items, things: [], permissions, settings, facts, links, purpose: name ?? null };
}

/** One workflow step as Thunder steps. */
function stepOf(sn, ctx) {
  const uses = text(get(sn, 'uses'));
  const runNode = get(sn, 'run');
  const stepName = text(get(sn, 'name'));
  const withNode = get(sn, 'with');
  const w = Object.fromEntries((withNode?.entries ?? []).map((e) => [e.key, text(e.value)]));
  const secrets = [...new Set([...scalars(get(sn, 'env')), ...scalars(withNode), ...scalars(runNode)].flatMap((s) => secretsIn(s.v)))];
  const line = (entry(sn, 'uses') ?? entry(sn, 'run') ?? { line: sn.line }).line;
  let out;
  if (uses) {
    out = [{ kind: 'call', says: actionWords(uses, w), code: `uses: ${uses}`, line }];
    const at = uses.indexOf('@');
    if (!uses.startsWith('./') && !uses.startsWith('docker://') && at > 0 && !/^[0-9a-f]{40}$/.test(uses.slice(at + 1))) {
      const firstParty = /^(actions|github)\//i.test(uses);
      ctx.fact('action-pinned-by-tag', `It uses ${uses.slice(0, at)} by the tag or branch "${uses.slice(at + 1)}", not by a commit, so what runs can change without this file changing.${firstParty ? ' (An action made by GitHub itself.)' : ''}`, line, { firstParty });
    }
    if (/^actions\/checkout@/i.test(uses) && /github\.(event\.pull_request\.head|head_ref|event\.workflow_run\.head)/.test(w.ref ?? '')) ctx.onHead(line);
  } else if (runNode) {
    const firstLine = runNode.block ? runNode.valueLine ?? runNode.line + 1 : runNode.line;
    const inner = shellSteps(String(runNode.v ?? ''), firstLine);
    const say = (xs) => { for (const x of xs) { x.says = sayExpressions(x.says); if (x.children) say(x.children); if (x.otherwise) say(x.otherwise); } };
    say(inner);
    out = stepName && inner.length > 1 ? [{ kind: 'call', says: `${sayExpressions(stepName)}:`, code: `run: (${inner.length} commands)`, line: entry(sn, 'name')?.line ?? line, children: inner }] : inner.length ? inner : [{ kind: 'call', says: 'Runs nothing', code: 'run:', line }];
  } else out = [{ kind: 'other', says: stepName ?? 'A step Thunder cannot read yet', code: stepName ?? 'step', line: sn.line }];
  if (secrets.length) out[0].says += ` (uses the secret${secrets.length === 1 ? '' : 's'} ${listWords(secrets)})`;
  if (String(text(get(sn, 'continue-on-error'))) === 'true') for (const o of out) o.says += ' (a failure here does not stop the job)';
  return out;
}
