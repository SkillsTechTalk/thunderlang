"use client";
// /r: either a link that carries pasted code after the # (read it here; the code never reached the server), or,
// with nothing after the #, a place to open a public GitHub file by its address.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { focus } from "@/components/thunder/ThunderParts";
import { buildSharePath, isReadablePath, parseGitHubUrl, parsePastedFragment, type ShareLevel } from "@/lib/share-link.mjs";
import { makePastedLink } from "@/lib/share-messages";
import { SharedView } from "./SharedView";

type Pasted = { state: "checking" } | { state: "none" } | { state: "error"; reason: string } | { state: "ready"; code: string; file: string; fn: string | null; level: ShareLevel };

export function PastedOrOpen({ examples }: { examples: { href: string; label: string }[] }) {
  const [pasted, setPasted] = useState<Pasted>({ state: "checking" });
  useEffect(() => {
    let live = true;
    const check = () => parsePastedFragment(window.location.hash).then((r) => {
      if (!live) return;
      if (!r) setPasted({ state: "none" });
      else if (!r.ok) setPasted({ state: "error", reason: r.reason });
      else setPasted({ state: "ready", ...r.value });
    });
    check();
    window.addEventListener("hashchange", check);
    return () => { live = false; window.removeEventListener("hashchange", check); };
  }, []);

  if (pasted.state === "checking") return <p role="status" className="text-haze-300">Opening the link…</p>;
  if (pasted.state === "ready") {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-haze-300">
          <span className="font-medium text-white">Shared code{pasted.file ? `: ${pasted.file}` : ""}.</span> This code came inside the link itself, after the #, and was read here in your browser.
          It was never sent to thunderlang.dev, and Thunder can&apos;t say where it came from.
        </p>
        <SharedView source={pasted.code} file={pasted.file || "shared-code"} fn={pasted.fn} level={pasted.level}
          makeLink={(v) => makePastedLink({ code: pasted.code, file: pasted.file, fn: v.fn, level: v.level })} />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {pasted.state === "error" && <p role="alert" className="max-w-2xl rounded-xl border border-amber-300/40 px-4 py-3 text-amber-100">{pasted.reason}</p>}
      <OpenFromGitHub examples={examples} />
    </div>
  );
}

function OpenFromGitHub({ examples }: { examples: { href: string; label: string }[] }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [problem, setProblem] = useState("");
  const [opening, setOpening] = useState(false);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const loc = parseGitHubUrl(address);
    if (!loc) { setProblem("That isn't the address of one file on GitHub. Open the file on github.com and copy the address from your browser; it has /blob/ in it."); return; }
    if (!isReadablePath(loc.path)) { setProblem(`Thunder doesn't read “${loc.path.split("/").pop()}”. Choose a code file, such as .py, .ts, .js, .go, .rs, .java, .cs, .c, or .sql.`); return; }
    setProblem("");
    setOpening(true);
    router.push(buildSharePath({ ...loc, fn: null, level: "big-picture" }));
  }

  return (
    <section aria-labelledby="open-gh" className="max-w-2xl space-y-4">
      <h2 id="open-gh" className="text-xl font-semibold text-white">Read a public GitHub file</h2>
      <p className="text-haze-300">Paste the address of a file on GitHub. Your browser fetches it straight from GitHub and reads it in Thunder; choose a function and a level, then copy a link that opens exactly that reading for anyone.</p>
      <form onSubmit={open} noValidate className="space-y-2">
        <label htmlFor="gh-address" className="block text-sm text-haze-200">GitHub address of a file</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="gh-address" type="url" inputMode="url" value={address} onChange={(e) => { setAddress(e.target.value); setProblem(""); }}
            placeholder="https://github.com/pallets/flask/blob/3.0.3/src/flask/app.py" aria-invalid={!!problem} aria-describedby={problem ? "gh-problem" : "gh-hint"}
            className={`min-h-11 w-full rounded-xl border bg-ink-950 px-3 font-mono text-sm text-white ${problem ? "border-amber-300/60" : "border-white/15"} ${focus}`} />
          <button type="submit" disabled={opening} className={`min-h-11 shrink-0 rounded-xl bg-gold-400/90 px-5 text-sm font-semibold text-ink-950 hover:bg-gold-300 disabled:opacity-60 ${focus}`}>{opening ? "Opening…" : "Read it in Thunder"}</button>
        </div>
        {problem ? <p id="gh-problem" role="alert" className="text-sm text-amber-100">{problem}</p>
          : <p id="gh-hint" className="text-xs text-haze-400">Public repositories only; files up to 300 KB. A link to a commit always shows the same code; a link to a branch shows it as it is now.</p>}
      </form>
      {examples.length > 0 && (
        <div className="text-sm text-haze-300">
          <p>Or try one:</p>
          <ul className="mt-1 space-y-1">{examples.map((x) => <li key={x.href}><Link href={x.href} className="text-gold-300 hover:text-gold-200">{x.label}</Link></li>)}</ul>
        </div>
      )}
      <p className="text-sm text-haze-400">Pasted code instead? Use <Link href="/read" className="text-gold-300 hover:text-gold-200">Thunder Code</Link> or <Link href="/zoom" className="text-gold-300 hover:text-gold-200">Semantic Zoom</Link> and choose &ldquo;Copy link to this reading&rdquo;: short code travels inside the link itself.</p>
    </section>
  );
}
