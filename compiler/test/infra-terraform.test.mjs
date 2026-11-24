// Terraform in Thunder (spec section 12): resources and what they know, links, the order things are created,
// permissions (wide ones called wide), settings (secrets only named), and facts, with their lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode, detectLanguage } from '../src/read.mjs';
import { readableFile } from '../src/read-repo.mjs';
import { readTerraform } from '../src/infra-terraform.mjs';
import { thunderModel, readLevel, modelText } from '../src/model.mjs';
import { visualFor } from '../src/visual.mjs';

const azure = readFileSync(new URL('./fixtures/infra/main.tf', import.meta.url), 'utf8');
const aws = readFileSync(new URL('./fixtures/infra/aws.tf', import.meta.url), 'utf8');
const says = (steps) => steps.map((s) => (s.children ? [s.says, says(s.children)] : s.says));
const thing = (r, address) => r.things.find((t) => t.address === address);
const knows = (t) => Object.fromEntries(t.knows.map((k) => [k.label, k.kind]));

test('.tf files are read as Terraform; pasted Terraform is recognized; .terraform folders are skipped', () => {
  for (const p of ['main.tf', 'infra/network/vpc.tf']) assert.equal(readableFile(p), 'terraform', p);
  assert.equal(readableFile('.terraform/modules/x/main.tf'), null);
  assert.equal(readableFile('terraform.tfvars'), null);
  assert.equal(detectLanguage(azure), 'terraform');
  assert.equal(readCode(aws, { language: 'tf' }).language, 'terraform');
});

test('each resource is a Resource with its type as written, its address, and what it knows in words', () => {
  const r = readTerraform(azure, 'main.tf');
  const st = thing(r, 'azurerm_storage_account.main');
  assert.deepEqual([st.kind, st.resourceType, st.label, st.lines], ['resource', 'azurerm_storage_account', 'Storage account main', [60, 68]]);
  assert.deepEqual(knows(st), {
    Name: 'worked out when it is applied, from the setting prefix',
    'Resource group name': 'the name of the resource group rg (worked out when it is applied)',
    Location: 'the location of the resource group rg (worked out when it is applied)',
    'Account tier': 'Standard',
    'Account replication type': 'GRS',
    'Allow nested items to be public': 'yes',
    'Min TLS version': 'TLS1_2',
  });
  assert.ok(st.knows.find((k) => k.label === 'Location').computed);
  assert.equal(st.knows.find((k) => k.label === 'Account tier').computed, undefined);
  const rg = thing(r, 'azurerm_resource_group.rg');
  assert.equal(rg.doc, 'Everything for the web app lives here.');
  assert.equal(knows(rg).Protected, 'Terraform refuses to destroy it (prevent_destroy)');
  const web = thing(r, 'azurerm_linux_web_app.web');
  assert.equal(knows(web)['Site config'], 'always on: yes; application stack (node version: 20-lts)');
  // Data sources are looked up, not made.
  const sub = thing(r, 'data.azurerm_subscription.current');
  assert.equal(sub.existing, true);
  assert.match(knows(sub)['Looks up'], /made elsewhere/);
  // Conditional count reads as "only when".
  assert.equal(knows(thing(r, 'azurerm_application_insights.insights'))['How many'], 'one, only when the setting enable_insights is on');
});

test('references and depends_on are links with their kind and line; a more exact kind wins over "uses"', () => {
  const r = readTerraform(azure, 'main.tf');
  const has = (from, kind, to, line) => assert.ok(r.links.some((l) => l.from === from && l.kind === kind && l.to === to && (line == null || l.line === line)), `${from} ${kind} ${to}`);
  has('azurerm_storage_account.main', 'runs-in', 'azurerm_resource_group.rg', 62);
  has('azurerm_storage_container.uploads', 'runs-in', 'azurerm_storage_account.main', 72);
  has('azurerm_linux_web_app.web', 'runs-in', 'azurerm_service_plan.plan', 88);
  has('azurerm_linux_web_app.web', 'uses', 'azurerm_storage_account.main', 103);
  has('azurerm_role_assignment.deployer_owner', 'reads-from', 'data.azurerm_subscription.current', 124);
  assert.ok(!r.links.some((l) => l.from === 'azurerm_storage_account.main' && l.kind === 'uses' && l.to === 'azurerm_resource_group.rg'), 'one link per pair');
  for (const l of r.links) assert.equal(l.file, 'main.tf');
});

test('the flow is the order things are created, from their links, with a question for a conditional resource', () => {
  const r = readTerraform(azure, 'main.tf');
  assert.equal(r.items.length, 1);
  const it = r.items[0];
  assert.equal(it.title, 'What applying main.tf makes, in order');
  assert.deepEqual(says(it.steps), [
    'Keeps what it made (its state) in an Azure storage account',
    'Works in Azure',
    'Looks up the subscription current',
    'Looks up the client config current',
    'Creates the resource group rg',
    'Creates the storage account main in the resource group rg',
    'Creates the storage container uploads in the storage account main',
    'Creates the app service plan plan in the resource group rg',
    'Creates the web app (Linux) web in the resource group rg',
    ['Is the setting enable_insights on?', ['Creates the Application Insights insights in the resource group rg']],
    'Creates the role assignment web_reads_blobs',
    'Creates the role assignment deployer_owner',
    'Creates the network security group web in the resource group rg',
  ]);
  assert.equal(visualFor(it).element, 'function');
  assert.equal(readTerraform('variable "x" {}\n').items.length, 0, 'a file with only settings has nothing to create');
});

test('for_each and count read "for each" and "as many times as"; references read in words', () => {
  const r = readTerraform(aws, 'aws.tf');
  assert.deepEqual(says(r.items[0].steps).slice(0, 3), [
    'Works in AWS, in the region us-east-1',
    ['For each item in the setting bucket_names', ['Creates the S3 bucket site']],
    ['For each item in the S3 bucket site', ['Creates the S3 bucket public access block site']],
  ]);
  assert.equal(knows(thing(r, 'aws_s3_bucket.site'))['One for each'], 'item in the setting bucket_names');
  assert.match(readTerraform('resource "a_b" "c" {\n  count = var.n\n}\n').items[0].steps[0].says, /^As many times as the setting n/);
});

test('Azure role assignments are permissions; Owner of the whole subscription is wide', () => {
  const r = readTerraform(azure, 'main.tf');
  assert.deepEqual(r.permissions.map((p) => [p.who, p.can, p.on, p.wide, p.line]), [
    ['the web app (Linux) web (its own identity)', 'read blobs (Storage Blob Data Reader)', 'the storage account main', false, 117],
    ['whoever runs Terraform', 'do anything, including give others access (Owner)', 'the whole subscription', true, 123],
  ]);
  assert.equal(r.permissions[1].why, 'Owner of the whole subscription');
  assert.equal(r.permissions[1].role, 'Owner');
  assert.ok(r.facts.some((f) => f.kind === 'wide-permission' && f.line === 123));
  // A role named by its id is named.
  const byId = readTerraform('resource "azurerm_role_assignment" "a" {\n  scope = "/subscriptions/0000/resourceGroups/rg1"\n  role_definition_id = "/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c"\n  principal_id = var.who\n}\n');
  assert.deepEqual([byId.permissions[0].who, byId.permissions[0].can, byId.permissions[0].on, byId.permissions[0].wide], ['the identity given in the setting who', 'change anything except who has access (Contributor)', 'the resource group rg1', false]);
});

test('AWS IAM: inline jsonencode policies, policy documents, trust policies, and attachments; "*" is wide', () => {
  const r = readTerraform(aws, 'aws.tf');
  assert.deepEqual(r.permissions.map((p) => [p.who, p.can, p.on, p.wide]), [
    ['the service lambda.amazonaws.com', 'act as this role', 'the IAM role worker', false],
    ['the IAM role worker', 's3:GetObject and s3:PutObject', 'arn:aws:s3:::acme-assets/*', false],
    ['the IAM role worker', 'do anything', 'every resource', true],
    ['the IAM role worker', 'do what the AWS policy AdministratorAccess allows', 'what that policy names', true],
    ['the service account ci@acme-prod.iam.gserviceaccount.com', 'act as roles/editor', 'the project acme-prod', true],
  ]);
  // Read-only actions on every resource are not wide; changes on every resource are.
  const ro = readTerraform('resource "aws_iam_policy" "p" {\n  policy = jsonencode({ Statement = [{ Effect = "Allow", Action = ["ec2:Describe*"], Resource = "*" }] })\n}\n');
  assert.equal(ro.permissions[0].wide, false);
  const rw = readTerraform('resource "aws_iam_policy" "p" {\n  policy = <<EOF\n{"Statement": [{"Effect": "Allow", "Action": "s3:DeleteObject", "Resource": "*"}]}\nEOF\n}\n');
  assert.equal(rw.permissions[0].wide, true);
  assert.equal(rw.permissions[0].who, 'whoever is given the policy p');
});

test('facts: open ports, public storage, encryption off, and secrets written in the file', () => {
  const az = readTerraform(azure, 'main.tf');
  assert.deepEqual(az.facts.map((f) => [f.kind, f.line]), [
    ['storage-public', 66], ['storage-public', 73], ['encryption-off', 89], ['secret-in-plain-config', 105], ['public-ingress', 146], ['wide-permission', 123],
  ]);
  assert.equal(az.facts.find((f) => f.kind === 'public-ingress').says, 'The network security group web lets anyone on the internet reach port 22.');
  const a = readTerraform(aws, 'aws.tf');
  assert.deepEqual(a.facts.filter((f) => f.kind !== 'wide-permission').map((f) => [f.kind, f.line]), [['storage-public', 23], ['public-ingress', 38], ['encryption-off', 56], ['secret-in-plain-config', 12]]);
  // Port 443 open to the world is not reported; neither is a closed rule.
  assert.ok(!a.facts.some((f) => f.line === 31));
  // The secret's value is never in what Thunder says.
  const all = JSON.stringify([az.things, az.settings, az.facts, a.things, a.settings, a.facts]);
  assert.ok(!all.includes('sk-live-1234567890') && !all.includes('hunter2'), 'no secret value is shown');
  // GCP: ICMP from anywhere reads as ping.
  const g = readTerraform('resource "google_compute_firewall" "ping" {\n  source_ranges = ["0.0.0.0/0"]\n  allow {\n    protocol = "icmp"\n  }\n}\n');
  assert.equal(g.facts[0].says, 'The compute firewall ping lets anyone on the internet reach it with ping (ICMP).');
});

test('variables, locals, and outputs are settings; a sensitive variable is only named', () => {
  const r = readTerraform(azure, 'main.tf');
  const s = Object.fromEntries(r.settings.map((x) => [x.name, x]));
  assert.deepEqual([s.location.source, s.location.default, s.location.doc, s.location.type], ['parameter', 'westeurope', 'Where everything is made.', 'words']);
  assert.deepEqual([s.db_password.secret, s.db_password.default], [true, undefined]);
  assert.deepEqual([s.name.source, s.name.computed], ['computed', true]);
  assert.equal(s.tags.source, 'literal');
  assert.deepEqual([s.web_url.output, s.web_url.from], [true, ['the default hostname of the web app (Linux) web']]);
  const web = thing(r, 'azurerm_linux_web_app.web');
  assert.ok(!web.knows.some((k) => /sk-live/.test(k.kind)));
});

test('the model: a folder of .tf files is one module; links across its files are drawn; Big Picture, Flow, and Text', () => {
  const m = thunderModel([
    { path: 'infra/main.tf', source: azure },
    { path: 'infra/vault.tf', source: 'resource "azurerm_key_vault" "kv" {\n  resource_group_name = azurerm_resource_group.rg.name\n}\n' },
    { path: 'other/x.tf', source: 'resource "azurerm_key_vault" "kv2" {\n  resource_group_name = azurerm_resource_group.rg.name\n}\n' },
  ]);
  assert.deepEqual(m.files.map((f) => [f.language, f.category]), [['terraform', 'infrastructure'], ['terraform', 'infrastructure'], ['terraform', 'infrastructure']]);
  assert.ok(m.links.some((l) => l.from === 'infra/vault.tf#azurerm_key_vault.kv' && l.to === 'infra/main.tf#azurerm_resource_group.rg' && l.kind === 'runs-in' && l.line === 2));
  assert.ok(!m.links.some((l) => l.from.startsWith('other/')), 'another folder is another module');
  const bp = readLevel(m, 'big-picture');
  assert.equal(bp.resources.length, 13);
  assert.equal(bp.resources.find((x) => x.address === 'azurerm_storage_account.main').label, 'Storage account main');
  assert.equal(bp.permissions.filter((p) => p.wide).length, 1);
  assert.ok(bp.facts.length >= 6);
  const apply = m.members.find((x) => x.file === 'infra/main.tf');
  assert.equal(apply.kind, 'steps');
  const flow = readLevel(m, 'flow', apply.id);
  assert.ok(flow.flow.nodes.some((n) => n.kind === 'decision' && n.text === 'Is the setting enable_insights on?'));
  const text = readLevel(m, 'text').text;
  assert.match(text, /Resource Storage account main \(azurerm_storage_account\)\n  It knows\n    Name: worked out when it is applied, from the setting prefix/);
  assert.match(text, /Whoever runs Terraform can do anything, including give others access \(Owner\) on the whole subscription \(wide\)/);
  assert.match(text, /Setting db_password: given when it is applied, a secret \(only its name is shown\)/);
  assert.match(text, /Setting location: given when it is applied \(westeurope unless told otherwise\)/);
  assert.match(modelText(m, 'infra/main.tf#data.azurerm_subscription.current'), /^Resource Subscription current \(azurerm_subscription\)\n  It knows\n    Looks up: an existing subscription/);
});

test('a block Thunder cannot parse is named, with its line, and the rest of the file is still read', () => {
  const r = readCode('resource "a_b" "bad" {\n  x = = 1\n}\nresource "a_b" "good" {\n  y = 1\n}\n', { language: 'terraform', file: 'x.tf' });
  assert.deepEqual(r.infra.unknowns.map((u) => u.line), [2]);
  assert.deepEqual(r.infra.things.map((t) => t.address), ['a_b.good']);
  const m = thunderModel([{ path: 'x.tf', source: 'resource "a_b" "bad" {\n  x = = 1\n}\n' }]);
  assert.match(m.unknowns[0].why, /^Not read yet: /);
});
