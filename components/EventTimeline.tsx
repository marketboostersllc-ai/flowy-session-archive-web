import type { SessionEvent } from "@/lib/types";
import { describeEvent, eventAccent, formatEtTime } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  goal_touch: "GOAL",
  saturation_armed: "SATURACIÓN",
  saturation_signal: "SEÑAL",
  goal_migration: "MIGRACIÓN",
};

export default function EventTimeline({ events }: { events: SessionEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel p-4 text-sm text-text-faint">
        No se registraron eventos en esta sesión.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-panel">
      <div className="border-b border-border px-4 py-3 font-[family-name:var(--font-heading)] text-sm tracking-wide text-text-dim">
        EVENTOS ({events.length})
      </div>
      <ol className="max-h-[580px] overflow-y-auto divide-y divide-border">
        {events.map((ev) => (
          <li key={ev.id} className="flex gap-3 px-4 py-3 text-sm">
            <span className="shrink-0 font-[family-name:var(--font-mono)] text-text-faint">
              {formatEtTime(ev.ts)}
            </span>
            <div className="min-w-0">
              <span
                className={`mr-2 font-[family-name:var(--font-mono)] text-[10px] font-semibold tracking-wider ${eventAccent(ev)}`}
              >
                {TYPE_LABEL[ev.type] ?? ev.type}
              </span>
              <span className="text-text">{describeEvent(ev)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
