"use client";

import type { SessionEvent } from "@/lib/types";
import { describeEvent, eventAccent, formatEtTime } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  goal_touch: "GOAL",
  saturation_armed: "SATURACIÓN",
  saturation_signal: "SEÑAL",
  goal_migration: "MIGRACIÓN",
};

const TYPE_GLYPH: Record<string, string> = {
  goal_touch: "●",
  saturation_armed: "◆",
  saturation_signal: "▲",
  goal_migration: "◆",
};

export default function EventTimeline({
  events,
  selectedId,
  onSelect,
}: {
  events: SessionEvent[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-panel/80 p-4 text-sm text-text-faint">
        No se registraron eventos en esta sesión.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-panel/80 shadow-[0_0_0_1px_rgba(89,170,248,0.05),0_20px_60px_-30px_rgba(89,170,248,0.35)]">
      <div className="border-b border-border px-4 py-3.5 font-[family-name:var(--font-heading)] text-sm tracking-wide text-text-dim">
        EVENTOS <span className="text-text-faint">({events.length})</span>
      </div>
      <ol className="max-h-[646px] overflow-y-auto divide-y divide-border/70">
        {events.map((ev) => {
          const selected = ev.id === selectedId;
          const accent = eventAccent(ev);
          return (
            <li key={ev.id}>
              <button
                type="button"
                onClick={() => onSelect?.(ev.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition ${
                  selected ? "bg-gamma/10" : "hover:bg-panel-2/60"
                }`}
                style={selected ? { boxShadow: "inset 2px 0 0 var(--gamma)" } : undefined}
              >
                <span className={`mt-0.5 shrink-0 text-[10px] ${accent}`}>{TYPE_GLYPH[ev.type] ?? "●"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-text-faint">
                      {formatEtTime(ev.ts)}
                    </span>
                    <span className={`font-[family-name:var(--font-mono)] text-[10px] font-semibold tracking-wider ${accent}`}>
                      {TYPE_LABEL[ev.type] ?? ev.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-text">{describeEvent(ev)}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
