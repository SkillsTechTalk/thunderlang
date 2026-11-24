// Which infrastructure or delivery format a file is (spec section 12), from its path and, when the path is not
// enough, its first lines. One table, so readers for later formats plug in by turning their row on. Browser-safe.

const base = (p) => p.slice(p.lastIndexOf('/') + 1);
const isYaml = (p) => /\.ya?ml$/i.test(p);

/**
 * Formats, in the order they are checked. `reader: true` means Thunder reads it today; the others are hooks for the
 * readers in spec section 12, recognized but not read yet (readableFile gives null for them).
 */
export const FORMAT_FILES = [
  { format: 'dockerfile', reader: true, match: (p) => (/^(Dockerfile|Containerfile)(\.[\w.-]+)?$/i.test(base(p)) && !/\.(md|txt|dockerignore)$/i.test(p)) || /\.dockerfile$/i.test(p) },
  { format: 'github-actions', reader: true, match: (p) => /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(p) },
  { format: 'terraform', reader: true, match: (p) => /\.tf$/i.test(p) },
  { format: 'bicep', reader: true, match: (p) => /\.bicep$/i.test(p) },
  { format: 'docker-compose', reader: true, match: (p) => /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/i.test(base(p)) || /\.compose\.ya?ml$/i.test(base(p)) },
  // Hooks for the next readers (not read yet):
  { format: 'azure-pipelines', reader: false, match: (p) => /(^|\/)azure-pipelines(\.[\w-]+)?\.ya?ml$/i.test(p) },
  { format: 'helm', reader: false, match: (p) => /(^|\/)Chart\.ya?ml$/.test(p) },
  // Kubernetes YAML is known by its content: `apiVersion:` and `kind:` near the top.
  { format: 'kubernetes', reader: true, match: (p, head) => isYaml(p) && /^apiVersion:\s*\S/m.test(head) && /^kind:\s*\S/m.test(head) },
];

/** The infrastructure or delivery format of a file, read or not (null when it is none of them). */
export function formatOf(path, head = '') {
  const p = String(path).replace(/\\/g, '/');
  for (const f of FORMAT_FILES) if (f.match(p, String(head ?? ''))) return f;
  return null;
}

/** The format Thunder reads for this path today, or null. */
export function readableFormat(path, head = '') {
  const f = formatOf(path, head);
  return f?.reader ? f.format : null;
}
