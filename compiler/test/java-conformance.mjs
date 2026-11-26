// Compiled Java for the conformance tests, fast: one warm Java process (test/java/ThunderJavaServer.java) compiles and
// runs every program, instead of a javac and a JVM for each of the hundreds of programs. The tests call it
// synchronously: a worker thread talks to the Java process, and this thread waits for its answer (as engine.mjs does).
// Not a test file itself (no .test.mjs).
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findJava, JAVA_RUNTIME, compileJava } from '../src/core/java-run.mjs';
import { javaClassName } from '../src/core/target-java.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const JDK = findJava();
let server = null;

/** Start the Java process once: compile the runtime and the server, then keep the process waiting for programs. */
function start() {
  const root = mkdtempSync(join(tmpdir(), 'thunder-java-'));
  process.on('exit', () => { try { server?.worker.terminate(); } catch { /* gone */ } rmSync(root, { recursive: true, force: true }); });
  const rt = join(root, 'runtime'), srv = join(root, 'server'), work = join(root, 'work');
  for (const d of [rt, srv, work]) mkdirSync(d, { recursive: true });
  for (const [rel, text] of Object.entries(JAVA_RUNTIME)) { mkdirSync(join(root, 'src', rel, '..'), { recursive: true }); writeFileSync(join(root, 'src', rel), text); }
  const c1 = spawnSync(JDK.javac, ['--release', '17', '-encoding', 'UTF-8', '-nowarn', '-d', rt, ...Object.keys(JAVA_RUNTIME).map((f) => join(root, 'src', f))], { encoding: 'utf8' });
  if (c1.status !== 0) throw new Error(`the Java runtime does not compile:\n${c1.stderr}`);
  const c2 = spawnSync(JDK.javac, ['-encoding', 'UTF-8', '-nowarn', '-d', srv, join(HERE, 'java', 'ThunderJavaServer.java')], { encoding: 'utf8' });
  if (c2.status !== 0) throw new Error(`the Java test server does not compile:\n${c2.stderr}`);
  const shared = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(`
    const { workerData } = require('node:worker_threads');
    const { spawn } = require('node:child_process');
    const { shared, port, java, args } = workerData;
    const child = spawn(java, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = Buffer.alloc(0), want = null;
    const fields = [];
    child.stdout.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (want === null) { const nl = buf.indexOf(10); if (nl < 0) return; want = Number(buf.subarray(0, nl).toString()); buf = buf.subarray(nl + 1); }
        if (buf.length < want) return;
        fields.push(buf.subarray(0, want)); buf = buf.subarray(want); want = null;
        if (fields.length === 3) {
          const [status, stdout, stderr] = fields.splice(0, 3);
          port.postMessage({ status: Number(status.toString()), stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') });
          Atomics.store(shared, 0, 1); Atomics.notify(shared, 0);
        }
      }
    });
    child.on('exit', (code) => { port.postMessage({ status: 70, stdout: '', stderr: 'The Java test server stopped (exit ' + code + ').' }); Atomics.store(shared, 0, 1); Atomics.notify(shared, 0); });
    const field = (b) => Buffer.concat([Buffer.from(b.length + '\\n'), b]);
    port.on('message', (job) => {
      const parts = [field(Buffer.from(String(job.files.length)))];
      for (const [p, t] of job.files) parts.push(field(Buffer.from(p)), field(Buffer.from(t, 'utf8')));
      parts.push(field(Buffer.from(job.main)), field(Buffer.from(job.cwd)));
      child.stdin.write(Buffer.concat(parts));
    });
  `, { eval: true, workerData: { shared, port: port2, java: JDK.java, args: ['-XX:+UseSerialGC', '-Xss8m', '-cp', srv, 'ThunderJavaServer', rt, work] }, transferList: [port2] });
  worker.unref();
  port1.unref(); // the tests' process ends when they do, even with the Java process waiting
  return { worker, port: port1, shared };
}

/**
 * Compile results to Java and run them (or their tests) in the warm Java process: { status, stdout, stderr }, or null
 * when there is no JDK here.
 */
export function runJavaWarm(results, { tests = false, entry = results[0], cwd }) {
  if (JDK.error) return null;
  server ??= start();
  const files = Object.entries(compileJava(results));
  const main = tests ? 'app.RunTests' : `app.${javaClassName(entry.module ?? 'main')}`;
  Atomics.store(server.shared, 0, 0);
  server.port.postMessage({ files, main, cwd });
  while (Atomics.wait(server.shared, 0, 0, 120000) === 'timed-out') { /* keep waiting: a long program */ }
  const msg = receiveMessageOnPort(server.port);
  return msg ? msg.message : { status: 70, stdout: '', stderr: 'The Java test server gave no answer.' };
}
