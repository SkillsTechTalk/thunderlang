"use client";

import { useEffect } from "react";

/**
 * Makes the Copy buttons on the docs' code windows work: copies the block's text exactly, and says "Copied" (or
 * "Couldn't copy") for a moment, also to screen readers.
 */
export function DocCopy() {
  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-copy]");
      if (!btn) return;
      const code = btn.closest("figure")?.querySelector("pre code");
      if (!code) return;
      let ok = true;
      try { await navigator.clipboard.writeText(code.textContent ?? ""); } catch { ok = false; }
      btn.textContent = ok ? "Copied" : "Couldn't copy";
      btn.dataset.state = ok ? "done" : "failed";
      window.setTimeout(() => { btn.textContent = "Copy"; delete btn.dataset.state; }, 1600);
    };
    document.addEventListener("click", onClick);

    // "On this page": mark the section being read.
    const links = new Map(Array.from(document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="On this page"] a')).map((a) => [a.hash.slice(1), a]));
    const seen = new Set<string>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
      const heads = Array.from(document.querySelectorAll<HTMLElement>(".doc-prose h2[id]"));
      const current = heads.find((h) => seen.has(h.id)) ?? heads.filter((h) => h.getBoundingClientRect().top < 120).pop();
      links.forEach((a, id) => { if (current && id === current.id) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); });
    }, { rootMargin: "-80px 0px -60% 0px" });
    if (links.size) document.querySelectorAll(".doc-prose h2[id]").forEach((h) => io.observe(h));

    return () => { document.removeEventListener("click", onClick); io.disconnect(); };
  }, []);
  return null;
}
