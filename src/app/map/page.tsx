import fs from "node:fs";
import path from "node:path";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { buildThunderMap } from "@/lib/thunder-map";
import { ThunderMap } from "./ThunderMap";
import { OpenThunderLink } from "@/components/OpenThunderLink";

export const metadata = pageMeta({
  title: "Thunder Atlas: read a whole app in Thunder",
  description: "A sample app read in the Thunder programming language, from services and integrations down to each rule, with a ranked list of where to look first.",
  path: "/map",
});

const ROOT = path.join(process.cwd(), "examples/thunder-map/acme-shop");

export default function MapPage() {
  const files = fs.readdirSync(ROOT).sort().flatMap(dir => fs.readdirSync(path.join(ROOT, dir)).sort()
    .map(file => ({ path: `${dir}/${file}`, source: fs.readFileSync(path.join(ROOT, dir, file), "utf8") })));
  const map = buildThunderMap("Acme Shop", files);
  return <>
    <PageHero eyebrow="Thunder Atlas · Prototype" title="Read a whole app in Thunder."
      intro="A small shop with three services in TypeScript and Python, read in Thunder. The Thunder Brief gives the big picture, the Thunder Map shows how it is built, Thunder Focus says where to look first, and every rule opens as Thunder Code. Start with Focus: two services disagree about the same refund." />
    <Section className="!pt-0">
      <ThunderMap map={map} />
      <div className="mt-8"><OpenThunderLink soon title="This map, for your own app" body="OpenThunder will build this map from your repository, keep it current with every commit, and let you learn and change your app from it." cta="Follow OpenThunder" /></div>
      <p className="mt-8 max-w-3xl text-xs leading-relaxed text-haze-400">
        Prototype. Rules come from the real Thunder code reader. Services, files, and outside connections are found with simple,
        visible patterns in this sample; in OpenThunder they come from full repository discovery. Everything here is read from
        code: Thunder shows what the code does today, and a person decides whether that is what the business wants.
      </p>
    </Section>
  </>;
}
