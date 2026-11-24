// Words for cloud infrastructure, shared by the Terraform and Bicep readers (spec section 12): resource types in
// words ("azurerm_storage_account" -> "storage account", "Microsoft.Web/sites" -> "web app"), values in words
// ("worked out when it is applied"), well-known Azure roles by name and id, which permissions are wide, and the facts
// both formats can state (public ingress, public storage, secrets written in plain config, encryption turned off).
// Deterministic and browser-safe; no regex here can backtrack.
import { isLiteral, refsIn } from './infra-expr.mjs';
import { listWords, cap } from './infra-words.mjs';

export const APPLIED = 'worked out when it is applied';

const UPPER = new Set(['iam', 'vpc', 's3', 'ec2', 'ecs', 'eks', 'rds', 'sql', 'dns', 'ip', 'nat', 'acm', 'kms', 'sns', 'sqs', 'ssm', 'api', 'cdn', 'aks', 'acr', 'nsg', 'vm', 'lb', 'alb', 'elb', 'waf', 'ssl', 'tls', 'url', 'id', 'arn', 'http', 'https', 'tcp', 'udp', 'cidr', 'ebs', 'efs', 'ecr', 'gke', 'vnet', 'ad', 'ipv4', 'ipv6', 'acl', 'tags', 'ddos', 'oidc', 'saml', 'mssql', 'vpn', 'gcs', 'pubsub', 'ttl', 'cpu', 'gpu', 'dynamodb', 'msk', 'sso']);
const KEEP = { tags: 'tags', dynamodb: 'DynamoDB', pubsub: 'Pub/Sub', mssql: 'SQL Server', ipv4: 'IPv4', ipv6: 'IPv6', vnet: 'virtual network' };
/** snake_case or camelCase in plain words, with well-known short names kept upper case: "vpc_id" -> "VPC id". */
export function words(s) {
  return String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().split(/\s+/)
    .map((w) => { const l = w.toLowerCase(); return KEEP[l] ?? (UPPER.has(l) && l !== 'id' ? l.toUpperCase() : l); }).join(' ');
}

const PROVIDERS = { azurerm: 'Azure', azuread: 'Microsoft Entra ID', azapi: 'Azure', aws: 'AWS', google: 'Google Cloud', 'google-beta': 'Google Cloud', kubernetes: 'Kubernetes', helm: 'Helm', github: 'GitHub', cloudflare: 'Cloudflare', datadog: 'Datadog', random: 'Terraform (random values)', null: 'Terraform', local: 'this computer', tls: 'Terraform (keys and certificates)', time: 'Terraform (time)', vault: 'HashiCorp Vault', docker: 'Docker', archive: 'Terraform (archives)', http: 'the web' };
/** A Terraform provider name in words ("azurerm" -> "Azure"). */
export const providerWords = (p) => PROVIDERS[p] ?? p;

// Terraform types that read better with their own words than with the type name.
const TF_TYPES = {
  azurerm_linux_web_app: 'web app (Linux)', azurerm_windows_web_app: 'web app (Windows)', azurerm_service_plan: 'app service plan',
  azurerm_app_service_plan: 'app service plan', azurerm_linux_function_app: 'function app (Linux)', azurerm_windows_function_app: 'function app (Windows)',
  azurerm_kubernetes_cluster: 'Kubernetes cluster (AKS)', azurerm_mssql_server: 'SQL server', azurerm_mssql_database: 'SQL database',
  azurerm_cosmosdb_account: 'Cosmos DB account', azurerm_application_insights: 'Application Insights', azurerm_log_analytics_workspace: 'Log Analytics workspace',
  azurerm_user_assigned_identity: 'managed identity', azurerm_container_app_environment: 'container apps environment', azurerm_public_ip: 'public IP address',
  aws_instance: 'virtual machine (EC2 instance)', aws_db_instance: 'database (RDS instance)', aws_lb: 'load balancer', aws_alb: 'load balancer',
  aws_iam_role_policy_attachment: 'IAM policy attachment', aws_s3_bucket: 'S3 bucket', aws_eip: 'public IP address (Elastic IP)', aws_vpc: 'VPC',
  google_compute_instance: 'virtual machine (Compute Engine)', google_container_cluster: 'Kubernetes cluster (GKE)', google_sql_database_instance: 'SQL instance',
};
const AZ_TYPES = {
  'microsoft.web/sites': 'web app', 'microsoft.web/serverfarms': 'app service plan', 'microsoft.web/sites/config': 'web app setting',
  'microsoft.resources/resourcegroups': 'resource group', 'microsoft.keyvault/vaults': 'key vault', 'microsoft.keyvault/vaults/secrets': 'key vault secret',
  'microsoft.insights/components': 'Application Insights', 'microsoft.operationalinsights/workspaces': 'Log Analytics workspace',
  'microsoft.containerregistry/registries': 'container registry', 'microsoft.app/containerapps': 'container app', 'microsoft.app/managedenvironments': 'container apps environment',
  'microsoft.documentdb/databaseaccounts': 'Cosmos DB account', 'microsoft.sql/servers': 'SQL server', 'microsoft.sql/servers/databases': 'SQL database',
  'microsoft.network/virtualnetworks': 'virtual network', 'microsoft.network/virtualnetworks/subnets': 'subnet', 'microsoft.network/networksecuritygroups': 'network security group',
  'microsoft.network/publicipaddresses': 'public IP address', 'microsoft.managedidentity/userassignedidentities': 'managed identity',
  'microsoft.authorization/roleassignments': 'role assignment', 'microsoft.authorization/roledefinitions': 'role definition', 'microsoft.storage/storageaccounts': 'storage account',
  'microsoft.storage/storageaccounts/blobservices': 'blob service', 'microsoft.storage/storageaccounts/blobservices/containers': 'blob container',
  'microsoft.cognitiveservices/accounts': 'Azure AI services account', 'microsoft.cognitiveservices/accounts/deployments': 'AI model deployment',
  'microsoft.search/searchservices': 'search service', 'microsoft.containerservice/managedclusters': 'Kubernetes cluster (AKS)',
  'microsoft.dbforpostgresql/flexibleservers': 'PostgreSQL server', 'microsoft.cache/redis': 'Redis cache', 'microsoft.servicebus/namespaces': 'Service Bus namespace',
  'microsoft.eventhub/namespaces': 'Event Hubs namespace', 'microsoft.compute/virtualmachines': 'virtual machine', 'microsoft.network/privateendpoints': 'private endpoint',
  'microsoft.insights/diagnosticsettings': 'diagnostic setting', 'microsoft.web/staticsites': 'static web app', 'microsoft.apimanagement/service': 'API Management service',
};
const singular = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(ss|us)$/.test(w) ? w : /sses$/.test(w) ? w.slice(0, -2) : /s$/.test(w) ? w.slice(0, -1) : w);

/** A resource type in words: Terraform ("aws_s3_bucket" -> "S3 bucket") or Azure ("Microsoft.Web/sites" -> "web app"). */
export function typeWords(type) {
  const t = String(type ?? '');
  if (!t) return 'resource';
  if (t === 'module') return 'module';
  if (/\//.test(t) || /^Microsoft\./i.test(t)) {
    const k = t.toLowerCase();
    if (AZ_TYPES[k]) return AZ_TYPES[k];
    const segs = t.split('/');
    return words(singular(segs.at(-1))).toLowerCase().replace(/\b(ip|sql|dns|vm|api|aks)\b/g, (m) => m.toUpperCase());
  }
  if (TF_TYPES[t]) return TF_TYPES[t];
  const us = t.indexOf('_');
  return words(us > 0 ? t.slice(us + 1) : t);
}

/** "Storage account main", or just "Storage account" when the name only repeats the type. */
export function resourceLabel(type, name) {
  const tw = typeWords(type);
  const nw = words(name).toLowerCase();
  const twl = tw.toLowerCase();
  if (!nw || nw === 'this') return cap(tw);
  if (nw === twl || twl.split(/\s+/).includes(nw) || twl.endsWith(nw)) return cap(tw);
  if (nw.endsWith(twl)) return cap(nw);
  return `${cap(tw)} ${name}`;
}

// ── Roles: well-known Azure roles by id, what they let someone do, and which are wide ──────────────────────────

/** Built-in Azure role ids (checked against the Azure Verified Modules' own tables). */
export const AZURE_ROLES = {
  '8e3af657-a8ff-443c-a75c-2fe8c4bcb635': 'Owner', 'b24988ac-6180-42a0-ab88-20f7382dd24c': 'Contributor', 'acdd72a7-3385-48ef-bd42-f606fba81ae7': 'Reader',
  '18d7d88d-d35e-4fb5-a5c3-7773c20a72d9': 'User Access Administrator', 'f58310d9-a9f6-439a-9e8d-f62e7b41a168': 'Role Based Access Control Administrator',
  '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1': 'Storage Blob Data Reader', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe': 'Storage Blob Data Contributor',
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b': 'Storage Blob Data Owner', 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a': 'Storage Blob Delegator',
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88': 'Storage Queue Data Contributor', '19e7f393-937e-4f77-808e-94535e297925': 'Storage Queue Data Reader',
  'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a': 'Storage Queue Data Message Sender', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3': 'Storage Table Data Contributor',
  '76199698-9eea-4c19-bc75-cec21354c6b6': 'Storage Table Data Reader', '0c867c2a-1d8c-454a-a3db-ab2ea1bdc8bb': 'Storage File Data SMB Share Contributor',
  '17d1049b-9a84-46fb-8f53-869881c3d3ab': 'Storage Account Contributor',
  '4633458b-17de-408a-b874-0445c86b69e6': 'Key Vault Secrets User', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7': 'Key Vault Secrets Officer',
  '00482a5a-887f-4fb3-b363-3b7fe8e74483': 'Key Vault Administrator', '12338af0-0e69-4776-bea7-57ae8d297424': 'Key Vault Crypto User',
  '21090545-7ca7-4776-b22c-e363652d74d2': 'Key Vault Reader', 'e147488a-f6f5-4113-8e2d-b22465e65bf6': 'Key Vault Crypto Service Encryption User',
  'a4417e6f-fecd-4de8-b567-7b0420556985': 'Key Vault Certificates Officer',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d': 'AcrPull', '8311e382-0749-4cb8-b61a-304f252e45ec': 'AcrPush',
  '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd': 'Cognitive Services OpenAI User', 'a001fd3d-188f-4b5d-821b-7da978bf7442': 'Cognitive Services OpenAI Contributor',
  'a97b65f3-24c7-4388-baec-2e87135dc908': 'Cognitive Services User', '3913510d-42f4-4e42-8a64-420c390055eb': 'Monitoring Metrics Publisher',
  '749f88d5-cbae-40b8-bcfc-e573ddc772fa': 'Monitoring Contributor', '92aaf0da-9dab-42b6-94a3-d43ce8d16293': 'Log Analytics Contributor',
  '73c42c96-874c-492b-b04d-ab87d138a893': 'Log Analytics Reader',
  '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39': 'Azure Service Bus Data Sender', '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0': 'Azure Service Bus Data Receiver',
  '2b629674-e913-4c01-ae53-ef4638d8f975': 'Azure Event Hubs Data Sender', 'a638d3c7-ab3a-418d-83e6-5f17a39d4fde': 'Azure Event Hubs Data Receiver',
  'de139f84-1756-47ae-9be6-808fbbe84772': 'Website Contributor', '4d97b98b-1d4f-4787-a291-c67834d212e7': 'Network Contributor',
  '9980e02c-c2be-4d73-94e8-173b1dc7cf3c': 'Virtual Machine Contributor', '6d8ee4ec-f05a-4a1d-8b00-a9b17e38b437': 'SQL Server Contributor',
  '5bd9cd88-fe45-4216-938b-f97437e15450': 'DocumentDB Account Contributor',
  '1407120a-92aa-4202-b7e9-c0e197c71c8f': 'Search Index Data Reader', '8ebe5a00-799e-43f5-93ac-243d3dce84a7': 'Search Index Data Contributor',
  '7ca78c08-252a-4471-8644-bb5ff32d4ba0': 'Search Service Contributor', 'f1a07417-d97a-45cb-824c-7a7467783830': 'Managed Identity Operator',
  'b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b': 'Azure Kubernetes Service RBAC Cluster Admin',
  '516239f1-63e1-4d78-a4de-a74fb236a071': 'App Configuration Data Reader', '5ae67dd6-50cb-40e7-96ff-dc2bfa4b606b': 'App Configuration Data Owner',
};

const ROLE_CAN = {
  Owner: 'do anything, including give others access', Contributor: 'change anything except who has access', Reader: 'read everything',
  'User Access Administrator': 'give anyone access', 'Role Based Access Control Administrator': 'give others access',
};
/** What a role lets someone do, in words: "read blobs (Storage Blob Data Reader)". */
export function roleCan(role) {
  const r = String(role);
  if (ROLE_CAN[r]) return `${ROLE_CAN[r]} (${r})`;
  let m;
  if ((m = /^Storage (Blob|Queue|Table|File) Data (Reader|Contributor|Owner)/.exec(r))) return `${m[2] === 'Reader' ? 'read' : m[2] === 'Owner' ? 'fully control' : 'read and change'} ${m[1].toLowerCase()}s (${r})`;
  if ((m = /^Key Vault (Secrets|Certificates|Crypto|Keys)? ?(User|Officer|Reader|Administrator)/.exec(r))) return `${m[2] === 'User' ? 'use' : m[2] === 'Reader' ? 'read the list of' : 'manage'} ${m[1] ? m[1].toLowerCase() : 'everything'} in the key vault (${r})`;
  if (r === 'AcrPull') return 'pull images (AcrPull)';
  if (r === 'AcrPush') return 'push and pull images (AcrPush)';
  if (/Reader$/.test(r)) return `read (${r})`;
  if (/Sender$/.test(r)) return `send messages (${r})`;
  if (/Receiver$/.test(r)) return `receive messages (${r})`;
  if (/ User$/.test(r)) return `use it (${r})`;
  return `act as ${r}`;
}

/** Roles that can change everything (or give anyone access) where they apply. */
export const WIDE_ROLES = new Set(['Owner', 'Contributor', 'User Access Administrator', 'Role Based Access Control Administrator', 'roles/owner', 'roles/editor', 'roles/resourcemanager.projectIamAdmin', 'roles/iam.securityAdmin']);

/** The role named by an id or name anywhere in a text ("…/roleDefinitions/b24988ac-…" -> "Contributor"). */
export function roleIn(text) {
  const s = String(text ?? '').toLowerCase();
  for (let i = 0; i + 36 <= s.length; i++) {
    if (s[i + 8] !== '-' || s[i + 13] !== '-') continue;
    const g = s.slice(i, i + 36);
    if (AZURE_ROLES[g]) return AZURE_ROLES[g];
  }
  return null;
}

// ── Keys: how a resource names another, and what it says about it ──────────────────────────────────────────────

/** A key with case and separators removed: "allow_blob_public_access" and "allowBlobPublicAccess" are one key. */
export const normKey = (k) => String(k ?? '').toLowerCase().replace(/[_\-.]/g, '');

const RUNS_IN = new Set(['resourcegroupname', 'resourcegroup', 'resourcegroupid', 'serviceplanid', 'appserviceplanid', 'serverfarmid', 'serverid', 'clusterid', 'vpcid', 'subnetid', 'subnetids', 'subnets', 'virtualnetworkname', 'virtualnetworkid', 'parent', 'parentid', 'managedenvironmentid', 'environmentid', 'containerappenvironmentid', 'namespacename', 'namespaceid', 'hostingplanid', 'clustername', 'instanceid', 'dbsubnetgroupname', 'subnet']);
const SENDS_TO = new Set(['loganalyticsworkspaceid', 'workspaceid', 'workspaceresourceid', 'applicationinsightsid', 'appinsightsid', 'topicarn', 'snstopicarn', 'queueurl', 'queuearn', 'destinationarn', 'eventhubname', 'eventhubauthorizationruleid', 'targetarn', 'deadlettertargetarn']);
const CHILD_STORAGE = /(container|share|queue|table|blob|file_system|filesystem)/i;
/** The kind of link a reference makes, from the key it sits under and what it points to. */
export function linkKind(key, { toLookup = false, fromType = '', secretValue = false } = {}) {
  const k = normKey(key);
  if (toLookup || secretValue) return 'reads-from';
  if (RUNS_IN.has(k)) return 'runs-in';
  if ((k === 'storageaccountname' || k === 'storageaccountid' || k === 'keyvaultid' || k === 'servername') && /(container|share|queue|table|blob|secret|key|certificate|database|filesystem|file_system)/i.test(fromType) && CHILD_STORAGE.test(fromType + (k === 'keyvaultid' ? 'container' : ''))) return 'runs-in';
  if (k === 'keyvaultid' && /secret|key|certificate|access_policy/i.test(fromType)) return 'runs-in';
  if (SENDS_TO.has(k) || /endpoint$/.test(k)) return 'sends-to';
  return 'uses';
}

// ── Values in words ──────────────────────────────────────────────────────────────────────────────────────

const short = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lit = (n) => {
  if (n.t === 'str' && !n.template) return short(n.v.replace(/\s+/g, ' ').trim() || '(empty)');
  if (n.t === 'num') return String(n.v);
  if (n.t === 'bool') return n.v ? 'yes' : 'no';
  if (n.t === 'null') return 'nothing (left to its default)';
  if (n.t === 'unary') return `-${n.x.v}`;
  return null;
};

/**
 * A value in words: { text, computed? }. Literals are shown as written; anything else is "worked out when it is
 * applied", naming what it comes from when that is one or a few references. `refWords(ref)` names one reference.
 */
export function valueText(n, refWords, depth = 0) {
  if (!n) return { text: 'nothing' };
  const l = lit(n);
  if (l != null) return { text: l };
  if (n.t === 'list' && isLiteral(n) && n.items.length && n.items.every((x) => x.t === 'obj')) return { text: `${n.items.length} entr${n.items.length === 1 ? 'y' : 'ies'}` };
  if (n.t === 'list' && isLiteral(n)) return { text: n.items.length ? short(listWords(n.items.map((x) => valueText(x, refWords, depth + 1).text)), 120) : 'none' };
  if (n.t === 'obj' && isLiteral(n) && depth >= 2) return { text: n.entries.length ? `${n.entries.length} setting${n.entries.length === 1 ? '' : 's'}` : 'none' };
  if (n.t === 'obj' && isLiteral(n)) {
    if (!n.entries.length) return { text: 'none' };
    const shown = n.entries.slice(0, 4).map((e) => `${words(e.key)}: ${valueText(e.value, refWords, depth + 1).text}`);
    return { text: `${shown.join('; ')}${n.entries.length > 4 ? `; and ${n.entries.length - 4} more` : ''}` };
  }
  if (n.t === 'call' && /^(jsonencode|tolist|toset|tomap)$/.test(n.name) && n.args.length === 1 && isLiteral(n.args[0])) return valueText(n.args[0], refWords, depth);
  if (n.t === 'ref' || (n.t === 'get' && n.obj.t === 'call')) { const w = refWords(n); return { text: w ? `${w} (${APPLIED})` : APPLIED, computed: true, ...(w ? { from: [w] } : {}) }; }
  const from = [...new Set(refsIn(n).map(refWords).filter(Boolean))];
  if (n.t === 'str' && n.template && from.length && from.length <= 3) return { text: `${APPLIED}, from ${listWords(from)}`, computed: true, from };
  if (n.t === 'cond') return { text: `one of two values, ${APPLIED}${from.length && from.length <= 2 ? `, from ${listWords(from)}` : ''}`, computed: true, from };
  if (from.length && from.length <= 2) return { text: `${APPLIED}, from ${listWords(from)}`, computed: true, from };
  return { text: APPLIED, computed: true, from };
}

/** A condition in words, as a question: "Is the setting enabled on?", "Is the setting env prod?". */
export function conditionWords(n, refWords) {
  const say = (x) => { const v = valueText(x, refWords); return v.computed ? (v.from?.length === 1 && x.t === 'ref' ? v.from[0] : v.text) : v.text; };
  const inner = (x) => {
    if (!x) return 'it applies';
    if (x.paren) x = { ...x, paren: false };
    if (x.t === 'ref') return `${say(x)} is on`;
    if (x.t === 'unary' && x.op === '!') return x.x.t === 'ref' ? `${say(x.x)} is off` : `not (${inner(x.x)})`;
    if (x.t === 'bin' && (x.op === '==' || x.op === '=~')) return x.b.t === 'null' ? `${say(x.a)} is not set` : `${say(x.a)} is ${say(x.b)}`;
    if (x.t === 'bin' && (x.op === '!=' || x.op === '!~')) return x.b.t === 'null' ? `${say(x.a)} is set` : `${say(x.a)} is not ${say(x.b)}`;
    if (x.t === 'bin' && x.op === '&&') return `${inner(x.a)} and ${inner(x.b)}`;
    if (x.t === 'bin' && x.op === '||') return `${inner(x.a)} or ${inner(x.b)}`;
    if (x.t === 'bin' && /^[<>]=?$/.test(x.op)) return `${say(x.a)} is ${{ '<': 'less than', '>': 'more than', '<=': 'at most', '>=': 'at least' }[x.op]} ${say(x.b)}`;
    if (x.t === 'call' && x.name === 'length' && x.args.length === 1) return `${say(x.args[0])} has items`;
    if (x.t === 'call' && x.name === 'contains' && x.args.length === 2) return `${say(x.args[0])} includes ${say(x.args[1])}`;
    if (x.t === 'call' && /^(can|try)$/.test(x.name)) return `${say(x.args[0])} can be worked out`;
    if (x.t === 'call' && x.name === 'empty' && x.args.length === 1) return `${say(x.args[0])} is empty`;
    if (x.t === 'bool') return x.v ? 'always' : 'never';
    return `${say(x)} is true`;
  };
  return inner(n);
}

// ── Facts both formats can state ─────────────────────────────────────────────────────────────────────────────

const ANYWHERE = new Set(['0.0.0.0/0', '::/0', '*', 'internet', 'any']);
/** True when a source address list lets anyone on the internet in. */
export const fromAnywhere = (xs) => xs.some((x) => ANYWHERE.has(String(x).trim().toLowerCase()));

/** Ports a rule opens, in words, and whether it opens more than web ports (80 and 443). */
export function portsOpen(from, to, protocol) {
  const proto = String(protocol ?? '').toLowerCase();
  if (proto === '-1' || proto === 'all' || (proto === '*' && from == null)) return { says: 'every port', beyondWeb: true };
  if (proto === 'icmp' || proto === 'icmpv6' || proto === '1') return { says: 'it with ping (ICMP)', beyondWeb: true };
  const f = from == null || from === '*' ? null : Number(String(from).split('-')[0]);
  const t = to == null ? (String(from ?? '').includes('-') ? Number(String(from).split('-')[1]) : f) : Number(to);
  if (f == null || Number.isNaN(f)) return { says: 'every port', beyondWeb: true };
  if ((f === 0 && (t === 0 || t === 65535)) || (f === 1 && t === 65535)) return { says: 'every port', beyondWeb: true };
  const range = f === t ? `port ${f}` : `ports ${f} to ${t}`;
  return { says: range, beyondWeb: !(f === t && (f === 80 || f === 443)) };
}

const PUBLIC_TRUE = new Set(['allowblobpublicaccess', 'allownesteditemstobepublic']);
const PUBLIC_FALSE = new Set(['blockpublicacls', 'blockpublicpolicy', 'ignorepublicacls', 'restrictpublicbuckets']);
const ENCRYPT_FALSE = new Set(['encrypted', 'storageencrypted', 'encryptionenabled', 'enableencryption', 'httpsonly', 'enablehttpstrafficonly', 'httpstrafficonlyenabled', 'supportshttpstrafficonly', 'sslenforcementenabled', 'enforcessl', 'requiressl', 'encryptionatrest', 'kmsencrypted', 'atrestencryptionenabled', 'transitencryptionenabled']);
const ENCRYPT_TRUE = new Set(['enablenonsslport', 'nonsslportenabled', 'allowhttp']);
const PUBLIC_ACL = new Set(['public-read', 'public-read-write', 'authenticated-read', 'website']);

/**
 * Facts from one key and its literal value, wherever it is written: public storage, encryption turned off, a secret
 * written in the file. `say(kind, says)` records one. Returns true when the key was a secret written in the file.
 */
export function keyFacts(key, value, say, where) {
  const k = normKey(key);
  const v = value?.t === 'bool' ? value.v : value?.t === 'str' && !value.template ? value.v : undefined;
  if (v === undefined) return false;
  if (PUBLIC_TRUE.has(k) && v === true) say('storage-public', `${where} allows public, anonymous access to its files (${key} = true).`);
  else if (PUBLIC_FALSE.has(k) && v === false) say('storage-public', `${where} does not block public access (${key} = false).`);
  else if ((k === 'containeraccesstype' || k === 'publicaccess') && typeof v === 'string' && /^(blob|container)$/i.test(v)) say('storage-public', `${where} lets anyone read its ${/^container$/i.test(v) ? 'files and list them' : 'files'} without signing in (${key} = ${v}).`);
  else if (k === 'acl' && typeof v === 'string' && PUBLIC_ACL.has(v.toLowerCase())) say('storage-public', `${where} is readable by ${v.toLowerCase() === 'authenticated-read' ? 'any AWS account' : 'anyone'} (acl = ${v}).`);
  else if (ENCRYPT_FALSE.has(k) && v === false) say('encryption-off', `${where} turns off ${/https|ssl/.test(k) ? 'encrypted connections (HTTPS)' : 'encryption'} (${key} = false).`);
  else if (ENCRYPT_TRUE.has(k) && v === true) say('encryption-off', `${where} allows connections that are not encrypted (${key} = true).`);
  else if ((k === 'mintlsversion' || k === 'minimumtlsversion') && typeof v === 'string' && /1[._]?[01]$/.test(v)) say('encryption-off', `${where} accepts old, weak encryption (${key} = ${v}).`);
  else if (isSecretKey(key) && typeof v === 'string' && v.length > 0 && !/^(true|false|\d+|enabled|disabled|none|null)$/i.test(v)) {
    say('secret-in-plain-config', `${where} has ${key} written in the file, where anyone who can read it sees the value.`);
    return true;
  }
  return false;
}

/** Keys that hold a secret value, by their last word ("admin_password", "clientSecret", "access_key"), not ones that
 * only mention one ("password_enabled", "secret_name", "bypass", "passwordAuth"). */
const SECRET_LAST = new Set(['password', 'passwd', 'pwd', 'secret', 'token', 'credential', 'credentials', 'passphrase', 'sas']);
const KEY_KINDS = new Set(['api', 'access', 'private', 'secret', 'account', 'shared', 'primary', 'secondary', 'master', 'admin', 'signing', 'subscription', 'storage', 'client', 'auth', 'instrumentation']);
export function isSecretKey(key) {
  const w = String(key ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const last = w.at(-1), prev = w.at(-2);
  if (!last) return false;
  if (SECRET_LAST.has(last)) return true;
  if (last === 'key' && KEY_KINDS.has(prev)) return true;
  if (last === 'apikey' || last === 'accesskey' || last === 'secretkey' || last === 'privatekey') return true;
  return last === 'string' && prev === 'connection';
}

/** Every literal key/value under an object node, with its line (nested objects and lists included). */
export function literalEntries(n, path = [], out = []) {
  if (!n) return out;
  if (n.t === 'obj') for (const e of n.entries) { if (e.nested) continue; out.push({ key: e.key, value: e.value, line: e.line, path }); literalEntries(e.value, [...path, e.key], out); }
  else if (n.t === 'list') for (const x of n.items) literalEntries(x, path, out);
  else if (n.t === 'if') literalEntries(n.body, path, out);
  else if (n.t === 'for') literalEntries(n.value, path, out);
  return out;
}

// ── Order of creation ────────────────────────────────────────────────────────────────────────────────────

/** Nodes in an order where each comes after what it relies on; ties and cycles keep the file's order. */
export function topoOrder(allIds, edges) {
  const ids = [...new Set(allIds)];
  const pos = new Map(ids.map((id, i) => [id, i]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map(ids.map((id) => [id, []]));
  const seen = new Set();
  for (const [from, to] of edges) {
    // from relies on to: to comes first.
    if (!pos.has(from) || !pos.has(to) || from === to || seen.has(`${to}>${from}`)) continue;
    seen.add(`${to}>${from}`);
    out.get(to).push(from);
    indeg.set(from, indeg.get(from) + 1);
  }
  const ready = ids.filter((id) => indeg.get(id) === 0);
  const order = [];
  const done = new Set();
  while (order.length < ids.length) {
    if (!ready.length) { const next = ids.find((id) => !done.has(id)); ready.push(next); indeg.set(next, 0); }
    ready.sort((a, b) => pos.get(a) - pos.get(b));
    const id = ready.shift();
    if (done.has(id)) continue;
    done.add(id); order.push(id);
    for (const n of out.get(id)) { indeg.set(n, indeg.get(n) - 1); if (indeg.get(n) === 0 && !done.has(n)) ready.push(n); }
  }
  return order;
}

/** Add a link once per pair: a more exact kind (runs in, reads from, sends to) replaces a plain "uses". */
export function addLink(links, file, from, to, kind, line) {
  if (from === to) return;
  const same = links.find((l) => l.from === from && l.to === to);
  if (!same) { links.push({ from, to, kind, file, line }); return; }
  if (same.kind === 'uses' && kind !== 'uses') { same.kind = kind; same.line = line; }
}

/** "the setting enabled is on" -> "Is the setting enabled on?" */
export function question(c) {
  const s = String(c);
  const i = s.indexOf(' is ');
  if (i > 0 && !/ (and|or) /.test(s.slice(0, i))) return `Is ${s.slice(0, i)} ${s.slice(i + 4)}?`;
  return `Only when ${s}?`;
}

/** The values under a node with the nearest key and line each sits under (objects and lists opened up). */
export function leaves(n, key, line, out = []) {
  if (!n) return out;
  if (n.t === 'obj') { for (const e of n.entries) if (!e.nested) leaves(e.value, e.spread ? key : e.key, e.line, out); }
  else if (n.t === 'list') for (const x of n.items) leaves(x, key, x.line ?? line, out);
  else out.push({ key, value: n, line: n.t === 'str' || n.t === 'ref' ? line : line });
  return out;
}
