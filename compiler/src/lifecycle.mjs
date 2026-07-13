// Temporal + lifecycle semantics (Gap 2). IL owns the formal state-machine IR and the
// STATIC model analysis (well-formedness, reachability, dead-ends) on the DECLARED
// lifecycle. OpenThunder verifies the IMPLEMENTED reality against this IR and produces
// counterexample traces. Pure (no Node deps): browser-safe. Deterministic.

/**
 * Build the formal IR for one lifecycle: states, terminals, the initial state (the one
 * with no inbound transition), the adjacency map, and the reachable set from initial.
 */
export function buildLifecycle(lc) {
  const states = [...new Set(lc.states || [])];
  const terminals = [...new Set(lc.terminals || [])];
  const transitions = lc.transitions || [];
  const out = {};
  for (const s of states) out[s] = [];
  for (const t of transitions) if (out[t.from]) out[t.from].push(t.to);
  // initial = the first declared state (the canonical start). The earlier "first state with no
  // inbound transition" heuristic was wrong whenever the start state has a back-edge: in a cycle
  // (e.g. A -> B -> A) every cyclic state has inbound, so it wrongly picked an isolated terminal.
  const initial = states[0] ?? null;
  // reachability (DFS from initial).
  const reachable = new Set();
  const stack = initial ? [initial] : [];
  while (stack.length) {
    const s = stack.pop();
    if (reachable.has(s)) continue;
    reachable.add(s);
    for (const n of out[s] || []) stack.push(n);
  }
  return { name: lc.name, states, terminals, initial, transitions, out, reachable: [...reachable].sort() };
}

/** Static analysis of a declared lifecycle. Returns { ir, findings } (deterministic). */
export function analyzeLifecycle(lc) {
  const ir = buildLifecycle(lc);
  const stateSet = new Set(ir.states);
  const reachable = new Set(ir.reachable);
  const findings = [];

  for (const t of lc.transitions || []) {
    for (const [side, s] of [['from', t.from], ['to', t.to]]) {
      if (s && !stateSet.has(s)) findings.push({ code: 'IL-LIFE-001', message: `Transition "${t.name || '(unnamed)'}" ${side} references undefined state "${s}".` });
    }
  }
  for (const term of ir.terminals) {
    if (!stateSet.has(term)) findings.push({ code: 'IL-LIFE-001', message: `Terminal "${term}" is not a declared state.` });
    else if ((ir.out[term] || []).length) findings.push({ code: 'IL-LIFE-002', message: `Terminal state "${term}" has an outgoing transition.` });
  }
  for (const s of ir.states) {
    if (!reachable.has(s)) findings.push({ code: 'IL-LIFE-003', message: `State "${s}" is unreachable from the initial state.` });
    else if (!ir.terminals.includes(s) && (ir.out[s] || []).length === 0) {
      findings.push({ code: 'IL-LIFE-004', message: `Non-terminal state "${s}" has no outgoing transition (dead end).` });
    }
  }
  return { ir, findings };
}
