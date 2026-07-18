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
          <EcosystemMenu current="ThunderLang" />
          <Link href="/waitlist" className="btn-primary">
            Join the Waitlist
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
            <Link
              href="/waitlist"
              onClick={() => setOpen(false)}
              className="btn-primary mt-3 w-full"
            >
              Join the Waitlist
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
