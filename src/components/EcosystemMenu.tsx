"use client";

import { useEffect, useRef, useState } from "react";

// Skills Tech ecosystem app-switcher (the 9-dots menu): every product with the one label that says what it is,
// so a visitor knows each one at a glance. Self-contained: no app
// brand deps, dark-theme friendly. Pass `current` to mark this app.
const PRODUCTS = [
  { name: "ThunderLang", sub: "Programming Language", href: "https://thunderlang.dev", logo: "/brand/thunderlang.svg" },
  { name: "OpenThunder", sub: "IDE for AI-Written Code", href: "https://openthunder.dev", logo: "/brand/openthunder-mark.png" },
  { name: "Skills Tech Talk", sub: "AI Interview", href: "https://app.skillstechtalk.com", logo: "/brand/skills-tech-talk.png" },
  { name: "TuneHabit", sub: "Habit Tracker", href: "https://tunehabit.com", logo: "/brand/tunehabit.png" },
  { name: "GrappleTree", sub: "BJJ Study Guide", href: "https://grappletree.app", logo: "/brand/grappletree.svg" },
  { name: "VibeShape", sub: "AI App Builder", href: "https://vibeshape.app", logo: "/brand/vibeshape.png" },
];

export function EcosystemMenu({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Skills Tech ecosystem"
        aria-label="Skills Tech ecosystem"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg opacity-70 transition hover:bg-white/10 hover:opacity-100"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-white/10 bg-neutral-900/95 p-2 shadow-xl backdrop-blur">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Skills Tech ecosystem
          </p>
          {PRODUCTS.map((p) => {
            const isCurrent = p.name === current;
            return (
              <a
                key={p.name}
                href={p.href}
                target={isCurrent ? undefined : "_blank"}
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className={`block rounded-xl px-2 py-2 transition ${isCurrent ? "bg-white/[0.06]" : "hover:bg-white/5"}`}
              >
                <span className="flex items-center gap-3">
                  <img src={p.logo} alt="" className="h-6 w-6 shrink-0 rounded-md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {p.name}
                      {isCurrent && <span className="ml-1.5 text-[10px] font-normal text-sky-300">current</span>}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">{p.sub}</span>
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
