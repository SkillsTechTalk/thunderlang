// Structured data (schema.org JSON-LD): tells search engines plainly what this site is about. The Thunder
// programming language (also called ThunderLang), its open-source compiler, and the tutorial. Everything here is
// also said in words on the page it describes.
import { siteConfig, LEARN_COURSE_URL, OPENTHUNDER_URL } from "@/lib/site";
import { PUBLISHED_VERSION, NPM_PACKAGE } from "@/lib/facts";

const URL = siteConfig.url;
const REPO = "https://github.com/SkillsTechTalk/thunderlang";
const NPM = `https://www.npmjs.com/package/${NPM_PACKAGE}`;
const MARKETPLACE = "https://marketplace.visualstudio.com/items?itemName=openthunder.thunderlang";

const PUBLISHER = { "@type": "Organization", "@id": `${URL}/#publisher`, name: "SkillsTech", url: URL };

/** The language itself: the entity people search for as "Thunder programming language". */
const LANGUAGE = {
  "@type": "ComputerLanguage",
  "@id": `${URL}/#thunder`,
  name: "Thunder",
  alternateName: ["ThunderLang", "Thunder programming language", "Thunder language"],
  description:
    "Thunder is a human-native programming language: it shows what software does as pictures and plain words, read exactly from code in eleven languages (SQL included) by an open-source compiler. OpenThunder is its IDE.",
  url: `${URL}/language`,
  sameAs: [REPO, NPM],
};

/** Every page: the site, its publisher, and the language it is about. */
export const SITE_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${URL}/#website`,
      name: "Thunder Programming Language",
      alternateName: ["ThunderLang", "thunderlang.dev"],
      url: URL,
      description: siteConfig.description,
      publisher: { "@id": `${URL}/#publisher` },
      about: { "@id": `${URL}/#thunder` },
      inLanguage: "en",
    },
    PUBLISHER,
    LANGUAGE,
  ],
};

/** The install page: the compiler and CLI people download. */
export const COMPILER_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ThunderLang compiler (thunder)",
  alternateName: NPM_PACKAGE,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Windows, Linux (Node.js 18 or newer)",
  softwareVersion: PUBLISHED_VERSION,
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  downloadUrl: NPM,
  installUrl: `${URL}/install`,
  codeRepository: REPO,
  sameAs: [NPM, REPO, MARKETPLACE],
  about: { "@id": `${URL}/#thunder` },
  publisher: { "@id": `${URL}/#publisher` },
  url: `${URL}/install`,
};

/** The tutorial: free lessons on reading software in Thunder, and the full course. */
export const COURSE_LD = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "Learn Thunder: read software in the Thunder programming language",
  description:
    "Twelve short, free lessons on reading software in Thunder: shapes, things, flow, steps, rule cards, actions, Thunder Text, and reading a whole app in OpenThunder. Every quiz answer is worked out by the Thunder compiler.",
  url: `${URL}/learn`,
  provider: PUBLISHER,
  about: { "@id": `${URL}/#thunder` },
  isAccessibleForFree: true,
  educationalLevel: "Beginner",
  inLanguage: "en",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", category: "Free" },
  hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "PT10M" },
  sameAs: [LEARN_COURSE_URL],
};

/** The language page: Thunder, and its IDE. */
export const LANGUAGE_LD = {
  "@context": "https://schema.org",
  ...LANGUAGE,
  subjectOf: [
    { "@type": "WebPage", url: `${URL}/language`, name: "The Thunder Programming Language" },
    { "@type": "SoftwareApplication", name: "OpenThunder, the IDE for Thunder", url: OPENTHUNDER_URL, applicationCategory: "DeveloperApplication" },
  ],
};

/** Renders one JSON-LD block. The data is our own constants, so it is safe to inline. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
