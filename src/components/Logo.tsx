import Link from "next/link";
import { StarMark } from "./StarMark";

/** Wordmark lockup: bolt mark + "Thunder" (white) / "Lang" (bolt gradient), then what it is: "Programming Language". */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 ${className}`}
      aria-label="ThunderLang, the programming language: home"
    >
      <StarMark className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
      <span className="text-lg font-semibold tracking-tight">
        <span className="text-white">Thunder</span>
        <span className="text-gradient-gold">Lang</span>
        <sup className="ml-0.5 align-super text-[0.55em] font-semibold text-haze-300">™</sup>
      </span>
      <span className="hidden whitespace-nowrap border-l border-white/15 pl-2.5 text-xs font-medium text-haze-300 min-[420px]:inline sm:text-sm lg:hidden xl:inline">Programming Language</span>
    </Link>
  );
}
