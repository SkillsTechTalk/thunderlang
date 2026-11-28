// A program that answers requests (When someone calls …) runs until it is stopped. The thunder command starts it
// without waiting, and passes Ctrl+C or a stop signal on to it, so stopping thunder always stops the server too
// (a terminal sends Ctrl+C to both; a test, a process manager, or a container stops only thunder).
import { spawn } from 'node:child_process';

export function spawnServing(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { ...opts, stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { if (child.exitCode === null) child.kill(sig); });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1); });
  child.on('error', (e) => { process.stderr.write(`thunder run: ${e.message}\n`); process.exitCode = 2; });
  return { status: 0, serving: true };
}
