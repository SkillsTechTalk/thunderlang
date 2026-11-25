"use client";
// "Copy link to this reading": one button, the link it made (visible, so people see exactly what they share), and
// what happened, next to the button. Used on /read, /zoom, the shared-reading pages, and the gallery.
import { useEffect, useState } from "react";
import { focus } from "./ThunderParts";

export type MadeLink = { ok: true; url: string; note?: string } | { ok: false; message: string };

type State = { kind: "idle" } | { kind: "working" } | { kind: "copied" | "shown"; url: string; note?: string } | { kind: "refused"; message: string };

/**
 * @param make Builds the link for what is on screen right now (it may compress pasted code, so it can be async).
 * @param resetKey When this changes (another function, level, or edited code), an old link is cleared so a stale
 *   link is never on screen.
 */
export function ShareLink({ make, resetKey, label = "Copy link to this reading" }: { make: () => Promise<MadeLink> | MadeLink; resetKey?: string; label?: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  useEffect(() => { setState({ kind: "idle" }); }, [resetKey]);

  async function copy() {
    setState({ kind: "working" });
    let made: MadeLink;
    try { made = await make(); } catch { made = { ok: false, message: "The link could not be made in this browser. Try another browser." }; }
    if (!made.ok) { setState({ kind: "refused", message: made.message }); return; }
    try {
      // Some browsers leave the promise pending (a permission prompt, an unfocused page); never hang on it.
      await Promise.race([navigator.clipboard.writeText(made.url), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 1500))]);
      setState({ kind: "copied", url: made.url, note: made.note });
    } catch {
      setState({ kind: "shown", url: made.url, note: made.note });
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={copy} disabled={state.kind === "working"}
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-medium text-haze-100 transition hover:bg-white/10 active:bg-white/15 disabled:opacity-60 ${focus}`}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
        {state.kind === "working" ? "Making the link…" : label}
      </button>
      <div role="status" aria-live="polite" className="text-sm">
        {(state.kind === "copied" || state.kind === "shown") && (
          <div className="space-y-1.5">
            <p className={state.kind === "copied" ? "text-emerald-200" : "text-haze-200"}>
              {state.kind === "copied" ? "Link copied. " : "Your browser didn't allow copying; select the link below and copy it. "}
              {state.note}
            </p>
            <input readOnly value={state.url} aria-label="The link to this reading" onFocus={(e) => e.currentTarget.select()}
              className={`w-full max-w-xl rounded-lg border border-white/15 bg-ink-950 px-3 py-2 font-mono text-xs text-haze-200 ${focus}`} />
          </div>
        )}
        {state.kind === "refused" && <p className="max-w-xl rounded-lg border border-amber-300/40 px-3 py-2 text-amber-100">{state.message}</p>}
      </div>
    </div>
  );
}
