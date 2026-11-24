import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { LEARN_COURSE_URL } from "@/lib/site";
import { readCode } from "../../../compiler/src/read.mjs";
import { thunderText, visualFor } from "../../../compiler/src/visual.mjs";
import { thunderModel, modelText } from "../../../compiler/src/model.mjs";
import type { ThunderModel } from "../../../compiler/src/model.d.mts";
import { READ_LESSONS } from "../../../compiler/src/learn-lessons.mjs";
import { learnThunder } from "../../../compiler/src/learn.mjs";
import { LearnThunder, type BuiltLesson } from "./LearnThunder";
import { JsonLd, COURSE_LD } from "@/components/JsonLd";

export const metadata = pageMeta({
  title: "Learn the Thunder Programming Language",
  description:
    "Twelve short lessons on reading software in Thunder, the human-native programming language: steps, rule cards, actions, Thunder Text, and the same meaning in any language. No install, no programming experience needed.",
  path: "/learn",
});

const squash = (s: string) => s.replace(/[_\s]/g, "").toLowerCase();

/**
 * Read every lesson's code with the real Thunder compiler at build time. A lesson whose code does not produce what
 * it teaches fails the build instead of shipping a wrong picture.
 */
function build(): BuiltLesson[] {
  // The quick-check answers come from @skillstech/thunderlang/learn: worked out by the compiler, and the build fails
  // if any lesson disagrees with it.
  const quizOf = new Map(learnThunder().lessons.map((l) => [l.slug, l.questions]));
  return READ_LESSONS.map((lesson) => ({ ...buildOne(lesson), quiz: quizOf.get(lesson.slug) ?? [] }));
}

function buildOne(lesson: (typeof READ_LESSONS)[number]): Omit<BuiltLesson, "quiz"> {
  {
    if (lesson.show === "openthunder") {
      const file = lesson.files[0];
      const items = readCode(file.code, { language: file.language }).items;
      const rule = items.find((i) => i.kind === "decision");
      if (!rule) throw new Error(`Lesson "${lesson.slug}": the app has no rule.`);
      return { slug: lesson.slug, title: lesson.title, idea: lesson.idea, picture: lesson.picture, show: lesson.show, questions: lesson.questions, views: [],
        app: {
          name: "Pizza shop", file: "orders.py", code: file.code,
          actions: items.filter((i) => i.route).map((i) => ({ route: `${i.route!.method} ${i.route!.path}`, label: i.label ?? i.name, doc: i.doc ?? null, steps: (i.steps ?? []) as BuiltLesson["views"][number]["steps"] })),
          rule: { label: rule.label ?? rule.name, doc: rule.doc ?? null, text: thunderText(rule) },
        } };
    }
    // Lessons drawn from the model (a whole Thing, or one member's flow) rather than from one reading.
    if (lesson.show === "shapes" || lesson.show === "howto" || lesson.show === "thing" || lesson.show === "flow") {
      const model = lesson.files.length ? (thunderModel(lesson.files.map((f) => ({ path: `lesson.${f.language === "python" ? "py" : "ts"}`, source: f.code }))) as ThunderModel) : null;
      const target = model && (lesson.show === "thing" ? model.things.find((t) => t.name === lesson.focus) : model.members.find((m) => m.name === lesson.focus));
      if (model && !target) throw new Error(`Lesson "${lesson.slug}": the model has no ${lesson.focus}.`);
      const code = lesson.files[0]?.code ?? "";
      return { slug: lesson.slug, title: lesson.title, idea: lesson.idea, picture: lesson.picture, show: lesson.show, questions: lesson.questions, views: [],
        ...(model && target ? { model, focusId: target.id, text: modelText(model, target.id), code, codeLabel: lesson.files[0].label } : {}) };
    }
    const views = lesson.files.map((file) => {
      const item = readCode(file.code, { language: file.language }).items.find((i) => squash(i.name) === squash(lesson.focus));
      if (!item) throw new Error(`Lesson "${lesson.slug}": ${file.label} has no function named ${lesson.focus}.`);
      const text = thunderText(item);
      return {
        label: file.label,
        code: file.code,
        visual: visualFor(item),
        steps: (item.steps ?? []) as BuiltLesson["views"][number]["steps"],
        doc: item.doc ?? null,
        text,
        cardSource: item.kind === "decision" && lesson.examples ? text.trimEnd() + "\n" + lesson.examples : null,
      };
    });
    if (lesson.show === "compare" && views.some((v) => v.text !== views[0].text)) {
      throw new Error(`Lesson "${lesson.slug}": the languages do not give identical Thunder.`);
    }
    return { slug: lesson.slug, title: lesson.title, idea: lesson.idea, picture: lesson.picture, show: lesson.show, questions: lesson.questions, views };
  }
}

function CourseLink({ lead }: { lead: string }) {
  return (
    <p className="mx-auto max-w-3xl rounded-xl border border-gold-400/30 bg-gold-400/5 px-5 py-4 text-sm text-haze-200">
      {lead}{" "}
      <a href={LEARN_COURSE_URL} className="font-semibold text-gold-200 hover:text-gold-100">
        Take the full ThunderLang course on Skills Tech Talk ↗
      </a>
    </p>
  );
}

export default function LearnPage() {
  return (
    <>
      <JsonLd data={COURSE_LD} />
      <PageHero
        eyebrow="Learn Thunder · Twelve short lessons · No install"
        title="Read software in Thunder."
        intro="Thunder is a human-native programming language: it shows what software does as pictures and plain words. These lessons use one small pizza-delivery app. You don't need to know any programming language. Every picture here was made from real code by the Thunder compiler."
      />
      <Section className="!pt-0">
        <CourseLink lead="These lessons teach you to read Thunder. To learn Thunder and ThunderLang in depth, with practice and progress:" />
        <div className="mt-10">
          <LearnThunder lessons={build()} />
        </div>
        <div className="mt-12">
          <CourseLink lead="Finished the lessons? Keep going:" />
        </div>
      </Section>
    </>
  );
}
