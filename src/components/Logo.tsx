import Link from "next/link";
import { StarMark } from "./StarMark";

/** Wordmark lockup: bolt mark + "Thunder" (white) / "Lang" (bolt gradient). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label="ThunderLang, home"
    >
      <StarMark className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
      <span className="text-lg font-semibold tracking-tight">
        <span className="text-white">Thunder</span>
        <span className="text-gradient-gold">Lang</span>
      </span>
    </Link>
  );
}
