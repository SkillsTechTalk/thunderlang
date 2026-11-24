// Well-known command-line tools in plain words, shared by the shell and PowerShell readers: docker, kubectl, helm,
// az, aws, gcloud, git, npm, curl, files and folders, and more. Each phrase says what the command does, never more
// than its arguments show. A command that is not here reads as "Runs <command>" and keeps its code.
//
// Callers pass the command's words as written (`args`, without the command name) and `v(word)`, which says one
// word in plain words: a literal as "quoted text", a variable as its name in words. Browser-safe, no dependencies.

export const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs.at(-1)}`);

/** The value of a flag: `-t x`, `--tag x`, `--tag=x`. Null when absent. */
export function opt(args, names) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const n of names) {
      if (a === n) return args[i + 1] ?? null;
      if (n.startsWith('--') && a.startsWith(`${n}=`)) return a.slice(n.length + 1);
    }
  }
  return null;
}
export const has = (args, ...names) => args.some((a) => names.includes(a) || names.some((n) => n.startsWith('--') && a.startsWith(`${n}=`)) || names.some((n) => /^-[A-Za-z]$/.test(n) && /^-[A-Za-z]{2,}$/.test(a) && a.includes(n[1])));

/** Words that are not flags, skipping the value after each flag in `valued` (flags that take a value). */
export function positional(args, valued = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^--?[A-Za-z]/.test(a)) { if (valued.includes(a)) i++; continue; }
    out.push(a);
  }
  return out;
}

/**
 * A verb phrase as a gerund, for questions: "Builds the image" -> "building the image", "Goes into" -> "going into".
 */
export function gerund(phrase) {
  const m = String(phrase).match(/^(\S+)(.*)$/s);
  if (!m) return String(phrase).toLowerCase();
  const w = m[1].toLowerCase();
  const special = { is: 'being', has: 'having', does: 'doing', goes: 'going', sees: 'seeing', lets: 'letting' };
  let g;
  if (special[w]) g = special[w];
  else if (/ies$/.test(w)) g = `${w.slice(0, -3)}ying`;
  else if (/(?:ss|sh|ch|x|z|o)es$/.test(w)) g = `${w.slice(0, -2)}ing`;
  else if (/s$/.test(w)) {
    let b = w.slice(0, -1);
    if (/[^e]e$/.test(b)) b = b.slice(0, -1);
    else if (/^[^aeiou]*[aeiou][bdgklmnprt]$/.test(b)) b += b.slice(-1);
    g = `${b}ing`;
  } else g = w;
  return g + m[2];
}

// ── Cloud and container tools ─────────────────────────────────────────────────────────────────────────

const VERBS = {
  create: 'Creates', delete: 'Deletes', show: 'Shows', list: 'Lists', update: 'Updates', set: 'Sets', start: 'Starts',
  stop: 'Stops', restart: 'Restarts', deploy: 'Deploys', upload: 'Uploads', download: 'Downloads', add: 'Adds',
  remove: 'Removes', assign: 'Assigns', wait: 'Waits for', purge: 'Purges', import: 'Imports', export: 'Exports',
  describe: 'Looks up', get: 'Gets', put: 'Puts', run: 'Runs', invoke: 'Runs', tag: 'Tags', attach: 'Attaches',
  detach: 'Detaches', register: 'Registers', deregister: 'Removes the registration of', send: 'Sends', publish: 'Publishes',
  receive: 'Receives', copy: 'Copies', modify: 'Changes', enable: 'Turns on', disable: 'Turns off', login: 'Signs in to',
  scale: 'Scales', swap: 'Swaps', build: 'Builds', push: 'Uploads', pull: 'Downloads', install: 'Installs', apply: 'Applies',
  exists: 'Checks whether there is', reset: 'Resets', rotate: 'Rotates', renew: 'Renews', associate: 'Connects', disassociate: 'Disconnects',
};
const plural = (n) => (/(?:s|sh|ch|x)$/.test(n) ? `${n}es` : /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`);
const thePhrase = (verb, noun, name, v) => {
  const V = VERBS[verb] ?? cap(words(verb));
  const many = verb === 'list' && !name;
  const n = many ? plural(noun) : noun;
  return `${V} the ${n}${name ? ` ${v(name)}` : ''}`;
};

const AZ_NOUNS = {
  group: 'resource group', webapp: 'web app', functionapp: 'function app', acr: 'container registry', aks: 'Kubernetes cluster (AKS)',
  vm: 'virtual machine', vmss: 'virtual machine scale set', keyvault: 'key vault', 'keyvault secret': 'key vault secret',
  'storage account': 'storage account', 'storage container': 'storage container', 'storage blob': 'storage file (blob)',
  'sql server': 'SQL server', 'sql db': 'SQL database', cosmosdb: 'Cosmos DB account', 'network vnet': 'virtual network',
  'network nsg': 'network security group', 'network public-ip': 'public IP address', 'appservice plan': 'App Service plan',
  containerapp: 'container app', 'role assignment': 'role assignment', 'ad sp': 'service principal', identity: 'managed identity',
  'deployment group': 'deployment', 'deployment sub': 'subscription deployment', 'monitor log-analytics workspace': 'Log Analytics workspace',
  'staticwebapp': 'static web app', 'apim': 'API Management service', 'servicebus namespace': 'Service Bus namespace', 'eventhubs namespace': 'Event Hubs namespace',
};
function azure(args, v) {
  const groups = [];
  for (const a of args) { if (/^-/.test(a)) break; groups.push(a); }
  if (!groups.length) return null;
  const name = opt(args, ['--name', '-n']);
  const rg = opt(args, ['--resource-group', '-g']);
  const inRg = rg && groups[0] !== 'group' ? ` in the resource group ${v(rg)}` : '';
  const [g0, g1] = groups;
  if (g0 === 'login') return has(args, '--service-principal') ? 'Signs in to Azure as a service principal' : has(args, '--identity') ? 'Signs in to Azure with its managed identity' : 'Signs in to Azure';
  if (g0 === 'logout') return 'Signs out of Azure';
  if (g0 === 'account' && g1 === 'set') return `Switches to the Azure subscription ${v(opt(args, ['--subscription', '-s']) ?? '?')}`;
  if (g0 === 'account' && g1 === 'show') return 'Shows the Azure subscription in use';
  if (g0 === 'acr' && g1 === 'login') return `Signs in to the Azure container registry ${v(name ?? '?')}`;
  if (g0 === 'acr' && g1 === 'build') return `Builds the Docker image ${v(opt(args, ['--image', '-t']) ?? '?')} in the Azure container registry ${v(opt(args, ['--registry', '-r']) ?? '?')}`;
  if (g0 === 'aks' && g1 === 'get-credentials') return `Gets the sign-in details for the Azure Kubernetes cluster ${v(name ?? '?')}${inRg}`;
  if (g0 === 'deployment' && groups.at(-1) === 'create') {
    const file = opt(args, ['--template-file', '-f']);
    return `Deploys ${file ? `${v(file)} ` : ''}to ${rg ? `the Azure resource group ${v(rg)}` : 'Azure'}`;
  }
  if (g0 === 'group') {
    const n = name ?? rg;
    if (g1 === 'exists') return `Checks whether the Azure resource group ${v(n ?? '?')} exists`;
    return `${thePhrase(g1 ?? 'show', 'Azure resource group', n, v)}${g1 === 'create' && opt(args, ['--location', '-l']) ? ` in ${v(opt(args, ['--location', '-l']))}` : ''}`;
  }
  const verb = groups.at(-1);
  const nounKey = groups.slice(0, -1).join(' ');
  const noun = AZ_NOUNS[nounKey] ?? AZ_NOUNS[groups.slice(0, 2).join(' ')] ?? AZ_NOUNS[g0] ?? words(nounKey || g0);
  return `${thePhrase(verb, `Azure ${noun}`, name, v)}${inRg}`;
}

const AWS_SERVICES = { s3: 'Amazon S3', ec2: 'Amazon EC2', ecr: 'Amazon ECR', ecs: 'Amazon ECS', eks: 'Amazon EKS', lambda: 'AWS Lambda', cloudformation: 'AWS CloudFormation', iam: 'AWS IAM', sts: 'AWS', sqs: 'Amazon SQS', sns: 'Amazon SNS', dynamodb: 'Amazon DynamoDB', rds: 'Amazon RDS', ssm: 'AWS Systems Manager', secretsmanager: 'AWS Secrets Manager', logs: 'CloudWatch Logs', route53: 'Amazon Route 53', cloudfront: 'Amazon CloudFront', elbv2: 'load balancer', autoscaling: 'auto scaling' };
function amazon(args, v) {
  const pos = positional(args, ['--region', '--profile', '--output', '--query']);
  const [svc, op] = pos;
  if (!svc) return null;
  if (svc === 'configure') return 'Sets up the AWS command line';
  const S = AWS_SERVICES[svc] ?? `AWS ${svc}`;
  if (svc === 's3' && ['cp', 'mv', 'sync'].includes(op)) return `${{ cp: 'Copies', mv: 'Moves', sync: 'Syncs' }[op]} ${v(pos[2] ?? '?')} to ${v(pos[3] ?? '?')}${has(args, '--recursive') ? ', with everything inside' : ''} (Amazon S3)`;
  if (svc === 's3' && op === 'rm') return `Deletes ${v(pos[2] ?? '?')}${has(args, '--recursive') ? ' and everything inside' : ''} (Amazon S3)`;
  if (svc === 's3' && op === 'ls') return `Lists the files in ${v(pos[2] ?? 'Amazon S3')}`;
  if (svc === 's3' && op === 'mb') return `Makes the Amazon S3 bucket ${v(pos[2] ?? '?')}`;
  if (svc === 'cloudformation' && op === 'deploy') return `Deploys the AWS CloudFormation stack ${v(opt(args, ['--stack-name']) ?? '?')}${opt(args, ['--template-file']) ? ` from ${v(opt(args, ['--template-file']))}` : ''}`;
  if (svc === 'ecr' && op === 'get-login-password') return 'Gets a password for signing in to Amazon ECR';
  if (svc === 'sts' && op === 'get-caller-identity') return 'Gets who AWS sees it as (the caller identity)';
  if (!op) return null;
  const [verb, ...rest] = op.split('-');
  const name = opt(args, ['--stack-name', '--function-name', '--name', '--cluster', '--repository-name', '--bucket', '--table-name', '--queue-url', '--topic-arn', '--secret-id', '--instance-ids', '--service', '--role-name']);
  return thePhrase(verb, `${S} ${rest.join(' ') || 'resource'}`.trim(), name, v);
}

function google(args, v) {
  const pos = positional(args, ['--project', '--region', '--zone', '--image', '--format', '--platform']);
  const [g0, g1, g2] = pos;
  if (g0 === 'auth' && (g1 === 'login' || g1 === 'activate-service-account')) return 'Signs in to Google Cloud';
  if (g0 === 'config' && g1 === 'set' && g2 === 'project') return `Switches to the Google Cloud project ${v(pos[3] ?? '?')}`;
  if (g0 === 'run' && g1 === 'deploy') return `Deploys the Google Cloud Run service ${v(g2 ?? '?')}${opt(args, ['--image']) ? ` from the image ${v(opt(args, ['--image']))}` : ''}`;
  const at = pos.findIndex((p) => VERBS[p] || /^(describe|list|create|delete|update|deploy|get-credentials|submit|ssh)$/.test(p));
  if (at < 1) return null;
  const verb = pos[at];
  if (verb === 'get-credentials') return `Gets the sign-in details for the Google Kubernetes cluster ${v(pos[at + 1] ?? '?')}`;
  if (verb === 'submit') return `Sends a build to Google Cloud Build`;
  return thePhrase(verb, `Google Cloud ${pos.slice(0, at).map(words).join(' ')}`, pos[at + 1], v);
}

const DOCKER_VALUED = ['-p', '--publish', '-e', '--env', '-v', '--volume', '--name', '-w', '--workdir', '--network', '--env-file', '-u', '--user', '--entrypoint', '--platform', '--mount', '-l', '--label', '--restart', '--memory', '-m', '--cpus', '-h', '--hostname', '-f', '--file', '-t', '--tag', '--build-arg', '--target', '--cache-from', '-a', '--add-host', '--pull', '--secret', '--progress', '-c'];
function docker(args, v) {
  let [cmd, ...rest] = args;
  if (cmd === 'buildx' && rest[0] === 'build') { cmd = 'build'; rest = rest.slice(1); }
  if (cmd === 'image' || cmd === 'container') { cmd = rest[0]; rest = rest.slice(1); }
  const pos = positional(rest, DOCKER_VALUED);
  switch (cmd) {
    case 'build': { const tag = opt(rest, ['-t', '--tag']); return tag ? `Builds the Docker image ${v(tag)}${has(rest, '--push') ? ' and uploads it' : ''}` : `Builds a Docker image from ${v(pos.at(-1) ?? '.')}`; }
    case 'push': return `Uploads the Docker image ${v(pos[0] ?? '?')}`;
    case 'pull': return `Downloads the Docker image ${v(pos[0] ?? '?')}`;
    case 'run': return `Runs the Docker image ${v(pos[0] ?? '?')} in a new container${has(rest, '-d', '--detach') ? ', in the background' : ''}${has(rest, '--rm') ? ' (removed when it stops)' : ''}`;
    case 'tag': return `Gives the Docker image ${v(pos[0] ?? '?')} the name ${v(pos[1] ?? '?')}`;
    case 'login': return `Signs in to the Docker registry${pos[0] ? ` ${v(pos[0])}` : ''}`;
    case 'logout': return 'Signs out of the Docker registry';
    case 'exec': return `Runs a command inside the container ${v(pos[0] ?? '?')}`;
    case 'stop': return `Stops the container ${v(pos[0] ?? '?')}`;
    case 'start': return `Starts the container ${v(pos[0] ?? '?')}`;
    case 'restart': return `Restarts the container ${v(pos[0] ?? '?')}`;
    case 'rm': return `Removes the container ${v(pos[0] ?? '?')}`;
    case 'rmi': return `Removes the Docker image ${v(pos[0] ?? '?')}`;
    case 'ps': return 'Lists the running containers';
    case 'images': return 'Lists the Docker images';
    case 'logs': return `Shows what the container ${v(pos[0] ?? '?')} has printed`;
    case 'inspect': return `Looks up the details of ${v(pos[0] ?? '?')}`;
    case 'save': return `Saves the Docker image ${v(pos[0] ?? '?')} to a file`;
    case 'load': return 'Loads a Docker image from a file';
    case 'network': return pos[0] === 'create' ? `Makes the Docker network ${v(pos[1] ?? '?')}` : null;
    case 'volume': return pos[0] === 'create' ? `Makes the Docker volume ${v(pos[1] ?? '?')}` : null;
    case 'system': return pos[0] === 'prune' ? 'Clears out unused Docker data' : null;
    case 'compose': return compose(rest, v);
    default: return null;
  }
}
function compose(args, v) {
  const pos = positional(args, ['-f', '--file', '-p', '--project-name', '--profile', '--env-file']);
  const svc = pos.slice(1).filter((p) => !/^-/.test(p));
  const which = svc.length ? `the service${svc.length > 1 ? 's' : ''} ${list(svc.map(v))}` : 'the services';
  switch (pos[0]) {
    case 'up': return `Starts ${which} in Docker Compose${has(args, '-d', '--detach') ? ', in the background' : ''}`;
    case 'down': return 'Stops and removes the Docker Compose services';
    case 'build': return `Builds ${which} in Docker Compose`;
    case 'pull': return `Downloads the images for ${which}`;
    case 'run': return `Runs a one-off command in the service ${v(svc[0] ?? '?')}`;
    case 'exec': return `Runs a command inside the service ${v(svc[0] ?? '?')}`;
    case 'logs': return `Shows what ${which} have printed`;
    case 'restart': return `Restarts ${which}`;
    case 'stop': return `Stops ${which}`;
    case 'ps': return 'Lists the Docker Compose services';
    default: return null;
  }
}

const K8S_KINDS = { deploy: 'deployment', deployment: 'deployment', deployments: 'deployment', po: 'pod', pod: 'pod', pods: 'pod', svc: 'service', service: 'service', ns: 'namespace', namespace: 'namespace', sts: 'stateful set', statefulset: 'stateful set', ds: 'daemon set', daemonset: 'daemon set', cm: 'config map', configmap: 'config map', secret: 'secret', job: 'job', cronjob: 'scheduled job', ing: 'ingress', ingress: 'ingress', node: 'node', nodes: 'node', pvc: 'storage claim' };
const k8sTarget = (pos, v) => {
  const t = pos[0];
  if (!t) return 'the Kubernetes resources';
  const slash = String(t).match(/^([a-z]+)\/(.+)$/);
  if (slash) return `the Kubernetes ${K8S_KINDS[slash[1]] ?? slash[1]} ${v(slash[2])}`;
  if (K8S_KINDS[t]) return pos[1] ? `the Kubernetes ${K8S_KINDS[t]} ${v(pos[1])}` : `the Kubernetes ${plural(K8S_KINDS[t])}`;
  return `the Kubernetes resource ${v(t)}`;
};
function kubectl(args, v) {
  const KV = ['-n', '--namespace', '-f', '--filename', '-k', '-l', '--selector', '-o', '--output', '--context', '--timeout', '-c', '--container', '--replicas', '--for', '--type', '-p', '--patch', '--image'];
  const ns = opt(args, ['-n', '--namespace']);
  const inNs = ns ? ` in the namespace ${v(ns)}` : '';
  const [verb, ...rest] = positional(args, KV);
  const file = opt(args, ['-f', '--filename']) ?? opt(args, ['-k']);
  switch (verb) {
    case 'apply': return `Applies the Kubernetes settings in ${v(file ?? '?')}${inNs}`;
    case 'create': return rest[0] === 'namespace' || rest[0] === 'ns' ? `Makes the Kubernetes namespace ${v(rest[1] ?? '?')}` : file ? `Creates the Kubernetes resources in ${v(file)}${inNs}` : `Creates ${k8sTarget(rest, v)}${inNs}`;
    case 'delete': return file ? `Deletes the Kubernetes resources in ${v(file)}${inNs}` : `Deletes ${k8sTarget(rest, v)}${inNs}`;
    case 'get': return `Lists ${k8sTarget(rest, v)}${inNs}`;
    case 'describe': return `Looks up the details of ${k8sTarget(rest, v)}${inNs}`;
    case 'logs': return `Shows what ${k8sTarget(rest, v)} has printed${inNs}`;
    case 'exec': return `Runs a command inside ${k8sTarget(rest, v)}${inNs}`;
    case 'port-forward': return `Connects a local port to ${k8sTarget(rest, v)}${inNs}`;
    case 'wait': return `Waits until ${k8sTarget(rest, v)} is ${String(opt(args, ['--for']) ?? 'ready').replace(/^condition=/, '').toLowerCase()}${inNs}`;
    case 'scale': return `Scales ${k8sTarget(rest, v)} to ${v(opt(args, ['--replicas']) ?? '?')} copies${inNs}`;
    case 'rollout': {
      const [sub, ...t] = rest;
      const what = k8sTarget(t, v);
      if (sub === 'status') return `Waits until ${what} has finished rolling out${inNs}`;
      if (sub === 'restart') return `Restarts ${what}${inNs}`;
      if (sub === 'undo') return `Rolls ${what} back to its previous version${inNs}`;
      if (sub === 'history') return `Lists the versions of ${what}${inNs}`;
      return null;
    }
    case 'set': return rest[0] === 'image' ? `Changes the image used by ${k8sTarget(rest.slice(1), v)}${inNs}` : null;
    case 'config': return rest[0] === 'use-context' ? `Switches to the Kubernetes cluster ${v(rest[1] ?? '?')}` : rest[0] === 'set-context' ? 'Changes the Kubernetes cluster settings' : null;
    case 'label': return `Labels ${k8sTarget(rest, v)}${inNs}`;
    case 'annotate': return `Adds a note to ${k8sTarget(rest, v)}${inNs}`;
    case 'patch': return `Changes part of ${k8sTarget(rest, v)}${inNs}`;
    case 'cluster-info': return 'Shows which Kubernetes cluster it is connected to';
    default: return null;
  }
}

function helm(args, v) {
  const ns = opt(args, ['-n', '--namespace']);
  const inNs = ns ? ` in the namespace ${v(ns)}` : '';
  const [verb, ...pos] = positional(args, ['-n', '--namespace', '-f', '--values', '--set', '--set-string', '--version', '--timeout', '--kube-context', '-o', '--output', '--repo']);
  switch (verb) {
    case 'upgrade': return `${has(args, '--install', '-i') ? 'Installs or upgrades' : 'Upgrades'} the Helm release ${v(pos[0] ?? '?')}${pos[1] ? ` from the chart ${v(pos[1])}` : ''}${inNs}`;
    case 'install': return `Installs the Helm release ${v(pos[0] ?? '?')}${pos[1] ? ` from the chart ${v(pos[1])}` : ''}${inNs}`;
    case 'uninstall': case 'delete': return `Removes the Helm release ${v(pos[0] ?? '?')}${inNs}`;
    case 'rollback': return `Rolls the Helm release ${v(pos[0] ?? '?')} back${pos[1] ? ` to version ${v(pos[1])}` : ''}${inNs}`;
    case 'repo': return pos[0] === 'add' ? `Adds the Helm chart repository ${v(pos[1] ?? '?')}${pos[2] ? ` (${v(pos[2])})` : ''}` : pos[0] === 'update' ? 'Updates the list of Helm charts' : null;
    case 'dependency': case 'dep': return 'Gets the charts this chart needs';
    case 'template': return `Fills in the Helm chart ${v(pos[1] ?? pos[0] ?? '?')} without installing it`;
    case 'lint': return `Checks the Helm chart ${v(pos[0] ?? '.')} for mistakes`;
    case 'package': return `Packs the Helm chart ${v(pos[0] ?? '.')} into a file`;
    case 'list': case 'ls': return `Lists the Helm releases${inNs}`;
    default: return null;
  }
}

function git(args, v) {
  const [verb, ...rest] = args.filter((a, i) => !(i === 0 && a === '-C'));
  const pos = positional(rest, ['-m', '--message', '-b', '-B', '--branch', '--depth', '-o', '--format', '-c']);
  switch (verb) {
    case 'clone': return `Copies the Git repository ${v(pos[0] ?? '?')}${pos[1] ? ` into ${v(pos[1])}` : ''}`;
    case 'push': return has(rest, '--tags') ? 'Uploads the version tags' : pos.length >= 2 ? `Uploads ${v(pos[1])} to ${v(pos[0])}` : pos[0] ? `Uploads the commits to ${v(pos[0])}` : 'Uploads the commits';
    case 'pull': return 'Downloads and merges the latest changes';
    case 'fetch': return 'Downloads the latest changes, without merging them';
    case 'tag': return pos[0] ? (has(rest, '-d', '--delete') ? `Removes the version tag ${v(pos[0])}` : `Tags this version as ${v(pos[0])}`) : 'Lists the version tags';
    case 'checkout': case 'switch': return opt(rest, ['-b', '-B']) ? `Makes and switches to the branch ${v(opt(rest, ['-b', '-B']))}` : `Switches to ${v(pos[0] ?? '?')}`;
    case 'commit': { const msg = opt(rest, ['-m', '--message']); return msg ? `Saves a commit: ${v(msg)}` : 'Saves a commit'; }
    case 'add': return has(rest, '-A', '--all') || pos[0] === '.' ? 'Marks every change to be committed' : `Marks ${list(pos.map(v))} to be committed`;
    case 'merge': return `Merges ${v(pos[0] ?? '?')} into this branch`;
    case 'rebase': return `Replays this branch on top of ${v(pos[0] ?? '?')}`;
    case 'reset': return has(rest, '--hard') ? `Throws away local changes and goes back to ${v(pos[0] ?? 'the last commit')}` : 'Unmarks changes';
    case 'status': return 'Shows what has changed';
    case 'diff': return 'Shows the changes';
    case 'log': return 'Shows the history';
    case 'init': return 'Starts a new Git repository';
    case 'stash': return pos[0] === 'pop' ? 'Brings back the set-aside changes' : 'Sets the changes aside for later';
    case 'remote': return pos[0] === 'add' ? `Adds the remote ${v(pos[1] ?? '?')} (${v(pos[2] ?? '?')})` : null;
    case 'submodule': return 'Gets the repositories this one includes (submodules)';
    // `git config name` reads the setting; only `git config name value` sets it.
    case 'config': return pos[1] ? `Sets the Git setting ${v(pos[0])} to ${v(pos[1])}` : pos[0] ? `Reads the Git setting ${v(pos[0])}` : null;
    case 'rev-parse': return has(rest, '--show-toplevel') ? 'Finds the top folder of the repository' : 'Looks up the commit id';
    case 'describe': return 'Looks up the latest version tag';
    case 'branch': return pos[0] ? `Makes the branch ${v(pos[0])}` : 'Lists the branches';
    default: return null;
  }
}

function npmLike(tool, args, v) {
  const [verb, ...rest] = args;
  const pos = positional(rest, ['--prefix', '-w', '--workspace', '--registry', '--tag']);
  const pkgs = pos.length ? ` ${list(pos.map(v))}` : '';
  switch (verb) {
    case 'ci': return 'Installs the exact package versions in the lock file';
    case undefined: return tool === 'yarn' ? 'Installs the packages' : null;
    case 'install': case 'i': case 'add': return pkgs ? `Installs the package${pos.length > 1 ? 's' : ''}${pkgs}` : 'Installs the packages';
    case 'run': case 'run-script': return `Runs the ${tool} script ${v(pos[0] ?? '?')}`;
    case 'test': case 't': return 'Runs the tests';
    case 'start': return 'Starts the app';
    case 'build': return 'Builds the app';
    case 'publish': return `Publishes the package to ${tool === 'npm' ? 'npm' : 'the registry'}`;
    case 'uninstall': case 'remove': case 'rm': return `Removes the package${pkgs}`;
    case 'version': return `Sets the package version${pos[0] ? ` to ${v(pos[0])}` : ''}`;
    default: return tool === 'npm' ? null : `Runs the ${tool} script ${v(verb)}`;
  }
}

// ── Files, text, and everyday tools ───────────────────────────────────────────────────────────────────

function curl(args, v) {
  if (has(args, '--version', '-V')) return 'Shows the version of curl';
  // The address: a word with :// in it, else the first word that is not a flag or a flag's value.
  const url = args.find((a) => /:\/\//.test(a) && !/^-/.test(a)) ?? positional(args, ['-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '-o', '--output', '-u', '--user', '-F', '--form', '--json', '-A', '--user-agent', '-w', '--write-out', '--retry', '-m', '--max-time', '--connect-timeout', '-e', '--cert', '--key', '-T'])[0];
  const sends = opt(args, ['-d', '--data', '--data-raw', '--data-binary', '-F', '--form', '--json', '--data-urlencode']) != null;
  const method = String(opt(args, ['-X', '--request']) ?? (has(args, '-T', '--upload-file') ? 'PUT' : sends ? 'POST' : has(args, '-I', '--head') ? 'HEAD' : 'GET')).replace(/^["']|["']$/g, '').toUpperCase();
  const out = opt(args, ['-o', '--output']);
  return `Sends a ${method} request to ${v(url ?? '?')}${out ? ` and saves the answer to ${v(out)}` : has(args, '-O', '--remote-name') ? ' and saves the file' : ''}`;
}

const FILE = (verb) => (args, v) => { const p = positional(args); return p.length ? `${verb} ${list(p.map(v))}` : null; };

/** head / tail's line count: -n 5, -n5, -5, --lines=5; 10 when none is given (their default). */
function lineCount(args, v) {
  const n = opt(args, ['-n', '--lines']) ?? args.map((a) => a.match(/^-n?(\d+)$/)?.[1]).find(Boolean);
  return n != null ? v(n) : args.some((a) => /^-[a-z]*[cn]/.test(a)) ? '(some)' : '10';
}

/** One command (name and its words) in plain words, or null when it is not a well-known command. */
export function sayCommand(name, args, v) {
  const n = String(name).replace(/^.*\//, '');
  const p = () => positional(args);
  switch (n) {
    case 'docker': return docker(args, v);
    case 'docker-compose': return compose(args, v);
    case 'podman': return docker(args, v)?.replace(/Docker/g, 'container') ?? null;
    case 'kubectl': case 'oc': return kubectl(args, v);
    case 'helm': return helm(args, v);
    case 'az': return azure(args, v);
    case 'aws': return amazon(args, v);
    case 'gcloud': return google(args, v);
    case 'gsutil': return args[0] === 'cp' ? `Copies ${v(p()[1] ?? '?')} to ${v(p()[2] ?? '?')} (Google Cloud Storage)` : null;
    case 'git': return git(args, v);
    case 'npm': case 'yarn': case 'pnpm': case 'bun': return npmLike(n, args, v);
    case 'npx': return `Runs the tool ${v(p()[0] ?? '?')}`;
    case 'pip': case 'pip3': {
      if (args[0] !== 'install') return null;
      const req = opt(args, ['-r', '--requirement']);
      return req ? `Installs the Python packages listed in ${v(req)}` : `Installs the Python package${p().length > 2 ? 's' : ''} ${list(p().slice(1).map(v))}`;
    }
    case 'python': case 'python3': return args[0] === '-m' ? `Runs the Python module ${v(args[1] ?? '?')}` : p()[0] ? `Runs the Python program ${v(p()[0])}` : null;
    case 'node': return p()[0] ? `Runs the JavaScript program ${v(p()[0])}` : null;
    case 'ruby': return p()[0] ? `Runs the Ruby program ${v(p()[0])}` : null;
    case 'Rscript': return p()[0] ? `Runs the R program ${v(p()[0])}` : null;
    case 'go': return { build: 'Builds the Go program', test: 'Runs the Go tests', run: 'Runs the Go program', mod: 'Updates the Go modules', install: 'Installs the Go program', vet: 'Checks the Go code for mistakes' }[args[0]] ?? null;
    case 'cargo': return { build: 'Builds the Rust program', test: 'Runs the Rust tests', run: 'Runs the Rust program', publish: 'Publishes the Rust crate', fmt: 'Formats the Rust code', clippy: 'Checks the Rust code for mistakes' }[args[0]] ?? null;
    case 'dotnet': return { build: 'Builds the .NET project', test: 'Runs the .NET tests', run: 'Runs the .NET program', restore: 'Downloads the .NET packages', publish: 'Packs the .NET app for release', pack: 'Packs the .NET library' }[args[0]] ?? null;
    case 'mvn': case 'mvnw': case './mvnw': return `Runs Maven (${list(p().map(v)) || 'the default build'})`;
    case 'gradle': case 'gradlew': case './gradlew': return `Runs Gradle (${list(p().map(v)) || 'the default build'})`;
    case 'make': return p().length ? `Runs the make target${p().length > 1 ? 's' : ''} ${list(p().map(v))}` : 'Runs make (the default target)';
    case 'terraform': case 'tofu': return { init: 'Sets up Terraform', plan: 'Works out what Terraform would change', apply: 'Applies the Terraform changes', destroy: 'Deletes everything Terraform made', validate: 'Checks the Terraform files for mistakes', fmt: 'Formats the Terraform files', output: 'Reads the Terraform outputs', import: 'Brings an existing resource under Terraform' }[args[0]] ?? (args[0] === 'workspace' ? `Switches to the Terraform workspace ${v(args[2] ?? '?')}` : null);
    case 'ansible-playbook': return `Runs the Ansible playbook ${v(p()[0] ?? '?')}`;
    case 'ssh': return p().length > 1 ? `Runs a command on ${v(p()[0])} over SSH` : `Connects to ${v(p()[0] ?? '?')} over SSH`;
    case 'scp': return `Copies ${v(p()[0] ?? '?')} to ${v(p()[1] ?? '?')} over SSH`;
    case 'rsync': return `Copies ${v(p()[0] ?? '?')} to ${v(p()[1] ?? '?')}, sending only what changed`;
    case 'curl': return curl(args, v);
    case 'wget': {
      if (has(args, '--version', '-V')) return 'Shows the version of wget';
      const url = args.find((a) => /:\/\//.test(a) && !/^-/.test(a)) ?? positional(args, ['-O', '-o', '-P', '--output-document', '-T', '--timeout', '-t', '--tries', '-U', '--user-agent', '--header', '-e'])[0];
      if (!url) return null;
      const to = opt(args, ['-O', '--output-document']);
      return `Downloads ${v(url)}${to === '-' ? ' and prints it' : to ? ` and saves it as ${v(to)}` : ''}`;
    }
    case 'tar': {
      const f = opt(args, ['-f', '--file']) ?? (args[0] && /^-?[a-z]*f[a-z]*$/.test(args[0]) && !args[0].startsWith('--') ? args[1] : null);
      const mode = args[0] ?? '';
      if (/x/.test(mode)) return `Unpacks ${v(f ?? '?')}${opt(args, ['-C']) ? ` into ${v(opt(args, ['-C']))}` : ''}`;
      if (/c/.test(mode)) return `Packs ${list(p().slice(f ? 1 : 0).map(v)) || 'the files'} into ${v(f ?? '?')}`;
      return null;
    }
    case 'unzip': return `Unpacks ${v(p()[0] ?? '?')}`;
    case 'zip': return `Packs ${list(p().slice(1).map(v)) || 'the files'} into ${v(p()[0] ?? '?')}`;
    case 'mkdir': return `Makes the folder${p().length > 1 ? 's' : ''} ${list(p().map(v))}${has(args, '-p', '--parents') ? ' (and any missing parent folders)' : ''}`;
    case 'rmdir': return `Removes the empty folder ${v(p()[0] ?? '?')}`;
    case 'rm': {
      const what = list(p().map(v));
      return has(args, '-r', '-R', '--recursive') ? `Deletes ${what} and everything in it${has(args, '-f', '--force') ? ', without asking' : ''}` : `Deletes ${what}`;
    }
    case 'cp': return `Copies ${list(p().slice(0, -1).map(v))} to ${v(p().at(-1) ?? '?')}${has(args, '-r', '-R', '-a', '--recursive') ? ', with everything inside' : ''}`;
    case 'mv': return `Moves ${list(p().slice(0, -1).map(v))} to ${v(p().at(-1) ?? '?')}`;
    case 'ln': return has(args, '-s', '--symbolic') ? `Makes ${v(p()[1] ?? '?')} a link to ${v(p()[0] ?? '?')}` : `Makes ${v(p()[1] ?? '?')} another name for ${v(p()[0] ?? '?')}`;
    case 'touch': return `Makes the file ${list(p().map(v))} (or updates its time)`;
    case 'chmod': return /\+x|^[0-7]*[157]$/.test(p()[0] ?? '') ? `Lets ${list(p().slice(1).map(v))} run as a program` : `Changes who may use ${list(p().slice(1).map(v))}`;
    case 'chown': return `Changes the owner of ${list(p().slice(1).map(v))} to ${v(p()[0] ?? '?')}`;
    case 'cat': return p().length ? `Shows ${list(p().map(v))}` : null;
    case 'ls': return `Lists the files in ${v(p()[0] ?? '.')}`;
    case 'pwd': return 'Shows the current folder';
    case 'cd': return p()[0] === '-' ? 'Goes back to the previous folder' : p()[0] ? `Goes into the folder ${v(p()[0])}` : 'Goes to the home folder';
    case 'pushd': return `Goes into the folder ${v(p()[0] ?? '?')}, remembering where it was`;
    case 'popd': return 'Goes back to the folder it was in before';
    case 'grep': case 'egrep': case 'rg': {
      const files = positional(args, ['-e', '-f', '-m', '-A', '-B', '-C', '--include', '--exclude']);
      const pat = opt(args, ['-e']) ?? files.shift();
      return `Finds the lines${has(args, '-v', '--invert-match') ? ' not' : ''} matching ${v(pat ?? '?')}${files.length ? ` in ${list(files.map(v))}` : ''}`;
    }
    case 'sed': return has(args, '-i') ? `Edits ${list(positional(args, ['-e', '-f']).slice(opt(args, ['-e']) ? 0 : 1).map(v)) || 'the file'} in place` : 'Changes the text';
    case 'awk': case 'gawk': return 'Picks out and rearranges parts of the text';
    case 'find': {
      // Tests Thunder does not put into words (`!`, -o, -prune, -links, -exec …) are shown as code, never dropped.
      const tests = args.slice(1);
      if (tests.some((a) => !/^(?:-name|-iname|-type|-maxdepth|-mindepth|-delete|-print)$/.test(a) && /^[-!(]/.test(a) && a !== '-L')) return `Finds the files in ${v(p()[0] ?? '.')} that match \`${tests.join(' ')}\``;
      return `Finds the ${{ d: 'folders', f: 'files', l: 'links' }[opt(args, ['-type'])] ?? 'files'} in ${v(p()[0] ?? '.')}${opt(args, ['-name', '-iname']) ? ` named ${v(opt(args, ['-name', '-iname']))}` : ''}${has(args, '-delete') ? ', and deletes them' : ''}`;
    }
    case 'sort': return 'Sorts the lines';
    case 'uniq': return 'Removes repeated lines';
    case 'wc': return has(args, '-l') ? 'Counts the lines' : 'Counts the words';
    case 'head': return `Takes the first ${lineCount(args, v)} lines`;
    case 'tail': return has(args, '-f') ? `Shows the end of ${v(p()[0] ?? '?')} as it grows` : `Takes the last ${lineCount(args, v)} lines`;
    case 'cut': return 'Takes out part of each line';
    case 'tr': return 'Changes characters in the text';
    case 'tee': return `Writes it to ${list(p().map(v))} too`;
    case 'xargs': return p()[0] ? `Runs ${v(p()[0])} with each of them` : 'Runs a command with each of them';
    case 'jq': return `Reads ${v(p()[0] ?? '?')} from the JSON`;
    case 'yq': return `Reads ${v(p()[0] ?? '?')} from the YAML`;
    case 'envsubst': return 'Fills in the settings in the text';
    case 'base64': return has(args, '-d', '--decode', '-D') ? 'Decodes the text from base64' : 'Encodes the text as base64';
    case 'openssl': return `Uses OpenSSL (${v(args[0] ?? '?')})`;
    case 'date': return 'Gets the date and time';
    case 'sleep': return `Waits ${v(p()[0] ?? '?')} second${p()[0] === '1' ? '' : 's'}`;
    case 'wait': return 'Waits for the background commands to finish';
    case 'kill': return `Stops the process ${v(p()[0] ?? '?')}`;
    case 'pkill': case 'killall': return `Stops the processes named ${v(p()[0] ?? '?')}`;
    case 'systemctl': return p()[0] && p()[1] ? `${{ start: 'Starts', stop: 'Stops', restart: 'Restarts', reload: 'Reloads', enable: 'Turns on', disable: 'Turns off', status: 'Shows the state of' }[p()[0]] ?? cap(words(p()[0]))} the service ${v(p()[1])}` : null;
    case 'service': return p()[1] ? `${{ start: 'Starts', stop: 'Stops', restart: 'Restarts', reload: 'Reloads', status: 'Shows the state of' }[p()[1]] ?? cap(words(p()[1]))} the service ${v(p()[0])}` : null;
    case 'apt-get': case 'apt': case 'yum': case 'dnf': case 'apk': case 'brew': case 'choco': case 'winget': case 'snap': {
      const verb = p()[0];
      // The value after -s / --source (and a --version written apart from its value) is not a package.
      const pkgs = positional(args, ['-s', '--source', '--version']).slice(1);
      if (verb === 'install' || verb === 'add') return `Installs ${pkgs.length ? list(pkgs.map(v)) : 'the packages'} (${n})`;
      if (verb === 'update') return `Updates the list of packages (${n})`;
      if (verb === 'upgrade') return `Upgrades the installed packages (${n})`;
      if (verb === 'remove' || verb === 'uninstall' || verb === 'del') return `Removes ${list(pkgs.map(v))} (${n})`;
      return null;
    }
    case 'useradd': case 'adduser': return `Adds the user ${v(p().at(-1) ?? '?')}`;
    case 'logger': return 'Writes to the system log';
    case 'crontab': return 'Changes the scheduled jobs';
    case 'clear': return 'Clears the screen';
    default: return null;
  }
}

/** A path or file argument that names a script: "./build.sh" -> "Runs the script ./build.sh". */
export const scriptPath = (name) => /(?:^\.{0,2}\/|\.(?:sh|bash|ps1|py|rb|pl|js|R)$)/.test(String(name));

export { list as listWords, FILE };
