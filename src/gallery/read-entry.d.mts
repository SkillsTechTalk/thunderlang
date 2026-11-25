import type { GalleryEntry } from "./entries.mjs";
export type GalleryReading = {
  source: string;
  licenses: { file: string; text: string }[];
  memberId: string;
  label: string;
  youGive: string[];
  youGetBack: string | null;
  /** Every step Thunder found. */
  steps: number;
  /** Steps put into words. */
  explained: number;
  /** Steps shown as code because Thunder can't explain them yet. */
  notExplained: number;
  text: string;
  stops: number;
  endings: number;
};
export declare function sourcesDir(slug: string, root?: string): string;
export declare function readGalleryEntry(entry: GalleryEntry, root?: string): GalleryReading;
