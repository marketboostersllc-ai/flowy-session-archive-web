import type { MigrationPayload, SaturationPayload, SeriesPoint, SessionEvent } from "./types";

/** Horizontes tras el evento en los que se mide el movimiento de precio. */
export const IMPACT_HORIZONS_SEC = [60, 300, 1200, 3600] as const;

export interface EventMove {
  horizonSec: number;
  ticks: number | null; // null si la sesión terminó antes de llegar a ese horizonte
}

export interface EventImpact<P> {
  event: SessionEvent;
  payload: P;
  priceAt: number | null;
  moves: EventMove[];
}

export type MigrationImpact = EventImpact<MigrationPayload>;
export type SaturationImpact = EventImpact<SaturationPayload>;

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

/** Para un tipo de evento dado, mide cuántos ticks se movió el precio en los
 * segundos siguientes a cada ocurrencia. Base compartida por el impacto de
 * migraciones y el de saturaciones — misma pregunta en ambos casos: ¿este
 * evento anticipa un movimiento real de precio, y de cuánto? */
function computeImpacts<P>(
  series: SeriesPoint[],
  events: SessionEvent[],
  tickSize: number,
  eventType: SessionEvent["type"]
): EventImpact<P>[] {
  const points = buildPricePoints(series);
  if (points.length === 0) return [];

  const sessionEndMs = points[points.length - 1].t;

  return events
    .filter((e) => e.type === eventType)
    .map((event) => {
      const tMs = new Date(event.ts).getTime();
      const priceAt = priceAtOrBefore(points, tMs);
      const moves: EventMove[] = IMPACT_HORIZONS_SEC.map((horizonSec) => {
        const targetMs = tMs + horizonSec * 1000;
        if (priceAt == null || targetMs > sessionEndMs) return { horizonSec, ticks: null };
        const priceLater = priceAtOrBefore(points, targetMs);
        if (priceLater == null) return { horizonSec, ticks: null };
        return { horizonSec, ticks: Number(((priceLater - priceAt) / tickSize).toFixed(1)) };
      });
      return { event, payload: event.payload as P, priceAt, moves };
    })
    .sort((a, b) => a.event.ts.localeCompare(b.event.ts));
}

/**
 * Para cada migración de volumen entre goals, mide cuántos ticks se movió el
 * precio en los segundos siguientes — la pregunta central de Eddu: cuánto
 * volumen migrado hace falta para mover el precio, y cuánto lo mueve.
 */
export function computeMigrationImpacts(series: SeriesPoint[], events: SessionEvent[], tickSize: number): MigrationImpact[] {
  return computeImpacts<MigrationPayload>(series, events, tickSize, "goal_migration");
}

/**
 * Para cada señal de reversión del oscilador (satura y vuelve a cruzar),
 * mide cuánto se movió el precio después — valida si la señal anticipa un
 * movimiento real y en qué dirección.
 */
export function computeSaturationImpacts(series: SeriesPoint[], events: SessionEvent[], tickSize: number): SaturationImpact[] {
  return computeImpacts<SaturationPayload>(series, events, tickSize, "saturation_signal");
}

/**
 * Para cada saturación (el momento en que el oscilador ENTRA en la banda de
 * anomalía, antes de la señal de reversión confirmada), mide cuánto se movió
 * el precio después — ¿ya se mueve algo desde que satura, o hay que esperar
 * a la señal confirmada?
 */
export function computeArmedImpacts(series: SeriesPoint[], events: SessionEvent[], tickSize: number): SaturationImpact[] {
  return computeImpacts<SaturationPayload>(series, events, tickSize, "saturation_armed");
}

export function formatHorizon(sec: number): string {
  if (sec < 60) return `+${sec}s`;
  if (sec % 3600 === 0) return `+${sec / 3600}h`;
  return `+${Math.round(sec / 60)} min`;
}

/** "+30s, +1 min, +5 min y +20 min" — para las descripciones de los paneles. */
export function formatHorizonList(horizons: readonly number[] = IMPACT_HORIZONS_SEC): string {
  const labels = horizons.map(formatHorizon);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}
