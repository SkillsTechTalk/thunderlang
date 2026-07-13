import { CapabilityStatus, STATUS_LABEL, STATUS_STYLE } from "@/lib/capabilities";

/** A single source-of-truth status chip: Available / Experimental / Concept preview / Planned. */
export function StatusBadge({ status, className = "" }: { status: CapabilityStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
