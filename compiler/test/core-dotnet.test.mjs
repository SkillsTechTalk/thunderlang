// .NET libraries from Thunder Core (Use "<type>" from .NET, or from NuGet "<package>" version "<v>"), compiled to
// C#. Calls go through ThunderDotnet.cs; every other target and the Thunder engine refuse them (TC409).
// The NuGet test downloads a package, so it runs only with THUNDER_NETWORK_TESTS=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileCore } from '../src/core/index.mjs';
import { findDotnet } from '../src/core/csharp-run.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const DOTNET = findDotnet();
const skipRun = DOTNET.error ? `no .NET SDK: ${DOTNET.error}` : false;
const thunder = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const withFile = (src, fn) => { const dir = mkdtempSync(join(tmpdir(), 'thunder-dotnet-')); try { writeFileSync(join(dir, 'main.thunder'), src); return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test('Use "<type>" from .NET and from NuGet parse; the mistakes say how to write them', () => {
  const r = compileCore('Use "System.IO.Path" from .NET as paths\nUse "System.Math" from dotnet as math\nUse "Humanizer.NumberToWordsExtension" from NuGet "Humanizer.Core" version "2.14.1" as words\n', { file: 'm.thunder' });
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.info.modules.map((m) => [m.module, m.ecosystem, m.package ?? null, m.version ?? null]), [
    ['System.IO.Path', 'dotnet', null, null], ['System.Math', 'dotnet', null, null], ['Humanizer.NumberToWordsExtension', 'nuget', 'Humanizer.Core', '2.14.1'],
  ]);
  for (const [src, words] of [
    ['Use "Path" from .NET as paths\n', /with its namespace/],
    ['Use "System.IO.Path" from .NET\n', /Give the type a name/],
    ['Use "Humanizer.X" from NuGet "Humanizer.Core" as words\n', /Name the NuGet package and its version/],
    ['Use "Humanizer.X" from NuGet "Humanizer.Core" version "latest" as words\n', /Name the NuGet package and its version/],
    ['Use "System.IO.Path" from java as paths\n', /Python, npm, \.NET, or NuGet/],
  ]) {
    const c = compileCore(src, { file: 'm.thunder' });
    assert.equal(c.ok, false, src);
    assert.match(c.diagnostics.map((d) => d.message).join('\n'), words, src);
  }
});

test('every other target refuses a .NET library with TC409; the engine says to run it as C#', () => {
  withFile('Use "System.Math" from .NET as math\nSay math.Max(3, 7)\n', (dir) => {
    for (const target of ['python', 'typescript', 'go', 'java', 'rust']) {
      const r = thunder(['build', '--core', 'main.thunder', '--target', target], dir);
      assert.notEqual(r.status, 0, target);
      assert.match(r.stdout + r.stderr, /"System\.Math" is a \.NET type.*\[TC409\]/s, target);
    }
  });
});

test('compiled C# calls .NET types: overloads by value, exact numbers back, lists in', { skip: skipRun }, () => {
  withFile([
    'Use "System.IO.Path" from .NET as paths',
    'Use "System.Math" from .NET as math',
    'Use "System.String" from .NET as texts',
    '',
    'Say paths.Combine("reports", "trades.csv")',
    'Say math.Max(3, 7)',
    'Say math.PI',
    'Say texts.Join(", ", ["a", "b", "c"])',
    'Set root to math.Sqrt(2)',
    'Say root + 1',
    'Say math.Nope(1)',
    '',
  ].join('\n'), (dir) => {
    const r = thunder(['run', '--core', 'main.thunder', '--target', 'csharp'], dir);
    assert.match(r.stdout, /^reports\/trades\.csv\n7\n3\.141592653589793\na, b, c\n2\.4142135623730951\n/);
    assert.match(r.stdout + r.stderr, /line 11: The \.NET type "System\.Math" has no method named "Nope"\.\s+\[TC508\]/);
    const out = join(dir, 'generated', 'csharp');
    if (existsSync(out)) assert.ok(existsSync(join(out, 'ThunderDotnet.cs')));
  });
});

test('a NuGet package is restored and called (network)', { skip: skipRun || (process.env.THUNDER_NETWORK_TESTS ? false : 'set THUNDER_NETWORK_TESTS=1 to download a NuGet package') }, () => {
  withFile('Use "Humanizer.NumberToWordsExtension" from NuGet "Humanizer.Core" version "2.14.1" as words\nSay words.ToWords(1234)\n', (dir) => {
    const r = thunder(['run', '--core', 'main.thunder', '--target', 'csharp'], dir);
    assert.equal(r.stdout, 'one thousand two hundred and thirty-four\n', r.stderr);
  });
});
