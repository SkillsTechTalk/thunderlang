#!/usr/bin/env node
// Build the Intent Atlas dataset: fetch a curated set of well-known, permissively-licensed
// open-source files, lift EVERY function in each into an inferred intent draft (deterministic,
// no AI, humble , never marked verified), and write src/data/atlas.json for the site to browse.
// The Atlas lets people understand a known project through its intent. Run manually to refresh;
// the committed atlas.json is what ships (no network at build/serve time).
//
//   node scripts/build-atlas.mjs
//
// Only the LIFTED INTENT (a transformed, derived artifact) is stored, with attribution + license
// + the source URL; the original source is not redistributed.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liftAll } from '../compiler/src/lift.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Curated: recognizable, function-oriented, permissive. One representative file per project.
const CURATED = [
  { name: 'Requests', language: 'python', license: 'Apache-2.0', what: 'the Python HTTP library , its public verb API', url: 'https://raw.githubusercontent.com/psf/requests/main/src/requests/api.py', path: 'src/requests/api.py' },
  { name: 'Express', language: 'javascript', license: 'MIT', what: 'the Node web framework , its application methods', url: 'https://raw.githubusercontent.com/expressjs/express/master/lib/application.js', path: 'lib/application.js' },
  { name: 'gorilla/mux', language: 'go', license: 'BSD-3-Clause', what: 'a popular Go HTTP router', url: 'https://raw.githubusercontent.com/gorilla/mux/main/mux.go', path: 'mux.go' },
  { name: 'Flask', language: 'python', license: 'BSD-3-Clause', what: 'the Python micro web framework , its helpers', url: 'https://raw.githubusercontent.com/pallets/flask/main/src/flask/helpers.py', path: 'src/flask/helpers.py' },
  { name: 'chi', language: 'go', license: 'MIT', what: 'a lightweight Go HTTP router', url: 'https://raw.githubusercontent.com/go-chi/chi/master/mux.go', path: 'mux.go' },
  { name: 'radash', language: 'typescript', license: 'MIT', what: 'a modern TypeScript utility library , its array helpers', url: 'https://raw.githubusercontent.com/sodiray/radash/master/src/array.ts', path: 'src/array.ts' },
  { name: 'Guava Strings', language: 'java', license: 'Apache-2.0', what: "Google Guava's string utilities", url: 'https://raw.githubusercontent.com/google/guava/master/guava/src/com/google/common/base/Strings.java', path: 'com/google/common/base/Strings.java' },
  { name: 'Laravel Str', language: 'php', license: 'MIT', what: "Laravel's string helper", url: 'https://raw.githubusercontent.com/laravel/framework/master/src/Illuminate/Support/Str.php', path: 'src/Illuminate/Support/Str.php' },
  { name: 'Rack::Utils', language: 'ruby', license: 'MIT', what: "Rack's HTTP utility methods", url: 'https://raw.githubusercontent.com/rack/rack/main/lib/rack/utils.rb', path: 'lib/rack/utils.rb' },
  { name: 'bitflags', language: 'rust', license: 'Apache-2.0', what: 'a widely-used Rust bitflags crate', url: 'https://raw.githubusercontent.com/bitflags/bitflags/main/src/lib.rs', path: 'src/lib.rs' },
  { name: 'Newtonsoft.Json', language: 'csharp', license: 'MIT', what: "the .NET JSON library's public convert API", url: 'https://raw.githubusercontent.com/JamesNK/Newtonsoft.Json/master/Src/Newtonsoft.Json/JsonConvert.cs', path: 'Src/Newtonsoft.Json/JsonConvert.cs' },
  { name: 'Redis util', language: 'cpp', license: 'BSD-3-Clause', what: "Redis's core C string/number utilities", url: 'https://raw.githubusercontent.com/redis/redis/unstable/src/util.c', path: 'src/util.c' },
  { name: 'Mojo::Util', language: 'perl', license: 'Artistic-2.0', what: "Mojolicious's Perl utility subs", url: 'https://raw.githubusercontent.com/mojolicious/mojo/main/lib/Mojo/Util.pm', path: 'lib/Mojo/Util.pm' },
];

// Keep the page + dataset usable: show a representative slice of very large APIs (honestly noted).
const MAX_PER_PROJECT = 40;

async function main() {
  const projects = [];
  for (const c of CURATED) {
    let source;
    try { const r = await fetch(c.url); if (!r.ok) { console.error(`skip ${c.name}: HTTP ${r.status}`); continue; } source = await r.text(); }
    catch (e) { console.error(`skip ${c.name}: ${e.message}`); continue; }
    const lifted = liftAll(source, { language: c.language, file: c.path });
    if (!lifted.ok || !lifted.count) { console.error(`skip ${c.name}: ${lifted.error || 'no functions lifted'}`); continue; }
    // Keep the lift honest + compact: name, source function, confidence, and the intent draft.
    const all = lifted.missions.map((m) => ({ mission: m.mission, fn: m.fn, line: m.line, confidence: m.confidence, intent: m.intentText }));
    const missions = all.slice(0, MAX_PER_PROJECT);
    projects.push({ name: c.name, language: c.language, license: c.license, what: c.what, source: c.url, path: c.path, publicFunctions: all.length, missionCount: missions.length, missions });
    console.log(`ok ${c.name} (${c.language}): ${missions.length}${all.length > missions.length ? ` of ${all.length}` : ''} mission(s)`);
  }
  const atlas = {
    schema: 'intent-atlas-v1',
    note: 'Inferred intent drafts lifted deterministically from public open-source code by @skillstech/thunderlang. Humble and unverified , a lens on each project, not its authors\' committed intent.',
    projects,
    totals: { projects: projects.length, missions: projects.reduce((n, p) => n + p.missionCount, 0), languages: [...new Set(projects.map((p) => p.language))].sort() },
  };
  const out = join(ROOT, 'src', 'data', 'atlas.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(atlas, null, 2)}\n`);
  console.log(`\nwrote src/data/atlas.json , ${atlas.totals.projects} projects, ${atlas.totals.missions} missions, ${atlas.totals.languages.join('/')}`);
}

main();
