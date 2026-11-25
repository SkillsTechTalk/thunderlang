export type GalleryEntry = {
  slug: string;
  project: string;
  title: string;
  language: string;
  repo: string;
  /** The release the commit belongs to (shown to people); `sha` is what everything is pinned to. */
  tag: string;
  sha: string;
  /** The file's path in the project. */
  path: string;
  /** The vendored file's name under src/gallery/sources/<slug>/. */
  file: string;
  /** The function, as a share link names it (memberRef). */
  fn: string;
  /** The function's lines in the file at `sha`. The build fails if the compiler finds it elsewhere. */
  lines: [number, number];
  license: { name: string; file: string; notice: string };
  /** License files vendored next to the source. */
  licenseFiles: string[];
  intro: string;
  look: string;
  /** The hand-check grade against the accuracy rubric (A or B; C and D are not kept). */
  grade: "A" | "B";
};
export declare const GALLERY: GalleryEntry[];
export declare function galleryEntry(slug: string): GalleryEntry | undefined;
