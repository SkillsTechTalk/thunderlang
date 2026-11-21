"use client";

// Ecosystem handoff tracking. When a visitor clicks a link to another Skills Tech property (OpenThunder,
// Skills Tech Talk, ThunderLang, SkillsTech, Skills Tech Network), this adds UTM tags so the destination's analytics
// can see where the visit came from, and records an "ecosystem_handoff" event here. Mark that event as a key event
// in GA4 so a successful handoff no longer counts as a bounce. It never fires on its own and changes no other link.
import { useEffect } from "react";

const SITE = "thunderlang";
const ECOSYSTEM = [/(^|\.)openthunder\.(dev|ai)$/, /(^|\.)skillstechtalk\.com$/, /(^|\.)thunderlang\.dev$/, /(^|\.)skillstech\.dev$/];

type Gtag = (command: "event", name: string, params: Record<string, string>) => void;

function placementOf(a: HTMLAnchorElement): string {
  const explicit = a.closest<HTMLElement>("[data-placement]")?.dataset.placement;
  if (explicit) return explicit;
  const section = a.closest<HTMLElement>("section[id], nav, header, footer");
  const where = section?.id || section?.tagName.toLowerCase() || "page";
  const page = window.location.pathname.replace(/\/$/, "").split("/").filter(Boolean).join("-") || "home";
  return `${page}:${where}`;
}

export function EcosystemHandoff() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.host === window.location.host || !ECOSYSTEM.some((re) => re.test(url.hostname))) return;
      const placement = placementOf(a);
      if (!url.searchParams.has("utm_source")) {
        url.searchParams.set("utm_source", SITE);
        url.searchParams.set("utm_medium", "referral");
        url.searchParams.set("utm_campaign", placement);
        a.href = url.toString();
      }
      const gtag = (window as unknown as { gtag?: Gtag }).gtag;
      gtag?.("event", "ecosystem_handoff", { destination: url.hostname, placement, link_text: (a.textContent ?? "").trim().slice(0, 80), transport_type: "beacon" });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
