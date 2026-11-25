// The social preview for a reading: an image of the names only (repository, file, function, level). It never
// fetches or draws the code, so a preview costs nothing and shows nothing the link doesn't already say.
export function readingOgImage({ repo, path, fn, level }: { repo: string; path: string; fn: string | null; level: string }) {
  const q = new URLSearchParams({ repo, path, level });
  if (fn) q.set("fn", fn);
  return { url: `/og/reading?${q.toString()}`, width: 1200, height: 630, alt: `${fn ?? path} from ${repo}, read in Thunder` };
}
