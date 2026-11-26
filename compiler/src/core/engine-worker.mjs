// Runs the Thunder engine on its own thread, with a stack deep enough for the recursion Python allows (about 1000
// calls). engine.mjs starts it and waits for the answer (see runSync there).
import { workerData } from 'node:worker_threads';
import { runInProcess, testInProcess } from './engine.mjs';

const { shared, port, job } = workerData;
let result;
try {
  result = job.tests ? testInProcess(job) : runInProcess(job);
} catch (e) {
  result = { status: 70, stdout: '', stderr: `The Thunder engine failed: ${e?.stack ?? e}\n` };
}
port.postMessage(result);
Atomics.store(shared, 0, 1);
Atomics.notify(shared, 0);
