// Build the CommonJS half of the dual package. The sources stay pure ESM (.mjs);
// this bundles the two public entry points into self-contained .cjs files so
// CommonJS consumers (OpenThunder, the SkillsTech backend) can `require()` them
// synchronously , no async bootstrap, no ESM migration on their side.
//
// esbuild is a DEV dependency only: the shipped runtime stays zero-dependency.
// platform:node keeps `node:*` builtins external (required, not bundled), so the
// root full-Node surface (drift's node:crypto, etc.) works; /core is node-free and
// bundles universally. Deterministic for a pinned esbuild version.
import { build } from 'esbuild';
import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // Keep output stable/readable; no minify so the published CJS is inspectable.
  minify: false,
  legalComments: 'none',
};

const entries = [
  { in: join(root, 'src/index.mjs'), out: join(dist, 'index.cjs') },
  { in: join(root, 'src/core.mjs'), out: join(dist, 'core.cjs') },
];

for (const e of entries) {
  await build({ ...common, entryPoints: [e.in], outfile: e.out });
  console.log(`built ${e.out.replace(root + '/', '')}`);
}
