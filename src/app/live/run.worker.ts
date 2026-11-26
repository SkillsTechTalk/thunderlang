// Runs a Thunder Core program on the Thunder engine, off the page's thread: a program that never ends (a Repeat
// with no way out) cannot freeze the page; the page stops this worker after a moment and says so.
import { compileCore } from "../../../compiler/src/core/index.mjs";
import { runInProcess } from "../../../compiler/src/core/engine-core.mjs";

self.onmessage = (e: MessageEvent<{ id: number; source: string }>) => {
  const { id, source } = e.data;
  try {
    const r = compileCore(source, { file: "main.thunder" });
    if (!r.ok) { (self as unknown as Worker).postMessage({ id, ok: false }); return; }
    const out = runInProcess({ entry: r, cwd: "." });
    (self as unknown as Worker).postMessage({ id, ok: true, ...out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: true, status: 1, stdout: "", stderr: `The Thunder engine could not run this: ${err instanceof Error ? err.message : String(err)}` });
  }
};
