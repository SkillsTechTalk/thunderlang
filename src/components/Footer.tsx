import Link from "next/link";
import { Logo } from "./Logo";
import { siteConfig } from "@/lib/site";
import { NAV_GROUPS, TRUST_LINKS, groupLinks, isExternal, type NavLink } from "@/lib/navigation";

// The footer repeats the header's four groups (same names, same order) and adds the fine print, so a page is found
// in the same place whichever way you look.
function FooterLink({ link }: { link: NavLink }) {
  const label = <>{link.label}{isExternal(link.href) && <span aria-label="(opens another site)"> ↗</span>}{link.status && <span className="text-haze-500"> ({link.status.toLowerCase()})</span>}</>;
  return isExternal(link.href)
    ? <a href={link.href} target="_blank" rel="noreferrer noopener" className="text-sm link-muted">{label}</a>
    : <Link href={link.href} className="text-sm link-muted">{label}</Link>;
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/8 bg-ink-900/50">
      <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(5,1fr)]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-haze-300">
            {siteConfig.tagline}. The Thunder™ programming language (also called ThunderLang™) is open source; OpenThunder is the IDE for AI-written code. An early but serious project by{" "}
            {siteConfig.builtBy}.
          </p>
          <p className="mt-4 text-xs text-haze-400">
            The language may still change before 2.0, and some pages describe plans. The compiler is real and
            deterministic; <Link href="/roadmap" className="underline decoration-white/30 underline-offset-2 hover:text-haze-200">see what works today</Link>.
          </p>
          <p className="mt-4 text-xs text-haze-500">
            ThunderLang was previously introduced as IntentLang. Same language and
            vision, under a stronger, more distinctive brand.
          </p>
        </div>

        {[...NAV_GROUPS.map((g) => ({ title: g.title, links: groupLinks(g) })), { title: "Fine print", links: TRUST_LINKS }].map((group) => (
          <div key={group.title}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-400">{group.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((l) => <li key={l.href}><FooterLink link={l} /></li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/8">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-xs text-haze-400 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {siteConfig.builtBy}. ThunderLang™ is a
            Skills Tech Talk project. Thunder™ and ThunderLang™ are trademarks of Skills Tech Talk, LLC.
          </p>
          <p className="flex items-center gap-4">
            <span>AI writes the code. Humans understand the logic.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
