/**
 * ThunderLang lightning-bolt mark. Exported as `StarMark` so every existing
 * usage across the site re-skins to the bolt without renaming imports.
 * Electric violet → cyan, echoing the wordmark gradient.
 */
export function StarMark({
  className = "h-8 w-8",
  title = "ThunderLang",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id="tlBoltGrad" x1="30" y1="6" x2="70" y2="94">
          <stop offset="0%" stopColor="#EDE9FE" />
          <stop offset="45%" stopColor="#B49BFF" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id="tlBoltGlow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="rgba(124,92,240,0.55)" />
          <stop offset="100%" stopColor="rgba(124,92,240,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#tlBoltGlow)" />
      {/* Lightning bolt */}
      <path
        d="M56 6 L26 54 L46 54 L40 94 L74 40 L52 40 L56 6 Z"
        fill="url(#tlBoltGrad)"
        stroke="url(#tlBoltGrad)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
