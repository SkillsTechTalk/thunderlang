"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { EcosystemMenu } from "./EcosystemMenu";
import { NavMenu, MenuLink } from "./NavMenu";
import { NAV_GROUPS, OPENTHUNDER_URL, GITHUB_URL, PRIMARY_ACTION, groupOf } from "@/lib/navigation";

// The header: four questions a visitor comes with (Try it, Learn, Why Thunder, Community), the group of the page you
// are on marked, and one main button whose label says where it goes. On phones the same groups open as sections.
export function Header() {
  const pathname = usePathname() ?? "/";
  const here = groupOf(pathname);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);

  // A new page closes every menu; on phones the section for the page you are on starts open.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
    setMobileGroup(groupOf(pathname)?.title ?? null);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-ink-950/80 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-2 lg:flex" aria-label="Primary">
          {NAV_GROUPS.map((g) => (
            <NavMenu
              key={g.title}
              group={g}
              open={openMenu === g.title}
              current={here?.title === g.title}
              onOpenChange={(o) => setOpenMenu(o ? g.title : null)}
            />
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="ThunderLang source on GitHub (opens another site)"
            title="Source on GitHub"
            className="text-haze-300 transition-colors hover:text-haze-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.8c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 016 0C17 4.4 18 4.7 18 4.7c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
            </svg>
          </a>
          <EcosystemMenu current="ThunderLang" />
          <a
            href={OPENTHUNDER_URL}
            title="OpenThunder, the IDE for AI-written code (another site)"
            className="whitespace-nowrap rounded-full border border-gold-300/40 px-3.5 py-1.5 text-sm font-medium text-gold-200 transition hover:border-gold-300/70 hover:bg-gold-300/10"
          >
            OpenThunder ↗
          </a>
          <Link href={PRIMARY_ACTION.href} className="btn-primary whitespace-nowrap">
            {PRIMARY_ACTION.label}
          </Link>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 px-2.5 text-sm text-haze-200 active:bg-white/10 lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {mobileOpen ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
          <span className="hidden sm:inline">{mobileOpen ? "Close" : "Menu"}</span>
        </button>
      </div>

      {mobileOpen && (
        <div id="mobile-menu" className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/8 bg-ink-900 lg:hidden">
          <nav className="container-x flex flex-col py-3" aria-label="Mobile">
            <Link href={PRIMARY_ACTION.href} className="btn-primary mb-3 w-full">{PRIMARY_ACTION.label}</Link>
            {NAV_GROUPS.map((g) => {
              const expanded = mobileGroup === g.title;
              const id = `mobile-${g.title.replace(/\W+/g, "-").toLowerCase()}`;
              return (
                <div key={g.title} className="border-b border-white/8 last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={id}
                    onClick={() => setMobileGroup(expanded ? null : g.title)}
                    className="flex w-full items-center justify-between py-3 text-left active:bg-white/5"
                  >
                    <span>
                      <span className="block text-base font-medium text-white">
                        {g.title}
                        {here?.title === g.title && <span className="ml-2 text-xs font-normal text-gold-300">You are here</span>}
                      </span>
                      <span className="block text-xs text-haze-400">{g.says}</span>
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`shrink-0 text-haze-300 transition-transform ${expanded ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {expanded && (
                    <div id={id} className="pb-3">
                      {g.sections.map((s, i) => (
                        <div key={s.title ?? i}>
                          {s.title && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-haze-500">{s.title}</p>}
                          <ul>{s.links.map((l) => <li key={l.href}><MenuLink link={l} /></li>)}</ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <a href={OPENTHUNDER_URL} className="mt-3 py-2.5 text-sm font-medium text-gold-200">OpenThunder, the IDE for AI-written code ↗</a>
          </nav>
        </div>
      )}
    </header>
  );
}
