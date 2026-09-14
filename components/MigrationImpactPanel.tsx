"use client";

import { GOAL_LABELS, TICK_SIZE, type SeriesPoint, type SessionEvent, type SessionSymbol } from "@/lib/types";
import { computeMigrationImpacts, formatHorizon, formatHorizonList, IMPACT_HORIZONS_SEC } from "@/lib/impact";
import { formatEtTime } from "@/lib/format";

function TicksCell({ ticks }: { ticks: number | null }) {
  if (ticks == null) return <span className="text-text-faint">—</span>;
  if (ticks === 0) return <span className="text-text-faint">0</span>;
  const up = ticks > 0;
  return (
    <span className={up ? "text-volt" : "text-press"}>
      {up ? "+" : ""}
      {ticks}
    </span>
  );
}

export default function MigrationImpactPanel({
  symbol,
  series,
  events,
  selectedId,
  onSelect,
}: {
  symbol: SessionSymbol;
  series: SeriesPoint[];
  events: SessionEvent[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  const impacts = computeMigrationImpacts(series, events, TICK_SIZE[symbol]);

  if (impacts.length === 0) return null;

  // Media de |movimiento| a 30 min, sobre las migraciones donde ya se
  // conoce el resultado — la métrica que persigues: cuánto mueve el precio
  // una migración de volumen "típica".
  const midHorizon = 1800;
  const midMoves = impacts.map((i) => i.moves.find((m) => m.horizonSec === midHorizon)?.ticks).filter((t): t is number => t != null);
  const avgAbs = midMoves.length > 0 ? midMoves.reduce((s, t) => s + Math.abs(t), 0) / midMoves.length : null;
  const biggest = midMoves.length > 0 ? midMoves.reduce((b, t) => (Math.abs(t) > Math.abs(b) ? t : b), 0) : null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-panel/80 shadow-[0_0_0_1px_rgba(255,179,0,0.05),0_20px_60px_-30px_rgba(255,179,0,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-sm tracking-wide text-text-dim">
            IMPACTO DE LAS MIGRACIONES EN EL PRECIO
          </h2>
          <p className="mt-1 text-xs text-text-faint">
            Ticks que se movió el precio tras cada migración de volumen entre goals — {formatHorizonList()} después.
          </p>
        </div>
        {avgAbs != null && (
          <div className="flex gap-2 font-[family-name:var(--font-mono)] text-xs">
            <span className="rounded-full border border-border bg-panel-2 px-3 py-1.5 text-text-dim">
              media {formatHorizon(midHorizon)}: <span className="text-amber">{avgAbs.toFixed(1)} ticks</span>
            </span>
            {biggest != null && (
              <span className="rounded-full border border-border bg-panel-2 px-3 py-1.5 text-text-dim">
                mayor movimiento: <TicksCell ticks={biggest} />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="font-[family-name:var(--font-mono)] text-[10px] tracking-wider text-text-faint">
              <th className="px-5 py-2 font-normal">HORA</th>
              <th className="px-3 py-2 font-normal">MIGRACIÓN</th>
              <th className="px-3 py-2 font-normal">VOLUMEN</th>
              {IMPACT_HORIZONS_SEC.map((h) => (
                <th key={h} className="px-3 py-2 text-right font-normal">
                  {formatHorizon(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {impacts.map(({ event, payload, moves }) => {
              const selected = event.id === selectedId;
              return (
                <tr
                  key={event.id}
                  onClick={() => onSelect?.(event.id)}
                  className={`cursor-pointer transition ${selected ? "bg-gamma/10" : "hover:bg-panel-2/50"}`}
                  style={selected ? { boxShadow: "inset 2px 0 0 var(--gamma)" } : undefined}
                >
                  <td className="whitespace-nowrap px-5 py-2.5 font-[family-name:var(--font-mono)] text-xs text-text-faint">
                    {formatEtTime(event.ts)}
                  </td>
                  <td className="px-3 py-2.5 text-text">
                    <span className="text-amber">{GOAL_LABELS[payload.from] ?? payload.from}</span>
                    <span className="mx-1 text-text-faint">→</span>
                    <span className="text-amber">{GOAL_LABELS[payload.to] ?? payload.to}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-[family-name:var(--font-mono)] text-xs text-text-faint">
                    {payload.dropAbs.toFixed(0)} / {payload.riseAbs.toFixed(0)}
                  </td>
                  {moves.map((m) => (
                    <td key={m.horizonSec} className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)]">
                      <TicksCell ticks={m.ticks} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
