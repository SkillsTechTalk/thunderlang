import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { GALLERY } from "@/gallery/entries.mjs";
import { buildSharePath } from "@/lib/share-link.mjs";
import { PastedOrOpen } from "./PastedOrOpen";

export const metadata = pageMeta({
  title: "Share a reading: link to one function, read in Thunder",
  description: "Open a public GitHub file in Thunder, choose a function and a reading level, and copy a link that opens exactly that reading. The code is fetched and read in the browser; nothing is stored.",
  path: "/r",
});

const examples = GALLERY.slice(0, 3).map((e) => {
  const [owner, repo] = e.repo.split("/");
  return { href: buildSharePath({ owner, repo, ref: e.sha, path: e.path, fn: e.fn, level: "flow" }), label: `${e.project}: ${e.fn} (${e.language})` };
});

export default function SharePage() {
  return (
    <>
      <PageHero eyebrow="Shared readings" title="Link to one function, read in Thunder."
        intro="A shared reading opens one function at one level, Big Picture, Flow, Details, Text, or Original, for anyone with the link. Code from a public GitHub file is fetched by the reader's own browser; short pasted code travels inside the link. Nothing is stored on a server." />
      <Section className="!pt-8"><PastedOrOpen examples={examples} /></Section>
    </>
  );
}
