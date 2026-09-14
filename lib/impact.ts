import type { MigrationPayload, SeriesPoint, SessionEvent } from "./types";

/** Horizontes tras la migración en los que se mide el movimiento de precio. */
export const IMPACT_HORIZONS_SEC = [30, 60, 300] as const;

export interface MigrationMove {
  horizonSec: number;
  ticks: number | null; // null si la sesión terminó antes de llegar a ese horizonte
}

export interface MigrationImpact {
  event: SessionEvent;
  payload: MigrationPayload;
  priceAt: number | null;
  moves: MigrationMove[];
}

interface PricePoint {
  t: number; // epoch ms
  price: number;
}

function buildPricePoints(series: SeriesPoint[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (const p of series) {
    if (p.price == null) continue;
    out.push({ t: new Date(p.ts).getTime(), price: p.price });
  }
  return out;
}

/** Último precio conocido en o antes de `targetMs` (o null si no hay ninguno todavía). */
function priceAtOrBefore(points: PricePoint[], targetMs: number): number | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (points[0].t > targetMs) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].t <= targetMs) lo = mid;
    else hi = mid - 1;
  }
  return points[lo].price;
}

/**
 * Para cada migración de volumen entre goals, mide cuántos ticks se movió el
 * precio en los segundos siguientes — la pregunta central de Eddu: cuánto
 * volumen migrado hace falta para mover el precio, y cuánto lo mueve.
 */
export function computeMigrationImpacts(
  series: SeriesPoint[],
  events: SessionEvent[],
  tickSize: number
): MigrationImpact[] {
  const points = buildPricePoints(series);
  if (points.length === 0) return [];

  const sessionEndMs = points[points.length - 1].t;

  return events
    .filter((e) => e.type === "goal_migration")
    .map((event) => {
      const tMs = new Date(event.ts).getTime();
      const priceAt = priceAtOrBefore(points, tMs);
      const moves: MigrationMove[] = IMPACT_HORIZONS_SEC.map((horizonSec) => {
        const targetMs = tMs + horizonSec * 1000;
        if (priceAt == null || targetMs > sessionEndMs) return { horizonSec, ticks: null };
        const priceLater = priceAtOrBefore(points, targetMs);
        if (priceLater == null) return { horizonSec, ticks: null };
        return { horizonSec, ticks: Number(((priceLater - priceAt) / tickSize).toFixed(1)) };
      });
      return { event, payload: event.payload as MigrationPayload, priceAt, moves };
    })
    .sort((a, b) => a.event.ts.localeCompare(b.event.ts));
}

export function formatHorizon(sec: number): string {
  if (sec < 60) return `+${sec}s`;
  return `+${Math.round(sec / 60)} min`;
}
