/**
 * Inline vector of the Intent four-point star mark.
 * Recreated as SVG so it scales crisply, needs no network request, and can be
 * tinted/animated. Mirrors the gold "sparkle" logo in the brand assets.
 */
export function StarMark({
  className = "h-8 w-8",
  title = "Intent",
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
        <linearGradient id="ilStarGrad" x1="20" y1="10" x2="80" y2="92">
          <stop offset="0%" stopColor="#FCEFD6" />
          <stop offset="45%" stopColor="#F5C97A" />
          <stop offset="100%" stopColor="#E09A45" />
        </linearGradient>
        <radialGradient id="ilStarCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F8DDA9" />
        </radialGradient>
      </defs>
      {/* Outer four-point star built from a concave diamond */}
      <path
        d="M50 3 C54 30 70 46 97 50 C70 54 54 70 50 97 C46 70 30 54 3 50 C30 46 46 30 50 3 Z"
        fill="none"
        stroke="url(#ilStarGrad)"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      {/* Inner sparkle */}
      <path
        d="M50 30 C51.6 43 57 48.4 70 50 C57 51.6 51.6 57 50 70 C48.4 57 43 51.6 30 50 C43 48.4 48.4 43 50 30 Z"
        fill="url(#ilStarCore)"
      />
    </svg>
  );
}
