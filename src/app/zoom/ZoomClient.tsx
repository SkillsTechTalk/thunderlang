"use client";
// Semantic Zoom: read any example (or your own code) at the five reading levels, Big Picture, Flow, Details, Text,
// and Original. What each level shows is defined by the compiler (LEVELS, readLevel); ReadingLevels lays it out.
import { useState } from "react";
import { ZOOM_SAMPLES } from "./samples";
import { ReadingLevels } from "@/components/thunder/ReadingLevels";
import { focus } from "@/components/thunder/ThunderParts";

export function ZoomClient() {
  const [sampleKey, setSampleKey] = useState(ZOOM_SAMPLES[0].key);
  const sample = ZOOM_SAMPLES.find((s) => s.key === sampleKey)!;
  const [source, setSource] = useState(sample.code);
  const choose = (key: string) => { const s = ZOOM_SAMPLES.find((x) => x.key === key)!; setSampleKey(key); setSource(s.code); };

  return (
    <div className="space-y-6">
      <label className="flex flex-wrap items-center gap-2 text-sm text-haze-300">Example
        <select value={sampleKey} onChange={(e) => choose(e.target.value)} className={`min-h-11 rounded-lg border border-white/15 bg-ink-950 px-3 text-white ${focus}`}>
          {ZOOM_SAMPLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-haze-400">or open Original and edit the code.</span>
      </label>
      <ReadingLevels key={sampleKey} source={source} file={sample.file} editable onSourceChange={setSource} />
    </div>
  );
}
