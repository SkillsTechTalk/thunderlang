import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { emitJavaModule, runJavaTarget, javaAvailable } from '../src/target-java.mjs';
import { emitCSharpModule, runCSharpTarget, csharpAvailable } from '../src/target-cs.mjs';
import { inferInputTypes } from '../src/target-util.mjs';

// Live compile+run is opt-in: it needs a JDK / .NET SDK and is unverifiable in a Node-only CI, so
// it runs only when a developer sets TL_NATIVE_TARGETS=1. Source-shape tests always run.
const NATIVE = process.env.TL_NATIVE_TARGETS === '1';
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-native-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };

const SRC = `mission Enroll
decision CanEnroll
  inputs
    age
    score
    region
  rule adult
    when age >= 18 and score >= 70 and region == US
    return Eligible
  default
    return NotEligible
test CanEnroll
  case adult
    given age 20, score 90, region US
    expect Eligible
  case minor
    given age 10, score 90, region US
    expect NotEligible
target
  C#
  Java
`;

test('input types are inferred from the test-case values (numeric wins, else string)', () => {
  const ast = parseIntent(SRC);
  const dec = ast.decisions.find((d) => d.name === 'CanEnroll');
  assert.deepEqual(inferInputTypes(ast, dec), { age: 'number', score: 'number', region: 'string' });
});

test('emitted Java is well-formed and typed (double for numbers, String for text, Objects.equals for ==)', () => {
  const java = emitJavaModule(parseIntent(SRC));
  assert.match(java, /public class ThunderTarget/);
  assert.match(java, /static String CanEnroll\(double age, double score, String region\)/);
  assert.match(java, /java\.util\.Objects\.equals\(region, "US"\)/);
  assert.match(java, /out\.put\("CanEnroll \/ adult", CanEnroll\(20, 90, "US"\)\);/);
});

test('emitted C# is well-formed and typed (double for numbers, string for text, value == for strings)', () => {
  const cs = emitCSharpModule(parseIntent(SRC));
  assert.match(cs, /class ThunderTarget/);
  assert.match(cs, /static string CanEnroll\(double age, double score, string region\)/);
  assert.match(cs, /region == "US"/);
  assert.match(cs, /using System\.Linq;/);
  assert.match(cs, /CanEnroll\(20, 90, "US"\)/);
});

// , live compile + execute (opt-in) ,

test('the Java adapter compiles + executes the generated decision', { skip: !(NATIVE && javaAvailable()) && 'set TL_NATIVE_TARGETS=1 with a JDK to run' }, () => {
  const out = runJavaTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target java runs the tests against generated Java', { skip: !(NATIVE && javaAvailable()) && 'set TL_NATIVE_TARGETS=1 with a JDK to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('j.thunder', SRC), '--target', 'java'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('conform --run java fills the Java column from live execution', { skip: !(NATIVE && javaAvailable()) && 'set TL_NATIVE_TARGETS=1 with a JDK to run' }, () => {
  const out = JSON.parse(spawnSync(process.execPath, [CLI, 'conform', write('jc.thunder', SRC), '--json', '--run', 'java'], { encoding: 'utf8' }).stdout);
  assert.ok(out.cases.every((c) => c.targets.java.status === 'pass'), 'the faithful Java target conforms');
});

test('the C# adapter compiles + executes the generated decision', { skip: !(NATIVE && csharpAvailable()) && 'set TL_NATIVE_TARGETS=1 with a .NET SDK to run' }, () => {
  const out = runCSharpTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target csharp runs the tests against generated C#', { skip: !(NATIVE && csharpAvailable()) && 'set TL_NATIVE_TARGETS=1 with a .NET SDK to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('c.thunder', SRC), '--target', 'csharp'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('conform --run csharp fills the C# column from live execution', { skip: !(NATIVE && csharpAvailable()) && 'set TL_NATIVE_TARGETS=1 with a .NET SDK to run' }, () => {
  const out = JSON.parse(spawnSync(process.execPath, [CLI, 'conform', write('cc.thunder', SRC), '--json', '--run', 'csharp'], { encoding: 'utf8' }).stdout);
  assert.ok(out.cases.every((c) => c.targets.csharp.status === 'pass'), 'the faithful C# target conforms');
});
