"use client";

import { useMemo, useRef, useState } from "react";
import { promoteDecision } from "../../../compiler/src/promote.mjs";
import type { ReadItem } from "../../../compiler/src/read.mjs";
import { ThunderEditor } from "@/components/ThunderEditor";
import { compileContract, type Compiled } from "@/lib/thunder-compile";

function save(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Promote a recovered decision to an editable contract whose examples run as you edit. */
export function PromotePanel({ item, file }: { item: ReadItem; file?: string }) {
  const promoted = useMemo(() => promoteDecision(item as never, { file: file ?? "" }), [item, file]);
  const [source, setSource] = useState(promoted.ok ? promoted.source : "");
  const last = useRef<Compiled | null>(null);
  const { compiled, error } = useMemo(() => {
    if (!source) return { compiled: null, error: "" };
    try {
      last.current = compileContract(source);
      return { compiled: last.current, error: "" };
    } catch (e) {
      return { compiled: last.current, error: e instanceof Error ? e.message : "This contract could not be read." };
    }
  }, [source]);
  if (!promoted.ok) {
    return <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm text-amber-100">{promoted.reason}</p>;
  }
  const id = `promote-${item.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const failing = compiled && !error ? compiled.report.tests.results.filter((r) => !r.pass) : [];
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-gold-300/25 bg-gold-400/[0.04] p-4">
      <p className="text-sm text-haze-200">
        This contract states the rule the code follows today. Its examples were chosen at every rule and threshold, and their
        answers come from the code itself. <strong className="text-white">Confirm each answer with a person</strong>, and change any
        that are wrong. After that, every change to the code can be checked against it.
      </p>
      <div className="overflow-hidden rounded-lg border border-white/15 bg-black/30">
        <label htmlFor={id} className="block border-b border-white/10 px-3 py-2 text-xs font-medium text-haze-300">
          {promoted.name}.thunder-human
        </label>
        <ThunderEditor id={id} value={source} onChange={setSource} minRows={8} maxRows={24} invalid={!!error} describedBy={`${id}-status`} />
      </div>
      <p id={`${id}-status`} role="status" aria-live="polite" className={`text-sm ${error || failing.length ? "text-red-200" : "text-emerald-200"}`}>
        {error
          ? error
          : failing.length
            ? `${failing.length} example${failing.length === 1 ? "" : "s"} now disagree with the rule: ${failing.map((f) => `"${f.case}" expects ${String(f.expected)}, the rule gives ${String(f.actual)}`).join("; ")}. Fix the rule or the expected answer.`
            : `All ${compiled?.report.tests.total ?? 0} examples match the rule.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => save(source, `${promoted.name}.thunder-human`)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-haze-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">
          Download {promoted.name}.thunder-human
        </button>
        <button type="button" disabled={!compiled || !!error} onClick={() => compiled && save(compiled.code.thunder, `${promoted.name}.thunder`)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-haze-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 disabled:opacity-40">
          Download as standard {promoted.name}.thunder
        </button>
      </div>
    </div>
  );
}
