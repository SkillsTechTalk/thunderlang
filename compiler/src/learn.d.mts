/** A quiz question. `answer` was worked out by the compiler from the lesson's code. */
export interface LearnQuestion { prompt: string; choices: string[]; answer: string; explain: string }

export interface LearnLesson {
  slug: string;
  title: string;
  /** What the lesson teaches, in plain words. */
  idea: string;
  /** A picture to hold in mind. */
  picture: string;
  part: 'read' | 'write';
  /** Write lessons: the programming concept it teaches ("Loops and lists: do something for each item"). */
  concept?: string;
  /** Write lessons: what to type in a terminal to do it yourself, in order. */
  commands?: string[];
  /** Write lessons: what the lesson's program prints, worked out by running it on the Thunder engine. */
  output?: string;
  /** The lesson's code (the first file), or null for lessons with no code. */
  snippet: { language: string; code: string } | null;
  /** Every file the lesson shows (a lesson can show the same rule in several languages). */
  snippets: { language: string; label: string; code: string }[];
  /** The Thunder Text the compiler gives for the lesson's focus, or null. */
  thunderText: string | null;
  questions: LearnQuestion[];
  /** Open questions to think about, with a model answer. */
  reflect: { prompt: string; answer: string }[];
}

export interface LearnThunder {
  schema: 'thunder-learn-v1';
  /** The compiler (and language) version these lessons were built against. */
  languageVersion: string;
  lessons: LearnLesson[];
}

export const LEARN_SCHEMA: 'thunder-learn-v1';
/** Build the tutorial. Throws if any lesson's expected answer disagrees with the compiler. */
export function learnThunder(): LearnThunder;
/** The lesson sources (code, wording, and the checks that work out each answer). */
export const READ_LESSONS: any[];
/** Part 2, write and run: programs whose answers are worked out by running them (no Python needed). */
export const WRITE_LESSONS: any[];
