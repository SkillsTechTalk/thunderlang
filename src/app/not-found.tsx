import Link from "next/link";
import { StarMark } from "@/components/StarMark";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <StarMark className="h-12 w-12 animate-twinkle" />
      <p className="mt-6 font-mono text-sm text-gold-300">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-white">
        This intent could not be resolved.
      </h1>
      <p className="mt-3 max-w-md text-haze-300">
        The page you&apos;re looking for doesn&apos;t exist, or hasn&apos;t been
        written yet.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn-primary">
          Back home
        </Link>
        <Link href="/docs" className="btn-ghost">
          Read the docs
        </Link>
      </div>
    </div>
  );
}
