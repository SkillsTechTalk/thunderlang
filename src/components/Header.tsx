"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { EcosystemMenu } from "./EcosystemMenu";
import { mainNav } from "@/lib/site";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-ink-950/80 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-haze-300 transition-colors hover:text-haze-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href="https://github.com/SkillsTechTalk/thunderlang"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="ThunderLang on GitHub"
            className="text-haze-300 transition-colors hover:text-haze-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.8c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 016 0C17 4.4 18 4.7 18 4.7c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
            </svg>
          </a>
          <EcosystemMenu current="ThunderLang" />
          <Link href="/docs/getting-started" className="btn-primary">
            Get started
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-haze-200 md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            {open ? (
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/8 bg-ink-900/95 md:hidden">
          <nav className="container-x flex flex-col py-4" aria-label="Mobile">
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-sm text-haze-200"
              >
                {item.label}
              </Link>
            ))}
            <a
              href="https://github.com/SkillsTechTalk/thunderlang"
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setOpen(false)}
              className="py-2.5 text-sm text-haze-200"
            >
              GitHub
            </a>
            <Link
              href="/docs/getting-started"
              onClick={() => setOpen(false)}
              className="btn-primary mt-3 w-full"
            >
              Get started
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
