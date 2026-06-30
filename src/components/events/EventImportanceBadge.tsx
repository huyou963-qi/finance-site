import type { EventImportance } from "@/lib/data/marketEvents";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";

const STYLE: Record<EventImportance, string> = {
  LOW: "border-fs-border/80 bg-fs-elevated text-fs-muted",
  MEDIUM: "border-sky-800/60 bg-sky-950/40 text-sky-200",
  HIGH: "border-amber-800/60 bg-amber-950/40 text-amber-200",
  CRITICAL: "border-rose-800/70 bg-rose-950/50 text-rose-200",
};

export function EventImportanceBadge({
  importance,
  className = "",
}: {
  importance: EventImportance;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 rounded border px-1.5 py-0 text-[10px] font-medium ${STYLE[importance]} ${className}`}
    >
      {EVENT_IMPORTANCE_LABELS[importance]}
    </span>
  );
}
