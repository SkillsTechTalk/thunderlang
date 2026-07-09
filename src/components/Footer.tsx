import Link from "next/link";
import { Logo } from "./Logo";
import { footerNav, siteConfig } from "@/lib/site";
import { getDocList } from "@/lib/docs";

export function Footer() {
  const guides = getDocList();
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
            Draft syntax and forward-looking statements throughout. Nothing here
            is production-ready yet.
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
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={`/docs/${g.slug}`} className="text-sm link-muted">
                  {g.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs text-haze-400 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {siteConfig.builtBy}. IntentLang is a
            SkillsTech project.
          </p>
          <p className="flex items-center gap-4">
            <span>Structured. Declarative. Verifiable. Composable.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
