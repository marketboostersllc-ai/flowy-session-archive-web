"use client";

import { GOAL_LABELS, TICK_SIZE, type SeriesPoint, type SessionEvent, type SessionSymbol } from "@/lib/types";
import { computeArmedExcursions, computeMigrationExcursions, computeSignalExcursions } from "@/lib/impact";
import { formatEtTime } from "@/lib/format";

type Kind = "migration" | "armed" | "signal";

const TITLE: Record<Kind, string> = {
  migration: "RECORRIDO MÁXIMO Y DILATACIÓN TRAS LA MIGRACIÓN",
  armed: "RECORRIDO MÁXIMO Y DILATACIÓN TRAS LA SATURACIÓN",
  signal: "RECORRIDO MÁXIMO Y DILATACIÓN TRAS LA SEÑAL",
};

const DESCRIPTION: Record<Kind, string> = {
  migration:
    "Ticks que llegó a moverse el precio en la dirección que terminó dominando tras la migración (máximo), y ticks que llegó a moverse en la dirección contraria (dilatación), hasta el cierre de sesión.",
  armed:
    "Ticks que llegó a moverse el precio a favor de la dirección de la saturación (máximo), y ticks que llegó a moverse en contra (dilatación), hasta el cierre de sesión.",
  signal:
    "Ticks que llegó a moverse el precio a favor de la dirección de la señal (máximo), y ticks que llegó a moverse en contra (dilatación), hasta el cierre de sesión.",
};

const CARD_SHADOW: Record<Kind, string> = {
  migration: "shadow-[0_0_0_1px_rgba(255,179,0,0.05),0_20px_60px_-30px_rgba(255,179,0,0.25)]",
  armed: "shadow-[0_0_0_1px_rgba(252,55,74,0.05),0_20px_60px_-30px_rgba(252,55,74,0.25)]",
  signal: "shadow-[0_0_0_1px_rgba(252,55,74,0.05),0_20px_60px_-30px_rgba(252,55,74,0.25)]",
};

function TicksCell({ ticks, tone }: { ticks: number | null; tone: "favor" | "against" }) {
  if (ticks == null) return <span className="text-text-faint">—</span>;
  if (ticks === 0) return <span className="text-text-faint">0</span>;
  return (
    <span className={tone === "favor" ? "text-volt" : "text-press"}>
      {tone === "favor" ? "+" : "-"}
      {ticks}
    </span>
  );
}

export default function ExcursionPanel({
  kind,
  symbol,
  series,
  events,
  selectedId,
  onSelect,
}: {
  kind: Kind;
  symbol: SessionSymbol;
  series: SeriesPoint[];
  events: SessionEvent[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  const tickSize = TICK_SIZE[symbol];
  const excursions =
    kind === "migration"
      ? computeMigrationExcursions(series, events, tickSize)
      : kind === "armed"
        ? computeArmedExcursions(series, events, tickSize)
        : computeSignalExcursions(series, events, tickSize);

  if (excursions.length === 0) return null;

  const favors = excursions.map((e) => e.favorTicks).filter((t): t is number => t != null);
  const avgFavor = favors.length > 0 ? favors.reduce((s, t) => s + t, 0) / favors.length : null;
  const againsts = excursions.map((e) => e.againstTicks).filter((t): t is number => t != null);
  const avgAgainst = againsts.length > 0 ? againsts.reduce((s, t) => s + t, 0) / againsts.length : null;

  return (
    <div className={`mt-4 rounded-2xl border border-border bg-panel/80 ${CARD_SHADOW[kind]}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-sm tracking-wide text-text-dim">{TITLE[kind]}</h2>
          <p className="mt-1 text-xs text-text-faint">{DESCRIPTION[kind]}</p>
        </div>
        {(avgFavor != null || avgAgainst != null) && (
          <div className="flex gap-2 font-[family-name:var(--font-mono)] text-xs">
            {avgFavor != null && (
              <span className="rounded-full border border-border bg-panel-2 px-3 py-1.5 text-text-dim">
                media máximo: <span className="text-volt">+{avgFavor.toFixed(1)} ticks</span>
              </span>
            )}
            {avgAgainst != null && (
              <span className="rounded-full border border-border bg-panel-2 px-3 py-1.5 text-text-dim">
                media dilatación: <span className="text-press">-{avgAgainst.toFixed(1)} ticks</span>
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
              {kind === "migration" ? (
                <th className="px-3 py-2 font-normal">MIGRACIÓN</th>
              ) : (
                <>
                  <th className="px-3 py-2 font-normal">DIRECCIÓN</th>
                  <th className="px-3 py-2 font-normal">z</th>
                </>
              )}
              <th className="px-3 py-2 text-right font-normal">MÁXIMO</th>
              <th className="px-3 py-2 text-right font-normal">DILATACIÓN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {excursions.map(({ event, payload, favorTicks, againstTicks }) => {
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
                  {kind === "migration" ? (
                    (() => {
                      const p = payload as { from: string; to: string };
                      return (
                        <td className="px-3 py-2.5 text-text">
                          <span className="text-amber">{GOAL_LABELS[p.from] ?? p.from}</span>
                          <span className="mx-1 text-text-faint">→</span>
                          <span className="text-amber">{GOAL_LABELS[p.to] ?? p.to}</span>
                        </td>
                      );
                    })()
                  ) : (
                    (() => {
                      const p = payload as { direction: "buy" | "sell"; z: number };
                      return (
                        <>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                p.direction === "buy" ? "bg-volt/10 text-volt" : "bg-press/10 text-press"
                              }`}
                            >
                              {p.direction === "buy" ? "COMPRA" : "VENTA"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-[family-name:var(--font-mono)] text-xs text-text-faint">
                            {p.z.toFixed(2)}
                          </td>
                        </>
                      );
                    })()
                  )}
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)]">
                    <TicksCell ticks={favorTicks} tone="favor" />
                  </td>
                  <td className="px-3 py-2.5 text-right font-[family-name:var(--font-mono)]">
                    <TicksCell ticks={againstTicks} tone="against" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
