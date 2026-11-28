"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { isExternal, type NavGroup, type NavLink } from "@/lib/navigation";

// One header menu (Try it, Learn, Why Thunder, Community): a button that opens a panel of links, each with the one
// line that says what you can do there. Opens on click, Enter, Space, or the down arrow; closes on Escape (focus goes
// back to the button), a click outside, or following a link. Only one menu is open at a time: the header owns which.

export function NavMenu({
  group,
  open,
  current,
  onOpenChange,
}: {
  group: NavGroup;
  open: boolean;
  /** The current page is in this group: shown on the button, so you can see where you are. */
  current: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const wide = group.sections.length > 1;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onOpenChange(false); button.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onOpenChange]);

  // Opened from the keyboard: move to the first link, so the arrow keys and Tab start inside the menu.
  const openFromKeyboard = () => {
    onOpenChange(true);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLAnchorElement>("[data-nav-link]")?.focus());
  };

  // Up and down move between the links; Home and End go to the first and last.
  const onPanelKey = (e: React.KeyboardEvent) => {
    const links = [...(ref.current?.querySelectorAll<HTMLAnchorElement>("[data-nav-link]") ?? [])];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    const go = (i: number) => { e.preventDefault(); links[(i + links.length) % links.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(links.length - 1);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={button}
        type="button"
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); openFromKeyboard(); } }}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors active:bg-white/10 ${
          open || current ? "text-white" : "text-haze-300 hover:text-haze-100"
        }`}
      >
        <span className={current ? "border-b border-gold-300/70 pb-px" : ""}>{group.title}</span>
        {current && <span className="sr-only"> (you are here)</span>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          onKeyDown={onPanelKey}
          className={`absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-2xl border border-white/10 bg-ink-900 p-3 shadow-2xl shadow-black/60 ${
            wide ? "w-[min(40rem,calc(100vw-2rem))]" : "w-80"
          }`}
        >
          <p className="px-3 pb-2 pt-1 text-xs text-haze-400">{group.says}</p>
          <div className={wide ? "grid gap-x-2 sm:grid-cols-2" : ""}>
            {group.sections.map((section, i) => (
              <div key={section.title ?? i}>
                {section.title && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-haze-500">{section.title}</p>
                )}
                <ul>
                  {section.links.map((l) => (
                    <li key={l.href}>
                      <MenuLink link={l} onPick={() => onOpenChange(false)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A menu link: its label (with ↗ when it leaves this site, and Preview or Prototype when not finished) and its line. */
export function MenuLink({ link, onPick, compact = false }: { link: NavLink; onPick?: () => void; compact?: boolean }) {
  const external = isExternal(link.href);
  const pathname = usePathname();
  const here = !external && pathname === link.href;
  const inner = (
    <>
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-haze-100 group-hover:text-white">
        {link.label}
        {external && <span aria-label="(opens another site)">↗</span>}
        {here && <span className="text-[10px] font-semibold uppercase tracking-wider text-gold-300">You are here</span>}
        {link.status && (
          <span className="rounded-full border border-white/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-haze-400">
            {link.status}
          </span>
        )}
      </span>
      {!compact && <span className="mt-0.5 block text-xs leading-snug text-haze-400">{link.says}</span>}
    </>
  );
  const cls = `group block rounded-xl px-3 py-2 transition hover:bg-white/5 focus-visible:bg-white/5 active:bg-white/10 ${here ? "bg-white/[0.04] ring-1 ring-inset ring-gold-300/25" : ""}`;
  return external ? (
    <a href={link.href} data-nav-link onClick={onPick} className={cls} target="_blank" rel="noreferrer noopener">{inner}</a>
  ) : (
    <Link href={link.href} data-nav-link onClick={onPick} className={cls} aria-current={here ? "page" : undefined}>{inner}</Link>
  );
}
