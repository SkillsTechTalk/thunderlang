"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NavItem } from "@/lib/site";

// The "Learn" nav dropdown: groups the reading/reference surfaces (docs, examples, articles, blog,
// the agents page) so the primary header stays lean. Click to toggle; closes on outside click or Escape.
export function LearnMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1 text-sm text-haze-300 transition-colors hover:text-haze-100"
      >
        Learn
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-white/10 bg-ink-900/95 p-2 shadow-xl backdrop-blur">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-haze-200 transition hover:bg-white/5 hover:text-white"
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
