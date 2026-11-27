// The playground's runs, off the page's thread: a program that never ends (a Repeat with no way out) cannot freeze
// the page; the page stops this worker after a moment and says so.
import { runProgram, testProgram, stepsOf, tryCall } from "./core-playground.mjs";

type Job =
  | { id: number; op: "run"; source: string }
  | { id: number; op: "test"; source: string }
  | { id: number; op: "steps"; source: string }
  | { id: number; op: "try"; source: string; fn: string; values: string[] };

self.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  let result: unknown;
  try {
    if (job.op === "run") result = runProgram(job.source);
    else if (job.op === "test") result = testProgram(job.source);
    else if (job.op === "steps") result = stepsOf(job.source);
    else result = tryCall(job.source, job.fn, job.values);
  } catch (err) {
    result = { crashed: `The Thunder engine could not do this: ${err instanceof Error ? err.message : String(err)}` };
  }
  (self as unknown as Worker).postMessage({ id: job.id, op: job.op, result });
};

// Loaded and ready: the page starts a job's time limit only now, so a slow load is never mistaken for a program
// that does not end.
(self as unknown as Worker).postMessage({ ready: true });
