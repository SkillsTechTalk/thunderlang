// Illustrations for "Why I Created Thunder". Plain SVG in the site's palette; each one is a picture of an idea, not
// a chart of data, and says so where it could be mistaken for one. Every figure has a text alternative.
import type { ReactNode } from "react";

const C = { violet: "#C4B5FD", blue: "#7FB2FF", yellow: "#FCD34D", pink: "#F472B6", orange: "#FDBA74", cyan: "#67E8F9", grey: "#9CA3AF", line: "rgba(255,255,255,0.14)", text: "#E5E7EB", dim: "#9CA3AF" };

export function Figure({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="my-10">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-850/40 p-4 sm:p-6">{children}</div>
      <figcaption className="mt-3 text-center text-sm text-haze-400">{caption}</figcaption>
    </figure>
  );
}

/** Decades of effort went one way: helping people tell computers what to do. */
export function HalfTheProblem() {
  return (
    <svg viewBox="0 0 640 230" role="img" aria-label="A thick arrow from a person to a computer labeled 'Tell computers what to do: decades of languages'. A thin dashed arrow back labeled 'Understand what they were told: still hard'." className="h-auto w-full">
      <g fontFamily="ui-sans-serif, system-ui" fill={C.text}>
        <circle cx="90" cy="105" r="34" fill="none" stroke={C.yellow} strokeWidth="3" />
        <circle cx="90" cy="94" r="10" fill={C.yellow} />
        <path d="M70 130 q20 -26 40 0" fill={C.yellow} />
        <text x="90" y="168" textAnchor="middle" fontSize="15">People</text>
        <rect x="500" y="68" width="92" height="66" rx="8" fill="none" stroke={C.cyan} strokeWidth="3" />
        <rect x="532" y="134" width="28" height="12" fill={C.cyan} opacity="0.6" />
        <text x="546" y="106" textAnchor="middle" fontSize="14" fill={C.cyan} fontFamily="ui-monospace, monospace">0101</text>
        <text x="546" y="168" textAnchor="middle" fontSize="15">Computers</text>
        <path d="M140 82 H470" stroke={C.violet} strokeWidth="12" strokeLinecap="round" />
        <path d="M466 66 L494 82 L466 98 Z" fill={C.violet} />
        <text x="305" y="58" textAnchor="middle" fontSize="14" fill={C.violet}>Tell computers what to do</text>
        <text x="305" y="40" textAnchor="middle" fontSize="12" fill={C.dim}>assembly · C · Java · Python · TypeScript …</text>
        <path d="M470 132 H150" stroke={C.grey} strokeWidth="3" strokeDasharray="8 8" />
        <path d="M156 122 L136 132 L156 142 Z" fill={C.grey} />
        <text x="305" y="160" textAnchor="middle" fontSize="14" fill={C.dim}>Understand what they were told</text>
        <text x="305" y="200" textAnchor="middle" fontSize="15" fill={C.yellow}>The half we barely worked on</text>
      </g>
    </svg>
  );
}

/** Answering one question means a trip through many files. */
export function TheTrace() {
  const stops = [
    { x: 60, label: "Button", sub: "checkout.tsx", c: C.yellow },
    { x: 185, label: "API call", sub: "orders-api.ts", c: C.cyan },
    { x: 310, label: "Service", sub: "OrderService.java", c: C.blue },
    { x: 435, label: "Query", sub: "orders.sql", c: C.orange },
    { x: 560, label: "The rule", sub: "if total >= 100 …", c: C.pink },
  ];
  return (
    <svg viewBox="0 0 640 200" role="img" aria-label="A dashed path from a button, through an API call, a service, and a database query, to the one condition that decides what happens. A question mark hangs over the path." className="h-auto w-full">
      <g fontFamily="ui-sans-serif, system-ui">
        <text x="320" y="34" textAnchor="middle" fontSize="16" fill={C.text}>“What actually happens when a user clicks this button?”</text>
        <path d="M60 110 C120 60, 140 160, 185 110 S 260 60, 310 110 S 390 160, 435 110 S 520 70, 560 110" fill="none" stroke={C.grey} strokeWidth="2.5" strokeDasharray="6 7" />
        {stops.map((s) => (
          <g key={s.label}>
            <circle cx={s.x} cy="110" r="22" fill="#0B0B12" stroke={s.c} strokeWidth="3" />
            <text x={s.x} y="152" textAnchor="middle" fontSize="13" fill={C.text}>{s.label}</text>
            <text x={s.x} y="170" textAnchor="middle" fontSize="11" fill={C.dim} fontFamily="ui-monospace, monospace">{s.sub}</text>
          </g>
        ))}
        <text x="560" y="117" textAnchor="middle" fontSize="18" fill={C.pink}>✓</text>
        <text x="60" y="117" textAnchor="middle" fontSize="16" fill={C.yellow}>▶</text>
      </g>
    </svg>
  );
}

/** Writing code gets cheaper; understanding it does not. An illustration, not measured data. */
export function TheGap() {
  return (
    <svg viewBox="0 0 640 260" role="img" aria-label="Illustration, not data: a line labeled 'code AI can write' climbs steeply over time, while a line labeled 'code people understand' stays almost flat. The space between them is labeled 'the gap Thunder addresses'." className="h-auto w-full">
      <g fontFamily="ui-sans-serif, system-ui">
        <path d="M70 220 H600 M70 220 V30" stroke={C.line} strokeWidth="2" />
        <text x="600" y="244" textAnchor="end" fontSize="12" fill={C.dim}>time →</text>
        <path d="M80 205 C250 200, 380 150, 590 45" fill="none" stroke={C.cyan} strokeWidth="4" />
        <text x="585" y="38" textAnchor="end" fontSize="14" fill={C.cyan}>Code AI can write</text>
        <path d="M80 205 C250 196, 400 188, 590 176" fill="none" stroke={C.yellow} strokeWidth="4" />
        <text x="585" y="164" textAnchor="end" fontSize="14" fill={C.yellow}>Code people understand</text>
        <path d="M460 104 V 180" stroke={C.pink} strokeWidth="2" strokeDasharray="4 5" />
        <text x="452" y="146" textAnchor="end" fontSize="14" fill={C.pink}>the gap Thunder addresses</text>
        <text x="90" y="40" fontSize="11" fill={C.dim}>Illustration, not data</text>
      </g>
    </svg>
  );
}

/** One truth, read at three depths. */
export function ThreeDepths() {
  const rows = [
    { who: "A 12-year-old", sees: "The decisions: “Refund when it is within 30 days …”", c: C.yellow, y: 40 },
    { who: "A developer", sees: "The steps, and the exact lines in Python or Java", c: C.cyan, y: 110 },
    { who: "An architect", sees: "What depends on the rule, and the evidence behind it", c: C.violet, y: 180 },
  ];
  return (
    <svg viewBox="0 0 640 260" role="img" aria-label="Three stacked layers over the same foundation. A 12-year-old sees the decisions; a developer sees the steps and exact lines; an architect sees dependencies and evidence. All rest on 'the same underlying truth'." className="h-auto w-full">
      <g fontFamily="ui-sans-serif, system-ui">
        {rows.map((r, i) => (
          <g key={r.who}>
            <rect x={40 + i * 18} y={r.y} width={560 - i * 36} height="54" rx="10" fill="#0B0B12" stroke={r.c} strokeWidth="2.5" />
            <text x={60 + i * 18} y={r.y + 23} fontSize="14" fontWeight="600" fill={r.c}>{r.who}</text>
            <text x={60 + i * 18} y={r.y + 43} fontSize="13" fill={C.text}>{r.sees}</text>
          </g>
        ))}
        <path d="M40 246 H600" stroke={C.grey} strokeWidth="3" />
        <text x="320" y="240" textAnchor="middle" fontSize="12" fill={C.dim}>the same underlying truth</text>
      </g>
    </svg>
  );
}

/** Understand first; change later, with evidence. */
export function ReadBeforeRewrite() {
  const steps = [
    { label: "Existing code", c: C.grey },
    { label: "Thunderize", c: C.violet },
    { label: "Understand", c: C.yellow },
    { label: "Verify", c: C.pink },
    { label: "Change safely", c: C.cyan },
  ];
  return (
    <svg viewBox="0 0 640 150" role="img" aria-label="Five steps left to right: existing code, Thunderize, understand, verify, change safely. Nothing is rewritten first." className="h-auto w-full">
      <g fontFamily="ui-sans-serif, system-ui">
        {steps.map((s, i) => {
          const x = 20 + i * 124;
          return (
            <g key={s.label}>
              <rect x={x} y="45" width="104" height="48" rx="24" fill="#0B0B12" stroke={s.c} strokeWidth="2.5" strokeDasharray={i === 0 ? "6 5" : undefined} />
              <text x={x + 52} y="74" textAnchor="middle" fontSize="13" fill={C.text}>{s.label}</text>
              {i < steps.length - 1 && <path d={`M${x + 106} 69 h16`} stroke={C.grey} strokeWidth="2" markerEnd="url(#arrow)" />}
            </g>
          );
        })}
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={C.grey} /></marker></defs>
        <text x="320" y="125" textAnchor="middle" fontSize="13" fill={C.dim}>No rewrite first: your code stays the source of truth.</text>
      </g>
    </svg>
  );
}
