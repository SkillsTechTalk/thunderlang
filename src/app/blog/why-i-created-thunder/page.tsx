import Link from "next/link";
import type { ReactNode } from "react";
import { Section, Pill, CTAButtons } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { OPENTHUNDER_URL } from "@/lib/site";
import { PlainRuleCard } from "@/app/try/PlainRuleCard";
import { readCode } from "../../../../compiler/src/read.mjs";
import { thunderText } from "../../../../compiler/src/visual.mjs";
import { Figure, HalfTheProblem, TheTrace, TheGap, ThreeDepths, ReadBeforeRewrite } from "./Illustrations";
import { getPost } from "../posts";

const post = getPost("why-i-created-thunder")!;

export const metadata = pageMeta({ title: post.title, description: post.excerpt, path: `/blog/${post.slug}` });

// The refund rule from the essay, written as ordinary Python and read by the real Thunder compiler at build time.
const REFUND_CODE = `def refund_eligibility(days_since_purchase: int, already_refunded: bool, reversible: bool) -> str:
    """A customer may receive a refund within 30 days, once, for a payment that can be reversed."""
    if days_since_purchase <= 30 and not already_refunded and reversible:
        return "Refund"
    return "Decline"
`;
const REFUND_EXAMPLES = `
Examples
  10, not already refunded, reversible       gives Refund    (well inside the window)
  30, not already refunded, reversible       gives Refund    (exactly 30 days)
  31, not already refunded, reversible       gives Decline   (one day late)
  10, already refunded, reversible           gives Decline   (refunded once already)
  10, not already refunded, not reversible   gives Decline   (the payment cannot be reversed)
`;
const refundCard = thunderText(readCode(REFUND_CODE, { language: "python" }).items[0]).trimEnd() + "\n" + REFUND_EXAMPLES;

const LADDER = [
  { level: "Thunder", what: "The visual experience", human: true },
  { level: "Thunder Text", what: "Software behavior in human-readable words", human: true },
  { level: "Traditional programming languages", what: "Java · Python · TypeScript · C# · Rust", human: false },
  { level: "Machine instructions", what: "What a processor runs", human: false },
  { level: "Bits", what: "0 and 1", human: false },
];

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-14 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-5">{children}</p>;
}
function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-white">{children}</strong>;
}
function Pull({ children }: { children: ReactNode }) {
  return <p className="my-8 border-l-2 border-gold-300/60 pl-5 text-xl font-medium leading-relaxed text-white">{children}</p>;
}

export default function WhyICreatedThunder() {
  return (
    <Section>
      <article className="mx-auto max-w-prose text-lg leading-relaxed text-haze-200">
        <Link href="/blog" className="text-sm link-muted">← All posts</Link>
        <div className="mt-6 flex items-center gap-3">
          <Pill>{post.tag}</Pill>
          <span className="text-xs text-haze-400">{post.date}</span>
          <span className="text-xs text-haze-400">· By the creator of Thunder</span>
        </div>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">Why I Created Thunder: Programming, Made Human</h1>
        <p className="mt-5 text-xl italic text-haze-300">We taught humans to write languages computers could understand. I believe it&apos;s time to create a language humans can understand.</p>

        <P>For decades, we&apos;ve been making programming languages easier for humans to write.</P>
        <P>We moved from machine instructions to assembly, from assembly to languages like C, and eventually to Java, Python, C#, TypeScript, and many others.</P>
        <P>Each generation introduced new abstractions. We became better at hiding the complexity of computers, organizing software, and helping developers build increasingly sophisticated applications.</P>
        <P>But I&apos;ve been thinking about something.</P>
        <Pull>What if we&apos;ve been solving only half the problem?</Pull>
        <P>We&apos;ve spent decades making it easier for humans to tell computers what to do.</P>
        <P>We haven&apos;t spent nearly enough time making it easier for humans to understand what computers have been told to do.</P>
        <Figure caption="Decades of languages helped people tell computers what to do. Understanding what they were told stayed hard."><HalfTheProblem /></Figure>
        <P>That distinction is why I created Thunder.</P>

        <H2>The problem I kept seeing</H2>
        <P>As an application architect, I&apos;ve spent years working with software systems, understanding how their components interact, reviewing architectural decisions, and helping engineering teams build and maintain applications.</P>
        <P>One of the most difficult parts of software engineering isn&apos;t necessarily writing code.</P>
        <P>It&apos;s understanding code.</P>
        <P>Open an unfamiliar application, and you might encounter thousands of files, dozens of services, complicated dependencies, database operations, event handlers, configuration files, and business rules scattered across multiple layers.</P>
        <P>You can be an experienced engineer and still spend hours figuring out something as simple as:</P>
        <P><em className="text-white">What actually happens when a user clicks this button?</em></P>
        <P>You follow a method into another class, trace an API call into another service, inspect a database query, and eventually find a condition that controls an important business decision.</P>
        <Figure caption="One question, five files, three languages, and the answer is a single condition at the end."><TheTrace /></Figure>
        <P>Sometimes the code is well written. Sometimes it isn&apos;t.</P>
        <P>Either way, understanding the system requires translating implementation details into a mental model of what the application actually does.</P>
        <P>And that mental model is what I find most valuable.</P>
        <P>When I examine a system, I don&apos;t ultimately care whether a business rule was implemented using Java, Python, or TypeScript.</P>
        <P>I want to understand the rule.</P>
        <P>I want to know why it exists, what triggers it, what it affects, and what happens when something goes wrong.</P>
        <Pull>The programming language is the implementation. The behavior is what matters.</Pull>
        <P>Yet we&apos;ve made source code the primary interface for understanding software.</P>
        <P>I started wondering whether that needed to remain true.</P>

        <H2>Then AI changed the equation</H2>
        <P>Artificial intelligence has accelerated a transformation in software engineering.</P>
        <P>Today, AI can generate functions, implement features, write tests, refactor code, and help developers navigate unfamiliar systems.</P>
        <P>And its capabilities are improving rapidly.</P>
        <P>I expect AI to write an increasing proportion of the code we use.</P>
        <P>But that creates a fascinating problem.</P>
        <Pull>If AI writes most of our code, who is going to understand it?</Pull>
        <P>Who is going to explain why a customer was denied access?</P>
        <P>Who will understand why an order was processed twice?</P>
        <P>Who will determine whether a change violates an important business rule?</P>
        <P>Who will take responsibility when the generated implementation is technically valid but does the wrong thing?</P>
        <P>We can delegate implementation to machines.</P>
        <P>We cannot simply delegate responsibility.</P>
        <P>In fact, as AI makes code generation easier, I believe understanding software will become more important, not less.</P>
        <P>Generating a thousand lines of code is becoming inexpensive.</P>
        <P>Understanding the consequences of those thousand lines is still difficult.</P>
        <Figure caption="An illustration of the idea, not measured data: writing code is getting cheaper much faster than understanding it."><TheGap /></Figure>
        <P>And generating more code doesn&apos;t automatically solve that problem.</P>
        <P>It can make it worse.</P>
        <P>That&apos;s the gap I want Thunder to address.</P>

        <H2>What if programming didn&apos;t look like programming?</H2>
        <P>Imagine opening an application and being able to explore its behavior without first learning its implementation language.</P>
        <P>Instead of opening dozens of source files, you see the major capabilities of the application.</P>
        <P>You select one.</P>
        <P>Thunder shows what the capability does, which rules govern it, what decisions it makes, and how it interacts with the rest of the system.</P>
        <P>You can follow the flow visually.</P>
        <P>Or you can read a plain-language representation.</P>
        <P>For example, consider a refund system.</P>
        <P>Traditional source code might contain several methods, validation classes, database queries, and API integrations.</P>
        <P>Thunder could present the essential business decision in a form like this:</P>
        <div className="my-6 rounded-2xl border border-white/10 bg-ink-850/40 p-5">
          <p className="font-semibold text-white">Refund Eligibility</p>
          <p className="mt-2">A customer may receive a refund when:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>The purchase was made within the last 30 days.</li>
            <li>The purchase has not already been refunded.</li>
            <li>The payment is eligible for reversal.</li>
          </ul>
          <p className="mt-3">When the conditions are satisfied, the system may proceed with the refund.</p>
          <p className="mt-2">Otherwise, the request is declined with an explanation.</p>
        </div>
        <P>You can understand that description without knowing how to program.</P>
        <P>Here is that same rule today: five lines of Python, read by the Thunder compiler into a card you can question. Pick a number of days and see what happens.</P>
        <figure className="my-8 space-y-4">
          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{REFUND_CODE}</code></pre>
          <PlainRuleCard initialSource={refundCard} breadcrumb={["Refunds", "refund_eligibility"]} />
          <figcaption className="text-center text-sm text-haze-400">Read from the code by the Thunder compiler when this page was built; no AI. The examples were added by a person to check the rule.</figcaption>
        </figure>
        <P>Now imagine clicking a condition and seeing exactly where it&apos;s implemented, which other parts of the application depend on it, and what evidence supports Thunder&apos;s interpretation.</P>
        <P>That&apos;s the experience I&apos;m working toward.</P>
        <P>Not a simplified drawing that hides important details.</P>
        <P>A different way to explore the actual behavior of software.</P>

        <H2>A programming language a 12-year-old could understand</H2>
        <P>One of my ambitions for Thunder is simple to explain and extremely difficult to achieve.</P>
        <P>I want a 12-year-old to be able to open a simple program and understand what it does.</P>
        <P>Not because they memorized programming syntax.</P>
        <P>Not because they completed a Java course.</P>
        <P>Because the program communicates its behavior in a language they can understand.</P>
        <P>Consider how we learn other complex subjects.</P>
        <P>We use illustrations, diagrams, explanations, examples, and progressively deeper levels of detail.</P>
        <P>We don&apos;t begin by forcing everyone to understand the most technical representation of a subject.</P>
        <P>Why should software be different?</P>
        <P>Of course, understanding a program&apos;s purpose is not the same as mastering algorithms, distributed systems, security, or performance engineering.</P>
        <P>Thunder should not pretend otherwise.</P>
        <P>But I believe we can dramatically lower the barrier to understanding software without sacrificing the depth professionals need.</P>
        <P>A beginner should be able to follow the main decisions.</P>
        <P>An experienced developer should be able to inspect the underlying implementation.</P>
        <P>An architect should be able to explore dependencies and system behavior.</P>
        <P>And someone responsible for a business process should be able to understand the rules that affect their work.</P>
        <Figure caption="Different depths of understanding, built on the same underlying truth."><ThreeDepths /></Figure>
        <P>All through the same environment.</P>
        <P>Different levels of understanding, built on the same underlying truth.</P>

        <H2>Thunder is more than a new syntax</H2>
        <P>I don&apos;t want to create yet another programming language that requires developers to memorize new keywords, punctuation, and conventions.</P>
        <P>We already have excellent programming languages.</P>
        <P>I want to introduce an abstraction above them.</P>
        <P>The model I envision looks something like this:</P>
        <ol className="my-8 space-y-2" aria-label="From Thunder down to bits">
          {LADDER.map((r, i) => (
            <li key={r.level} className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${r.human ? "border-gold-300/40 bg-gold-400/[0.06]" : "border-white/10"}`} style={{ marginLeft: `${i * 0.75}rem` }}>
              <span className={`font-semibold ${r.human ? "text-gold-200" : "text-white"}`}>{r.level}</span>
              <span className="text-right text-sm text-haze-300">{r.what}</span>
            </li>
          ))}
        </ol>
        <P>This is a conceptual hierarchy, not a requirement that one representation literally compile into the next.</P>
        <P>Thunder is the visual experience.</P>
        <P>Thunder Text is the human-readable representation of software behavior.</P>
        <P>Both should reflect a shared understanding of the application&apos;s logic.</P>
        <P>Underneath, software may still be implemented in Java, Python, TypeScript, C#, Rust, or another language.</P>
        <P>The point is that the person trying to understand the application shouldn&apos;t always have to start there.</P>
        <P>They should be able to start with meaning.</P>
        <P>I think of this direction as <Strong>Human-Native Programming</Strong>.</P>
        <P>A way of interacting with software where human understanding is the primary design goal, rather than an afterthought.</P>
        <P>The implementation language remains important, but it no longer needs to be the only way people can read and reason about their applications.</P>

        <H2>Reading software should come before rewriting it</H2>
        <P>There&apos;s another principle behind Thunder that matters deeply to me.</P>
        <P>I don&apos;t believe developers should have to rewrite their applications to benefit from a new programming paradigm.</P>
        <P>We have decades of existing software.</P>
        <P>Businesses have invested enormous resources in applications written in traditional languages.</P>
        <P>Those systems aren&apos;t going away simply because a new language appears.</P>
        <P>That&apos;s why one of Thunder&apos;s most important capabilities is what I call <em className="text-white">Thunderizing</em> an application.</P>
        <P>Take an existing codebase.</P>
        <P>Analyze its behavior.</P>
        <P>Build a navigable representation of its structure, decisions, relationships, and rules.</P>
        <P>Then allow people to explore it visually or through Thunder Text.</P>
        <Figure caption="Understand first. Verification and safe change come after, with evidence."><ReadBeforeRewrite /></Figure>
        <P>The first goal isn&apos;t to change the application.</P>
        <P>It&apos;s to understand it.</P>
        <P>Once that understanding exists, verification and safe modification become possible extensions of the experience.</P>
        <P>People should be able to ask what happens if a rule changes, inspect the affected behavior, and examine the evidence before accepting a modification.</P>
        <P>And when Thunder cannot confidently determine something, it needs to say so.</P>
        <P>A useful abstraction should make complexity understandable.</P>
        <Pull>It should never turn uncertainty into false confidence.</Pull>

        <H2>I don&apos;t want Thunder to replace engineers</H2>
        <P>Some people might interpret this vision as removing the need for developers to learn traditional programming languages.</P>
        <P>That&apos;s not how I see it.</P>
        <P>I believe the role of software engineers is evolving.</P>
        <P>As AI handles more implementation work, engineers will need to become increasingly skilled at understanding requirements, evaluating tradeoffs, designing systems, recognizing risks, and verifying behavior.</P>
        <P>Those are difficult responsibilities.</P>
        <P>They&apos;re also the parts of engineering I find most intellectually rewarding.</P>
        <P>I don&apos;t want Thunder to eliminate that work.</P>
        <P>I want it to make that work more accessible and effective.</P>
        <P>Instead of spending so much time translating syntax into understanding, developers should be able to spend more time reasoning about what software should do.</P>
        <P>They should be able to understand code they didn&apos;t write.</P>
        <P>Review changes they didn&apos;t personally implement.</P>
        <P>And take ownership of systems whose complexity extends beyond any one developer&apos;s knowledge.</P>
        <P>This is especially important in an AI-driven world.</P>
        <P>If AI can produce an implementation in seconds, we need a better way for humans to understand what was produced.</P>

        <H2>The last programming language you need to learn?</H2>
        <P>I have an ambitious long-term vision for Thunder.</P>
        <Pull>I want Thunder to become the last language someone needs to learn to understand software.</Pull>
        <P>That doesn&apos;t mean traditional programming languages will disappear.</P>
        <P>It doesn&apos;t mean every application can be reduced to a simple diagram.</P>
        <P>And it doesn&apos;t mean expertise will become unnecessary.</P>
        <P>It means I want to move the starting point of software understanding above the level of implementation syntax.</P>
        <P>I want someone who knows Thunder to be able to explore applications written in different languages without repeatedly beginning from zero.</P>
        <P>I want a developer moving from a Java application to a Python service to recognize the underlying behavior through a familiar interface.</P>
        <P>I want a technical lead to understand how a feature works without tracing every method manually.</P>
        <P>I want a product owner to understand a business rule without needing an engineer to translate the entire implementation.</P>
        <P>And I want a curious child to explore a program and begin understanding its logic before learning their first traditional programming language.</P>
        <P>That&apos;s a much bigger ambition than creating another developer tool.</P>
        <P>It&apos;s an attempt to change how we interact with software.</P>

        <H2>Why I&apos;m building OpenThunder</H2>
        <P>Thunder is the representation and experience.</P>
        <P>OpenThunder is the environment I&apos;m building around it.</P>
        <div className="my-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">The language</p>
            <p className="mt-1 text-xl font-semibold text-white">Thunder</p>
            <p className="mt-2 text-sm text-haze-300">What software means, as pictures and Thunder Text.</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">The IDE</p>
            <p className="mt-1 text-xl font-semibold text-white">OpenThunder</p>
            <p className="mt-2 text-sm text-haze-300">Where you open a whole application and read, trace, and change it.</p>
          </div>
        </div>
        <P>My goal is to make it possible to open an existing application, understand its behavior, inspect its implementation, trace important decisions, and eventually make changes with greater confidence.</P>
        <P>This is not a finished vision.</P>
        <P>There are difficult technical problems to solve, especially when interpreting large codebases, dynamic behavior, distributed systems, and code whose real behavior depends on runtime conditions.</P>
        <P>I don&apos;t want to pretend those challenges are trivial.</P>
        <P>But I believe the direction is worth pursuing.</P>
        <P>The more software we create, the more we need ways to understand it.</P>
        <P>And the more AI participates in writing that software, the more important human understanding becomes.</P>

        <H2>Programming, made human</H2>
        <P>For most of computing history, we&apos;ve focused on improving the languages humans use to communicate with machines.</P>
        <P>That work has transformed the world.</P>
        <P>But we&apos;re entering an era in which machines can increasingly write those languages themselves.</P>
        <P>So perhaps the next major advancement isn&apos;t another language that&apos;s easier for machines to execute.</P>
        <P>Perhaps it&apos;s a language that&apos;s easier for humans to understand.</P>
        <P>A language that communicates intent.</P>
        <P>A language that exposes decisions.</P>
        <P>A language that makes complex software navigable.</P>
        <P>A language that helps people remain responsible for the systems they create, even when AI contributes much of the implementation.</P>
        <P>That&apos;s why I created Thunder.</P>
        <P>Not because I believe we need another way to write code.</P>
        <Pull>Because I believe we need a fundamentally better way to understand it.</Pull>
        <P>And if we get that right, programming could become accessible to far more people than it is today.</P>
        <p className="mt-10 text-center text-2xl font-semibold text-white">Thunder. <span className="text-gradient-gold">Programming, made human.</span></p>

        <div className="mt-12 flex flex-wrap justify-center gap-3 border-t border-white/8 pt-8">
          <CTAButtons primary={{ href: "/learn", label: "Learn to read Thunder" }} secondary={{ href: "/language", label: "The Thunder language" }} />
          <a href={OPENTHUNDER_URL} className="btn-ghost">OpenThunder ↗</a>
        </div>
      </article>
    </Section>
  );
}
