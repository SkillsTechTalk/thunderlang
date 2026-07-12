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

const ExpandIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mmd-${++seq}`);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Inline render.
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

  // Render a fresh (unique-id) copy into the fullscreen modal when opened.
  useEffect(() => {
    if (!expanded) return;
    setZoom(1);
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        const { svg } = await mermaid.render(`${idRef.current}-modal`, code);
        if (!cancelled && modalRef.current) modalRef.current.innerHTML = svg;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [expanded, code]);

  // Esc closes; +/- zoom; lock body scroll while open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(0.5, z - 0.25));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  if (error) {
    return (
      <div className="rounded-xl border border-white/10 bg-ink-900/80 p-4 text-xs text-haze-400">
        Could not draw the diagram. The Mermaid source is available below.
      </div>
    );
  }

  return (
    <>
      <div className="group relative overflow-auto rounded-xl border border-white/10 bg-ink-900/60 p-4">
        {loading && (
          <p className="py-8 text-center text-xs text-haze-500">Drawing diagram…</p>
        )}
        {!loading && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Expand diagram"
            aria-label="Expand diagram"
            className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-ink-900/80 px-2 py-1 text-[11px] font-medium text-haze-300 opacity-0 backdrop-blur transition-opacity hover:border-gold-300/40 hover:text-gold-200 focus:opacity-100 group-hover:opacity-100"
          >
            <ExpandIcon />
            Expand
          </button>
        )}
        <div ref={ref} className="mermaid-host flex justify-center [&_svg]:max-w-full" />
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink-950/90 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded diagram"
          onClick={() => setExpanded(false)}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <span className="text-xs font-medium text-haze-300">Contract map</span>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center rounded-md border border-white/12 bg-ink-900/80">
                <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="px-2.5 py-1 text-sm text-haze-300 hover:text-white" aria-label="Zoom out">−</button>
                <span className="w-12 text-center text-[11px] tabular-nums text-haze-400">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="px-2.5 py-1 text-sm text-haze-300 hover:text-white" aria-label="Zoom in">+</button>
              </div>
              <button type="button" onClick={() => setZoom(1)} className="rounded-md border border-white/12 bg-ink-900/80 px-2.5 py-1 text-[11px] text-haze-300 hover:text-white">Reset</button>
              <button type="button" onClick={() => setExpanded(false)} className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-ink-900/80 px-2.5 py-1 text-[11px] text-haze-300 hover:border-gold-300/40 hover:text-gold-200" aria-label="Close">
                <CloseIcon />
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6" onClick={() => setExpanded(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              className="mx-auto w-fit transition-transform"
            >
              <div ref={modalRef} className="mermaid-host flex justify-center" />
            </div>
          </div>
          <div className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-haze-500">
            Scroll to pan · plus / minus to zoom · Esc to close
          </div>
        </div>
      )}
    </>
  );
}
