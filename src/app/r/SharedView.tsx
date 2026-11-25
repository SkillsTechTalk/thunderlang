"use client";
// One shared reading: the code someone linked to, read in the browser with the Thunder compiler, opened at the
// function and level in the link. Used by GitHub links (/r/owner/repo/ref/path) and pasted-code links (/r#code=…).
import { useCallback, useMemo, useState } from "react";
import { thunderModel } from "../../../compiler/src/model.mjs";
import type { ThunderModel } from "../../../compiler/src/model.d.mts";
import { ReadingLevels, type ReadingView } from "@/components/thunder/ReadingLevels";
import { ShareLink, type MadeLink } from "@/components/thunder/ShareLink";
import { findMemberByRef, memberRef, type ShareLevel } from "@/lib/share-link.mjs";

export function SharedView({ source, file, fn, level, makeLink, githubHref, onView }: {
  source: string; file: string; fn: string | null; level: ShareLevel;
  makeLink: (view: ReadingView) => Promise<MadeLink> | MadeLink;
  /** The file (or the shown function's lines) on GitHub, when the code came from there. */
  githubHref?: (lines: [number, number] | null) => string;
  onView?: (view: ReadingView) => void;
}) {
  const model = useMemo<ThunderModel | null>(() => { try { return thunderModel([{ path: file, source }], { name: file }) as ThunderModel; } catch { return null; } }, [source, file]);
  const target = useMemo(() => (model ? findMemberByRef(model.members, fn) : null), [model, fn]);
  const [view, setView] = useState<ReadingView>({ level, memberId: target?.id ?? null, fn: target && model ? memberRef(target, model.members) : null });
  const onViewChange = useCallback((v: ReadingView) => { setView(v); onView?.(v); }, [onView]);

  if (!model) {
    return <p role="alert" className="rounded-xl border border-amber-300/40 p-4 text-amber-100">Thunder could not read this file. It may be incomplete, or written in a way the reader doesn&apos;t handle yet. Nothing was guessed.</p>;
  }
  const shown = model.members.find((m) => m.id === view.memberId) ?? null;

  return (
    <div className="space-y-5">
      {fn && !target && (
        <p role="status" className="rounded-xl border border-amber-300/40 px-4 py-3 text-sm text-amber-100">
          Thunder can&apos;t find a function called &ldquo;{fn}&rdquo; in this file. It may have been renamed or moved in this version. Showing the whole file instead.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-ink-850/40 p-4">
        <div className="space-y-1 text-sm">
          <p className="text-haze-300">You are reading <span className="font-medium text-white">{shown ? shown.label : "the whole file"}</span>{shown && <span className="text-haze-400"> · lines {shown.lines[0]}–{shown.lines[1]}</span>}</p>
          {githubHref && (
            <a href={githubHref(shown ? shown.lines : null)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:text-gold-200">
              {shown ? `See lines ${shown.lines[0]}–${shown.lines[1]} on GitHub` : "See the file on GitHub"} <span aria-hidden="true">&nbsp;↗</span><span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
        <ShareLink resetKey={`${view.level}|${view.fn}`} make={() => makeLink(view)} />
      </div>
      <ReadingLevels source={source} file={file} model={model} initialFocusId={target?.id} initialLevel={level} onViewChange={onViewChange} />
    </div>
  );
}
