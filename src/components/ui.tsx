import Link from "next/link";
import type { ReactNode } from "react";

export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`py-16 sm:py-20 ${className}`}>
      <div className="container-x">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      {intro && (
        <p className="mt-4 text-lg leading-relaxed text-haze-300">{intro}</p>
      )}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`panel p-6 transition-colors hover:border-white/20 ${className}`}
    >
      {children}
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs font-medium text-haze-200">
      {children}
    </span>
  );
}

export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-white/8">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:44px_44px] opacity-40" />
      <div className="container-x relative py-16 sm:py-20">
        <div className="max-w-3xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
          {intro && (
            <p className="mt-5 text-lg leading-relaxed text-haze-300">{intro}</p>
          )}
          {children && <div className="mt-8">{children}</div>}
        </div>
      </div>
    </header>
  );
}

export function CTAButtons({
  primary,
  secondary,
}: {
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {primary && (
        <Link href={primary.href} className="btn-primary">
          {primary.label}
        </Link>
      )}
      {secondary && (
        <Link href={secondary.href} className="btn-ghost">
          {secondary.label}
        </Link>
      )}
    </div>
  );
}

/** Small inline note used to flag draft / forward-looking content. */
export function DraftNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gold-300/25 bg-gold-300/[0.06] px-4 py-3 text-sm text-gold-100">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-gold-300"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 8v5M12 16h.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
