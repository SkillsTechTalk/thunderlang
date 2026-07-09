"use client";

import { useEffect, useRef, useState } from "react";

// Lazy-load mermaid once (it is a large, browser-only library).
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        themeVariables: {
          background: "transparent",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          primaryColor: "#141B2E",
          primaryTextColor: "#EAF0FA",
          primaryBorderColor: "#F5C97A",
          secondaryColor: "#0E1322",
          tertiaryColor: "#0E1322",
          lineColor: "#6B778D",
          textColor: "#C7D1E2",
          nodeBorder: "#F5C97A",
          clusterBkg: "#0E1322",
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let seq = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mmd-${++seq}`);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadMermaid()
      .then(async (mermaid) => {
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not render diagram.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="rounded-xl border border-white/10 bg-ink-900/80 p-4 text-xs text-haze-400">
        Could not draw the diagram. The Mermaid source is available below.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-white/10 bg-ink-900/60 p-4">
      {loading && (
        <p className="py-8 text-center text-xs text-haze-500">Drawing diagram…</p>
      )}
      <div ref={ref} className="mermaid-host flex justify-center [&_svg]:max-w-full" />
    </div>
  );
}
