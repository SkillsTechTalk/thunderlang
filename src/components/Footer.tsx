import Link from "next/link";
import { Logo } from "./Logo";
import { footerNav, siteConfig } from "@/lib/site";
// A short, curated set of entry-point guides for the footer , not the whole catalog
// (the full, categorized list lives on /docs and in each doc page's sidebar).
const FOOTER_GUIDES = [
  { slug: "getting-started", label: "Getting started" },
  { slug: "tutorial", label: "Tutorial" },
  { slug: "syntax-overview", label: "Syntax overview" },
  { slug: "intent-scanner", label: "Intent Scanner" },
  { slug: "spec", label: "Language specification" },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/8 bg-ink-900/50">
      <div className="container-x grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-haze-300">
            {siteConfig.tagline}. An early but serious language project by{" "}
            {siteConfig.builtBy} for the AI era.
          </p>
          <p className="mt-4 text-xs text-haze-400">
            Pre-1.0 syntax and forward-looking statements throughout. The compiler
            is real and deterministic; the ecosystem is still being built.
          </p>
          <p className="mt-4 text-xs text-haze-500">
            ThunderLang was previously introduced as IntentLang. Same language and
            vision, under a stronger, more distinctive brand.
          </p>
        </div>

        {footerNav.map((group) => (
          <div key={group.title}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-400">
              {group.title}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm link-muted">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-400">
            Guides
          </h3>
          <ul className="mt-4 space-y-2.5">
            {FOOTER_GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={`/docs/${g.slug}`} className="text-sm link-muted">
                  {g.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/docs" className="text-sm font-medium text-gold-300 hover:text-gold-200">
                Browse all docs →
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs text-haze-400 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {siteConfig.builtBy}. ThunderLang is a
            Skills Tech Talk project.
          </p>
          <p className="flex items-center gap-4">
            <span>Structured. Declarative. Verifiable. Composable.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
