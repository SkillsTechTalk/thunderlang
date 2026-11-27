// Writing compiled Java to disk, compiling it with javac, and running it.
//
// Layout of a build (generated/java/): app/<Class>.java for every Thunder file and app/RunTests.java, the runtime in
// thunder/ (ThunderRuntime.java and T.java), and the compiled classes in classes/. Running needs a JDK 17 or newer:
// Thunder looks in THUNDER_JAVA_HOME, then JAVA_HOME, then the PATH. Without one it says plainly what to install.
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toJava, javaTestRunner, javaClassName } from './target-java.mjs';
import { pythonOnlyUses, npmRefusals, dotnetRefusals } from './target-typescript.mjs';
import { diag } from './diagnostics.mjs';

const RUNTIME_DIR = new URL('./java/thunder/', import.meta.url);
/** The Java runtime, written next to compiled Java: { 'thunder/ThunderRuntime.java': text, 'thunder/T.java': text }. */
export const JAVA_RUNTIME = Object.fromEntries(['ThunderRuntime.java', 'T.java'].map((f) => [`thunder/${f}`, readFileSync(new URL(f, RUNTIME_DIR), 'utf8')]));

/** The names a src file gives a test file (its records, functions, and kept values). */
const exportedNames = (r) => [...r.info.records, ...r.info.funcs, ...r.info.consts].filter((s) => !r.info.imported?.has(s)).map((s) => s.py);

/** TC405 for every Use in a file: Python modules exist only for the Python target. */
export function javaDiagnostics(result) {
  return [...npmRefusals(result.info, 'Java', diag), ...dotnetRefusals(result.info, 'Java', diag), ...pythonOnlyUses(result.info).map((u) => diag('TC405', u.line,
    `"${u.module}" is a Python module, and this program is compiled to Java, which cannot use it.`,
    'Build for Python (target = "python") to use Python modules. Thunder never swaps in a different library.'))];
}

/** Compile checked results to Java: { 'app/<Class>.java': text, 'app/RunTests.java': text }. */
export function compileJava(results, { pkg = 'app' } = {}) {
  const src = results.filter((r) => r.kind !== 'test');
  const out = {};
  for (const r of results) {
    const imports = r.kind === 'test' ? src.map((s) => ({ module: s.module, names: exportedNames(s) })) : [];
    out[`${pkg}/${javaClassName(r.module)}.java`] = toJava(r.program, r.info, { source: r.file, module: r.module, imports, pkg });
  }
  out[`${pkg}/RunTests.java`] = javaTestRunner(results, pkg);
  return out;
}

/** Write the Java for every result and the runtime into outDir. Gives back the files written (relative paths). */
export function writeJava(results, outDir, { pkg = 'app' } = {}) {
  const files = { ...compileJava(results, { pkg }), ...JAVA_RUNTIME };
  rmSync(join(outDir, pkg), { recursive: true, force: true }); // a file removed from the project leaves no stale class
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(outDir, rel, '..'), { recursive: true });
    writeFileSync(join(outDir, rel), text);
  }
  return Object.keys(files);
}

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);
const works = (cmd) => { try { const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' }); return r.status === 0; } catch { return false; } };

/** Where the JDK is: { javac, java } or { error }. THUNDER_JAVA_HOME, then JAVA_HOME, then the PATH. */
export function findJava({ env = process.env } = {}) {
  for (const home of [env.THUNDER_JAVA_HOME, env.JAVA_HOME].filter(Boolean)) {
    const javac = join(home, 'bin', exe('javac')), java = join(home, 'bin', exe('java'));
    if (existsSync(javac) && existsSync(java) && works(javac)) return { javac, java };
  }
  for (const dir of String(env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const javac = join(dir, exe('javac')), java = join(dir, exe('java'));
    if (existsSync(javac) && existsSync(java) && works(javac)) return { javac, java };
  }
  return { error: 'Running Java needs a JDK 17 or newer (javac and java), and none was found. Install one (for example from https://adoptium.net) and put it on the PATH, or set JAVA_HOME. "thunder build --target java" works without it.' };
}

/** javac every source in outDir into outDir/classes. { ok, output }. */
export function compileJavaSources(outDir, jdk, files) {
  const classes = join(outDir, 'classes');
  rmSync(classes, { recursive: true, force: true });
  mkdirSync(classes, { recursive: true });
  const r = spawnSync(jdk.javac, ['--release', '17', '-encoding', 'UTF-8', '-nowarn', '-d', classes, ...files.map((f) => join(outDir, f))], { encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** Options that make a short program start fast. */
export const JAVA_FAST = ['-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-Xshare:auto'];

/**
 * Compile the Java in outDir and run one class (`main` is a Thunder module, or 'RunTests'), in the folder `cwd`.
 * Returns spawnSync's result ({ status, stdout, stderr }), or { status: 2, stderr, error } when Java cannot run here.
 */
export function runJava(outDir, files, main, { cwd = outDir, stdio = 'pipe', pkg = 'app' } = {}) {
  const jdk = findJava();
  if (jdk.error) return { status: 2, stdout: '', stderr: `${jdk.error}\n`, error: jdk.error };
  const c = compileJavaSources(outDir, jdk, files.filter((f) => f.endsWith('.java')));
  if (!c.ok) return { status: 2, stdout: '', stderr: `javac could not compile the generated Java (a bug in Thunder):\n${c.output}\n`, error: c.output };
  const cls = main === 'RunTests' ? 'RunTests' : javaClassName(main);
  return spawnSync(jdk.java, [...JAVA_FAST, '-cp', join(outDir, 'classes'), `${pkg}.${cls}`], { cwd, stdio, encoding: 'utf8' });
}
