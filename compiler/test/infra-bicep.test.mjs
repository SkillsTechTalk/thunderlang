// Bicep in Thunder (spec section 12): resources (existing ones looked up), modules, symbolic references and
// parent as links, for and if, role assignments with well-known roles named, settings (@secure only named), facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode, detectLanguage } from '../src/read.mjs';
import { readableFile } from '../src/read-repo.mjs';
import { readBicep } from '../src/infra-bicep.mjs';
import { thunderModel, readLevel } from '../src/model.mjs';

const src = readFileSync(new URL('./fixtures/infra/main.bicep', import.meta.url), 'utf8');
const says = (steps) => steps.map((s) => (s.children ? [s.says, says(s.children)] : s.says));
const thing = (r, address) => r.things.find((t) => t.address === address);
const knows = (t) => Object.fromEntries(t.knows.map((k) => [k.label, k.kind]));

test('.bicep files are read as Bicep, and pasted Bicep is recognized', () => {
  assert.equal(readableFile('infra/main.bicep'), 'bicep');
  assert.equal(detectLanguage(src), 'bicep');
  assert.equal(detectLanguage("param name string\nresource s 'Microsoft.Storage/storageAccounts@2023-01-01' = {\n}\n"), 'bicep');
  const r = readCode(src, { file: 'main.bicep' });
  assert.equal(r.language, 'bicep');
  assert.equal(r.purpose, 'A web app with its storage, secrets, and monitoring.');
});

test('each resource is a Resource with its type, its symbolic name as its address, and its properties in words', () => {
  const r = readBicep(src, 'main.bicep');
  const st = thing(r, 'storage');
  assert.deepEqual([st.resourceType, st.label, st.lines, st.doc], ['Microsoft.Storage/storageAccounts', 'Storage account', [26, 42], 'Files the app uploads.']);
  assert.deepEqual(knows(st), {
    Name: 'the value storageName (worked out when it is applied)',
    Location: 'the setting location (worked out when it is applied)',
    Sku: 'name: Standard_LRS',
    Kind: 'StorageV2',
    'Allow blob public access': 'yes',
    'Supports HTTPS traffic only': 'yes',
    'Minimum TLS version': 'TLS1_2',
    'API version': '2023-01-01',
  });
  // A nested resource gets its full type and sits in its parent.
  assert.equal(thing(r, 'blobs').resourceType, 'Microsoft.Storage/storageAccounts/blobServices');
  // `existing` is looked up; a module is a Resource of its own.
  assert.equal(thing(r, 'kv').existing, true);
  const mon = thing(r, 'monitoring');
  assert.deepEqual([mon.resourceType, mon.label], ['module', 'Module monitoring']);
  assert.deepEqual(knows(mon), { 'Uses the module': './monitoring.bicep', 'Only when': 'the setting deployMonitoring is on', Name: 'monitoring', 'Given location': 'the setting location (worked out when it is applied)', 'Given app name': 'the name of the web app web (worked out when it is applied)' });
  // A @secure() parameter given to a property is named, never shown.
  const sql = knows(thing(r, 'sqlServer'));
  assert.equal(sql['Administrator login password'], 'a secret from the setting sqlAdminPassword (its value is not shown)');
  assert.equal(knows(thing(r, 'containers'))['One for each'], 'item in the setting containerNames');
});

test('parent, symbolic references, and parent::child are links with their kind and line', () => {
  const r = readBicep(src, 'main.bicep');
  assert.deepEqual(r.links.map((l) => [l.from, l.kind, l.to, l.line]), [
    ['blobs', 'runs-in', 'storage', 39],
    ['containers', 'runs-in', 'blobs', 45],
    ['web', 'runs-in', 'plan', 70],
    ['web', 'uses', 'storage', 76],
    ['webReadsBlobs', 'uses', 'storage', 97],
    ['webReadsBlobs', 'uses', 'web', 97],
    ['webOwnsGroup', 'uses', 'web', 107],
    ['monitoring', 'uses', 'web', 140],
  ]);
});

test('the flow is the order things are created, with "for each" and an "only when" question', () => {
  const r = readBicep(src, 'main.bicep');
  assert.equal(r.items[0].title, 'What deploying main.bicep makes, in order');
  assert.deepEqual(says(r.items[0].steps), [
    'Deploys to a resource group',
    'Creates the storage account storage',
    'Creates the blob service blobs in the storage account storage',
    ['For each item in the setting containerNames', ['Creates the blob container containers in the blob service blobs']],
    'Creates the app service plan plan',
    'Creates the web app web in the app service plan plan',
    'Looks up the existing key vault kv',
    'Creates the SQL server sqlServer',
    'Creates the role assignment webReadsBlobs',
    'Creates the role assignment webOwnsGroup',
    'Creates the network security group nsg',
    ['Is the setting deployMonitoring on?', ['Uses the module monitoring (./monitoring.bicep)']],
  ]);
});

test('role assignments: well-known role ids are named (through a var too); Owner at subscription scope is wide', () => {
  const r = readBicep(src, 'main.bicep');
  assert.deepEqual(r.permissions.map((p) => [p.who, p.can, p.on, p.wide, p.role]), [
    ['the web app web (its own identity)', 'read blobs (Storage Blob Data Reader)', 'the storage account storage', false, 'Storage Blob Data Reader'],
    ['the web app web (its own identity)', 'do anything, including give others access (Owner)', 'the resource group it is deployed to', false, 'Owner'],
  ]);
  assert.equal(knows(thing(r, 'webReadsBlobs'))['Role definition id'], 'Storage Blob Data Reader (a built-in role)');
  const sub = readBicep([
    "targetScope = 'subscription'",
    'param principalId string',
    "resource owner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {",
    "  name: guid(subscription().id, principalId)",
    '  properties: {',
    '    principalId: principalId',
    "    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')",
    '  }',
    '}',
  ].join('\n'), 'sub.bicep');
  const p = sub.permissions[0];
  assert.deepEqual([p.who, p.can, p.on, p.wide, p.why], ['the identity given in the setting principalId', 'change anything except who has access (Contributor)', 'the whole subscription', true, 'Contributor of the whole subscription']);
  assert.ok(sub.facts.some((f) => f.kind === 'wide-permission'));
  // A role id worked out when it is deployed is said so, not guessed.
  const dyn = readBicep("param roleId string\nresource ra 'Microsoft.Authorization/roleAssignments@2022-04-01' = {\n  name: 'x'\n  properties: {\n    principalId: 'abc'\n    roleDefinitionId: roleId\n  }\n}\n");
  assert.equal(dyn.permissions[0].can, 'act in the role the setting roleId (worked out when it is applied)');
});

test('facts: public blob access, an NSG open to the internet on 3389, and a secure parameter with a default', () => {
  const r = readBicep(src, 'main.bicep');
  assert.deepEqual(r.facts.map((f) => [f.kind, f.line]), [['storage-public', 34], ['public-ingress', 121]]);
  assert.equal(r.facts[1].says, 'The network security group nsg lets anyone on the internet reach port 3389.');
  const more = readBicep("@secure()\nparam pw string = 'P@ssw0rd!'\nresource s 'Microsoft.Web/sites@2023-01-01' = {\n  name: 'x'\n  properties: {\n    httpsOnly: false\n  }\n}\n");
  assert.deepEqual(more.facts.map((f) => f.kind), ['encryption-off', 'secret-in-plain-config']);
  assert.ok(!JSON.stringify(more).includes('P@ssw0rd!'), 'the secret value is never shown');
});

test('params, vars, and outputs are settings; @secure() is only named; @description is the doc', () => {
  const r = readBicep(src, 'main.bicep');
  const s = Object.fromEntries(r.settings.map((x) => [x.name, x]));
  assert.deepEqual([s.location.source, s.location.default, s.location.doc], ['parameter', "the resource group's location", 'Where everything is made.']);
  assert.deepEqual([s.sqlAdminPassword.secret, s.sqlAdminPassword.default], [true, undefined]);
  assert.equal(s.containerNames.default, 'uploads and exports');
  assert.deepEqual([s.storageName.source, s.blobReader.computed], ['computed', true]);
  assert.deepEqual([s.webUrl.output, s.storageId.from], [true, ['the id of the storage account storage']]);
});

test('the model draws Bicep resources, permissions, settings, and facts on the Big Picture', () => {
  const m = thunderModel([{ path: 'infra/main.bicep', source: src }]);
  assert.deepEqual(m.files[0], { path: 'infra/main.bicep', language: 'bicep', category: 'infrastructure', purpose: 'A web app with its storage, secrets, and monitoring.' });
  const bp = readLevel(m, 'big-picture');
  assert.equal(bp.resources.length, 11);
  assert.equal(bp.permissions.length, 2);
  assert.ok(bp.resources.find((x) => x.address === 'web').links.some((l) => l.kind === 'runs-in'));
  const text = readLevel(m, 'text').text;
  assert.match(text, /Resource Storage account \(Microsoft\.Storage\/storageAccounts\)/);
  assert.match(text, /Setting sqlAdminPassword: given when it is applied, a secret \(only its name is shown\)/);
});
