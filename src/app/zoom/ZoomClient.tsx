"use client";
// Semantic Zoom: read any example (or your own code) at the five reading levels, Big Picture, Flow, Details, Text,
// and Original. What each level shows is defined by the compiler (LEVELS, readLevel); ReadingLevels lays it out.
// Details also offers "Change this": write a change in Thunder; the compiler writes the code and proves it.
import { useCallback, useState } from "react";
import { ZOOM_SAMPLES } from "./samples";
import { SAMPLE_RUN } from "./sample-run";
import { ReadingLevels, type ReadingView } from "@/components/thunder/ReadingLevels";
import { focus } from "@/components/thunder/ThunderParts";
import { ShareLink } from "@/components/thunder/ShareLink";
import { makePastedLink } from "@/lib/share-messages";

export function ZoomClient() {
  const [sampleKey, setSampleKey] = useState(ZOOM_SAMPLES[0].key);
  const sample = ZOOM_SAMPLES.find((s) => s.key === sampleKey)!;
  const [source, setSource] = useState(sample.code);
  const [view, setView] = useState<ReadingView>({ level: "big-picture", memberId: null, fn: null });
  const onViewChange = useCallback((v: ReadingView) => setView(v), []);
  const choose = (key: string) => { const s = ZOOM_SAMPLES.find((x) => x.key === key)!; setSampleKey(key); setSource(s.code); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <label className="flex flex-wrap items-center gap-2 text-sm text-haze-300">Example
          <select value={sampleKey} onChange={(e) => choose(e.target.value)} className={`min-h-11 rounded-lg border border-white/15 bg-ink-950 px-3 text-white ${focus}`}>
            {ZOOM_SAMPLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span className="text-haze-400">or open Original and edit the code.</span>
        </label>
        <ShareLink resetKey={`${sampleKey}|${view.level}|${view.fn}|${source.length}`}
          make={() => makePastedLink({ code: source, file: sample.file, fn: view.fn, level: view.level })} />
      </div>
      {/* The sample run was recorded on the example exactly as written, so it is offered only while the code is unchanged. */}
      <ReadingLevels key={sampleKey} source={source} file={sample.file} editable canChange onSourceChange={setSource} onViewChange={onViewChange}
        run={SAMPLE_RUN.sampleKey === sampleKey && source === sample.code ? SAMPLE_RUN : undefined}
        runHidden={SAMPLE_RUN.sampleKey === sampleKey && source !== sample.code ? "What happened when it ran is hidden while the code is edited: the sample run was recorded on the example's original code." : undefined} />
    </div>
  );
}
