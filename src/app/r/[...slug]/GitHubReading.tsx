"use client";
// A shared reading of a public GitHub file. The browser fetches the file straight from raw.githubusercontent.com
// (no server in between, nothing stored), caps its size, and reads it with the Thunder compiler.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ReadingView } from "@/components/thunder/ReadingLevels";
import { focus } from "@/components/thunder/ThunderParts";
import { MAX_FILE_BYTES, buildSharePath, githubFileUrl, isReadablePath, rawFileUrl, type FileLocation, type ShareLevel } from "@/lib/share-link.mjs";
import { makeGitHubLink } from "@/lib/share-messages";
import { SharedView } from "../SharedView";

type Load =
  | { state: "loading" }
  | { state: "error"; title: string; body: string; retry: boolean }
  | { state: "ready"; source: string };

const kb = (n: number) => `${Math.round(n / 1024).toLocaleString("en-US")} KB`;
const CACHE = "thunderlang-r:";

/** Fetch the file, stopping as soon as it passes the size limit. */
async function fetchFile(loc: FileLocation, signal: AbortSignal): Promise<Load> {
  const url = rawFileUrl(loc);
  // A file already fetched in this tab is not fetched again (GitHub limits how often files can be fetched).
  try { const hit = sessionStorage.getItem(CACHE + url); if (hit != null) return { state: "ready", source: hit }; } catch {}
  let res: Response;
  try { res = await fetch(url, { signal }); } catch (e) {
    if (signal.aborted) throw e;
    return { state: "error", title: "Couldn't reach GitHub", body: "The file could not be fetched. Check your connection, then try again.", retry: true };
  }
  const where = `${loc.owner}/${loc.repo}, ${loc.path} at “${loc.ref}”`;
  if (res.status === 404) return { state: "error", title: "No public file at this address", body: `GitHub has no public file at ${where}. Check the spelling and the branch, tag, or commit. Private repositories can't be read here: your browser fetches the file without signing in to GitHub.`, retry: false };
  if (res.status === 429 || res.status === 403) return { state: "error", title: "GitHub is limiting requests", body: "GitHub is limiting how often files can be fetched from your network right now. Wait a minute, then try again.", retry: true };
  if (!res.ok) return { state: "error", title: "GitHub didn't send the file", body: `GitHub answered with status ${res.status}. Try again in a moment.`, retry: true };
  const declared = Number(res.headers.get("content-length") ?? 0);
  const tooLarge = (size: number, exact: boolean): Load => ({ state: "error", title: "This file is too large to read from a link", body: `It is ${exact ? "" : "more than "}${kb(exact ? size : MAX_FILE_BYTES)}; shared readings fetch files up to ${kb(MAX_FILE_BYTES)} so they open quickly in any browser. Read it with the Thunder command line (thunder read ${loc.path.split("/").pop()}) or in OpenThunder, or link to a smaller file.`, retry: false });
  if (declared > MAX_FILE_BYTES) { res.body?.cancel().catch(() => {}); return tooLarge(declared, false); } // the header can be the compressed size, so only "more than" is certain
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES) { reader.cancel().catch(() => {}); return tooLarge(size, false); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  const source = new TextDecoder("utf-8").decode(bytes);
  if (source.includes("\u0000")) return { state: "error", title: "This doesn't look like a code file", body: "The file contains binary data, so there is nothing for Thunder to read.", retry: false };
  try { sessionStorage.setItem(CACHE + url, source); } catch {}
  return { state: "ready", source };
}

export function GitHubReading({ loc, fn, level }: { loc: FileLocation; fn: string | null; level: ShareLevel }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const readable = isReadablePath(loc.path);

  useEffect(() => {
    if (!readable) return;
    const ctrl = new AbortController();
    setLoad({ state: "loading" });
    fetchFile(loc, ctrl.signal).then(setLoad, () => {});
    return () => ctrl.abort();
  }, [loc, readable, attempt]);

  // Keep the address bar on what is shown, so copying it from the browser shares the same reading.
  const onView = useCallback((v: ReadingView) => {
    try { window.history.replaceState(window.history.state, "", buildSharePath({ ...loc, fn: v.fn, level: v.level })); } catch {}
  }, [loc]);

  const fileLink = githubFileUrl(loc);
  if (!readable) {
    const ext = /\.[^./]+$/.exec(loc.path)?.[0];
    return (
      <ErrorPanel title="Thunder doesn't read this kind of file" fileLink={fileLink}
        body={`${ext ? `“${ext}” files aren't code Thunder reads.` : "Thunder can't tell what language this file is in."} It reads Python, TypeScript, JavaScript, Go, Rust, Java, C#, C, C++, Kotlin, PHP, Ruby, Swift, SQL, R, shell, and PowerShell, plus Dockerfiles, Terraform, Bicep, Kubernetes and Compose YAML, and GitHub Actions workflows.`} />
    );
  }
  if (load.state === "loading") {
    return <p role="status" aria-live="polite" className="rounded-2xl border border-white/10 p-5 text-haze-300">Fetching {loc.path.split("/").pop()} from GitHub and reading it…</p>;
  }
  if (load.state === "error") {
    return <ErrorPanel title={load.title} body={load.body} fileLink={fileLink} onRetry={load.retry ? () => setAttempt((n) => n + 1) : undefined} />;
  }
  return (
    <div className="space-y-4">
      <SharedView source={load.source} file={loc.path} fn={fn} level={level} onView={onView}
        githubHref={(lines) => githubFileUrl(loc, lines)}
        makeLink={(v) => makeGitHubLink(loc, v.fn, v.level)} />
      <p className="text-xs leading-relaxed text-haze-400">
        Your browser fetched this file from GitHub and the Thunder compiler read it here, by pattern and with no AI; nothing was sent to or stored by
        thunderlang.dev. A link to a branch shows the file as it is now; a link to a commit always shows the same code.
      </p>
    </div>
  );
}

function ErrorPanel({ title, body, fileLink, onRetry }: { title: string; body: string; fileLink: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="max-w-2xl rounded-2xl border border-amber-300/40 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-haze-200">{body}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {onRetry && <button type="button" onClick={onRetry} className={`min-h-11 rounded-xl border border-white/20 px-4 text-sm font-medium text-white hover:bg-white/10 ${focus}`}>Try again</button>}
        <a href={fileLink} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm text-haze-200 hover:text-white ${focus}`}>Look on GitHub <span aria-hidden="true">&nbsp;↗</span></a>
        <Link href="/r" className={`inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm text-haze-200 hover:text-white ${focus}`}>Open another file</Link>
      </div>
    </div>
  );
}
