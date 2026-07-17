// Deterministic candidate selection , the AI generates N candidates; ThunderLang and
// OpenThunder pick the winner by MEASURABLE rules. An LLM never decides which
// candidate is best. Pure (no Node deps): browser-safe.
//
//   selection
//     require all verification checks
//     prefer lower complexity
//     prefer fewer dependencies
//     prefer smaller implementation
//     prefer better mutation score

const MIN_WORDS = new Set(['lower', 'fewer', 'smaller', 'less', 'least', 'lowest', 'minimal']);
const MAX_WORDS = new Set(['higher', 'more', 'better', 'greater', 'most', 'highest', 'larger', 'best']);

function normalizeMetric(s) {
  const t = String(s).toLowerCase();
  if (/complex/.test(t)) return 'complexity';
  if (/depend/.test(t)) return 'dependencies';
  if (/implement|size|line/.test(t)) return 'size';
  if (/alloc/.test(t)) return 'allocation';
  if (/mutation/.test(t)) return 'mutationScore';
  return t.trim().replace(/\s+/g, '_');
}

/** Parse selection-block lines into a structured, deterministic policy. */
export function parseSelection(lines) {
  const require = [];
  const prefer = [];
  for (const raw of lines || []) {
    const t = String(raw).trim().toLowerCase();
    if (/^require\b/.test(t)) {
      require.push(t.replace(/^require\s+/, ''));
    } else if (/^prefer\b/.test(t)) {
      const words = t.replace(/^prefer\s+/, '').split(/\s+/);
      const direction = MAX_WORDS.has(words[0]) ? 'max' : MIN_WORDS.has(words[0]) ? 'min' : 'min';
      prefer.push({ metric: normalizeMetric(words.slice(1).join(' ')), direction });
    }
  }
  return { require, prefer, requireAllChecks: require.some((r) => /verification|all/.test(r)) };
}

/** Deterministic metrics derivable from a code region (size / complexity / deps). */
export function regionMetrics(code) {
  const text = String(code || '');
  const size = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//') && !l.includes('intent:')).length;
  const complexity = (text.match(/\b(if|else|for|while|switch|case|catch|return)\b|&&|\|\||\?/g) || []).length;
  const dependencies = (text.match(/\b(import|require)\b/g) || []).length;
  return { size, complexity, dependencies };
}

const DEFAULT_PREFER = [
  { metric: 'complexity', direction: 'min' },
  { metric: 'dependencies', direction: 'min' },
  { metric: 'size', direction: 'min' },
];

/**
 * Select the winning candidate by measurable rules. Deterministic:
 * lexicographic by the `prefer` list, stable tiebreak by id. An unavailable metric
 * ranks last for that comparison. Candidates failing `require` are ineligible.
 * @param {{id:string, metrics:object, checksPassed?:boolean}[]} candidates
 * @param {{prefer?:{metric,direction}[], requireAllChecks?:boolean}} policy
 */
export function selectCandidate(candidates, policy = {}) {
  const prefer = policy.prefer && policy.prefer.length ? policy.prefer : DEFAULT_PREFER;
  const requireAllChecks = !!policy.requireAllChecks;
  const eligible = (candidates || []).filter((c) => (requireAllChecks ? c.checksPassed !== false : true));
  const ranked = [...eligible].sort((a, b) => {
    for (const p of prefer) {
      const av = a.metrics ? a.metrics[p.metric] : undefined;
      const bv = b.metrics ? b.metrics[p.metric] : undefined;
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av !== bv) return p.direction === 'max' ? bv - av : av - bv;
    }
    return String(a.id).localeCompare(String(b.id)); // stable tiebreak
  });
  return { winner: ranked[0] || null, ranking: ranked, eligibleCount: eligible.length, rejected: (candidates || []).length - eligible.length, prefer };
}
