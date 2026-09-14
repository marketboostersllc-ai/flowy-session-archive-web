"use client";

import { TICK_SIZE, type SeriesPoint, type SessionEvent, type SessionSymbol } from "@/lib/types";
import { computeArmedImpacts, computeSaturationImpacts, formatHorizon, formatHorizonList, IMPACT_HORIZONS_SEC } from "@/lib/impact";
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

export default function SaturationImpactPanel({
  kind,
  symbol,
  series,
  events,
  selectedId,
  onSelect,
}: {
  /** "armed" = entra en la banda de anomalía. "signal" = señal de reversión confirmada (vuelve a cruzar). */
  kind: "armed" | "signal";
  symbol: SessionSymbol;
  series: SeriesPoint[];
  events: SessionEvent[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  const impacts = kind === "armed" ? computeArmedImpacts(series, events, TICK_SIZE[symbol]) : computeSaturationImpacts(series, events, TICK_SIZE[symbol]);

  if (impacts.length === 0) return null;

  const title = kind === "armed" ? "IMPACTO DE LAS SATURACIONES EN EL PRECIO" : "IMPACTO DE LAS SEÑALES DE REVERSIÓN EN EL PRECIO";
  const description =
    kind === "armed"
      ? "Ticks que se movió el precio desde que el oscilador ENTRA en la banda de anomalía (antes de la señal confirmada)"
      : "Ticks que se movió el precio tras cada señal (satura y vuelve a cruzar)";

  // Media de |movimiento| al horizonte intermedio (+1 min) y acierto: % de
  // eventos en los que el precio se movió en la dirección predicha (compra
  // -> sube, venta -> baja) — ¿anticipa algo real este evento, o es ruido?
  const midHorizon = IMPACT_HORIZONS_SEC[1];
  const withMid = impacts
    .map((i) => ({ dir: i.payload.direction, ticks: i.moves.find((m) => m.horizonSec === midHorizon)?.ticks ?? null }))
    .filter((x): x is { dir: "buy" | "sell"; ticks: number } => x.ticks != null);
  const avgAbs = withMid.length > 0 ? withMid.reduce((s, x) => s + Math.abs(x.ticks), 0) / withMid.length : null;
  const hits = withMid.filter((x) => (x.dir === "buy" ? x.ticks > 0 : x.ticks < 0)).length;
  const hitRate = withMid.length > 0 ? Math.round((hits / withMid.length) * 100) : null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-panel/80 shadow-[0_0_0_1px_rgba(252,55,74,0.05),0_20px_60px_-30px_rgba(252,55,74,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-sm tracking-wide text-text-dim">{title}</h2>
          <p className="mt-1 text-xs text-text-faint">
            {description} — {formatHorizonList()} después.
          </p>
        </div>
        {avgAbs != null && (
          <div className="flex gap-2 font-[family-name:var(--font-mono)] text-xs">
            <span className="rounded-full border border-border bg-panel-2 px-3 py-1.5 text-text-dim">
              media {formatHorizon(midHorizon)}: <span className="text-press">{avgAbs.toFixed(1)} ticks</span>
            </span>
            {hitRate != null && (
              <span className="rounded-full border border-border bg-panel-2 px-3 py-1.5 text-text-dim">
                acierto ({formatHorizon(midHorizon)}): <span className="text-press">{hitRate}%</span>
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
              <th className="px-3 py-2 font-normal">DIRECCIÓN</th>
              <th className="px-3 py-2 font-normal">z</th>
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
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        payload.direction === "buy" ? "bg-volt/10 text-volt" : "bg-press/10 text-press"
                      }`}
                    >
                      {payload.direction === "buy" ? "COMPRA" : "VENTA"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-[family-name:var(--font-mono)] text-xs text-text-faint">
                    {payload.z.toFixed(2)}
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
