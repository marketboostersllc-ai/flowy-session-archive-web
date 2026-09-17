import type {
  GoalSeriesPoint,
  MigrationPayload,
  SaturationPayload,
  SeriesPoint,
  SessionData,
  SessionEvent,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Backtest de entradas sobre las sesiones grabadas.
//
// Objetivo: para cada TIPO de entrada, simular una rejilla de stop/target (en
// PUNTOS) sobre el precio real de los 3 días y ver qué combinación rinde
// mejor — para decidir el stop/profit de la estrategia de ATAS.
//
// Tipos de entrada:
//   - flowy         → señal del oscilador (saturation_signal), dirección buy/sell.
//   - mig_fast      → migración RÁPIDA (payload.fast === true), dirección imán.
//   - mig_slow      → migración LENTA (payload.fast === false), dirección imán.
//   - mig_all       → cualquier migración (rápida o lenta), dirección imán.
//   - double        → señal Flowy + migración en la misma dirección dentro de
//                     una ventana (doble confirmación); entra en la migración.
//
// "Imán" = el precio tiende hacia el goal que GANA volumen (el 'to' de la
// migración). Dirección = signo de (strike destino − precio de entrada).
// ─────────────────────────────────────────────────────────────────────────

export type Dir = 1 | -1; // +1 largo, -1 corto

export interface BacktestParams {
  stops: number[]; // puntos
  targets: number[]; // puntos
  maxHoldSec: number; // salida por tiempo si no toca stop/target
  doubleWindowSec: number; // ventana señal→migración para doble confirmación
}

export const DEFAULT_PARAMS: BacktestParams = {
  stops: [10, 15, 20, 25, 30, 40],
  targets: [10, 15, 20, 25, 30, 40, 50, 60, 75, 100],
  maxHoldSec: 1200, // 20 min
  doubleWindowSec: 120,
};

export type EntryKind = "flowy" | "mig_fast" | "mig_slow" | "mig_all" | "double";

export const ENTRY_LABELS: Record<EntryKind, string> = {
  flowy: "Flowy pura (señal oscilador)",
  mig_fast: "Migración rápida (imán)",
  mig_slow: "Migración lenta (imán)",
  mig_all: "Migración (todas, imán)",
  double: "Doble confirmación (Flowy + migración)",
};

interface PricePoint {
  t: number;
  price: number;
}

interface Entry {
  tMs: number;
  dir: Dir;
  entry: number;
}

function buildPricePoints(series: SeriesPoint[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (const p of series) {
    if (p.price == null) continue;
    out.push({ t: new Date(p.ts).getTime(), price: p.price });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function priceAtOrBefore(points: PricePoint[], targetMs: number): number | null {
  if (points.length === 0 || points[0].t > targetMs) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].t <= targetMs) lo = mid;
    else hi = mid - 1;
  }
  return points[lo].price;
}

/** Strike de un goal en (o antes de) tMs — usa la trayectoria escalón. */
function goalStrikeAt(goalSeries: GoalSeriesPoint[], goal: string, tMs: number): number | null {
  let best: number | null = null;
  for (const g of goalSeries) {
    if (g.goal !== goal) continue;
    if (new Date(g.ts).getTime() <= tMs) best = g.strike;
    else break; // goalSeries viene ordenado por ts
  }
  return best;
}

/** Simula UNA entrada: recorre el precio desde la entrada hasta stop/target o
 * salida por tiempo. Devuelve el P/L en puntos. Conservador: si una misma
 * muestra rompe stop y target a la vez, cuenta como stop. */
function simulateOne(
  points: PricePoint[],
  entry: Entry,
  stopPts: number,
  targetPts: number,
  maxHoldMs: number
): number {
  const endMs = entry.tMs + maxHoldMs;
  let lastMove = 0;
  for (const p of points) {
    if (p.t <= entry.tMs) continue;
    if (p.t > endMs) break;
    const move = (p.price - entry.entry) * entry.dir; // a favor = positivo
    lastMove = move;
    if (move <= -stopPts) return -stopPts; // stop primero (conservador)
    if (move >= targetPts) return targetPts;
  }
  return lastMove; // salida por tiempo (marcado al último precio)
}

export interface GridCell {
  stop: number;
  target: number;
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number; // puntos por trade
  profitFactor: number; // ganancias / |pérdidas|
}

export interface KindResult {
  kind: EntryKind;
  entries: number;
  maeP50: number; // dilatación mediana (puntos en contra)
  maeP80: number;
  mfeP50: number; // recorrido a favor mediano
  mfeP80: number;
  grid: GridCell[];
  best: GridCell | null; // mejor por expectancy con muestra suficiente
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/** Extrae las entradas de un tipo dado en una sesión. */
function collectEntries(kind: EntryKind, data: SessionData, params: BacktestParams): Entry[] {
  const points = buildPricePoints(data.series);
  if (points.length === 0) return [];
  const entries: Entry[] = [];

  // Dirección "imán": hacia el goal que gana volumen. Si hay trayectoria de
  // strikes (session_goal_series), se usa el strike real vs el precio; si no
  // (sesiones grabadas antes del 17-sep, sin trayectoria), se cae al TIPO de
  // goal: call/positivo → arriba (+1), put/negativo → abajo (-1).
  const goalTypeDir = (goal: string): Dir | null =>
    goal === "classicMajorPosVol" || goal === "goalCall"
      ? 1
      : goal === "classicMajorNegVol" || goal === "goalPut"
        ? -1
        : null;
  const migDir = (ev: SessionEvent): Dir | null => {
    const pl = ev.payload as MigrationPayload;
    const tMs = new Date(ev.ts).getTime();
    const entry = priceAtOrBefore(points, tMs);
    if (entry == null) return null;
    const toStrike = goalStrikeAt(data.goalSeries, pl.to, tMs);
    if (toStrike != null && toStrike !== entry) return toStrike > entry ? 1 : -1;
    return goalTypeDir(pl.to); // fallback por tipo de goal
  };

  if (kind === "flowy") {
    for (const ev of data.events) {
      if (ev.type !== "saturation_signal") continue;
      const tMs = new Date(ev.ts).getTime();
      const entry = priceAtOrBefore(points, tMs);
      if (entry == null) continue;
      const dir: Dir = (ev.payload as SaturationPayload).direction === "buy" ? 1 : -1;
      entries.push({ tMs, dir, entry });
    }
    return entries;
  }

  if (kind === "mig_fast" || kind === "mig_slow" || kind === "mig_all") {
    for (const ev of data.events) {
      if (ev.type !== "goal_migration") continue;
      const fast = (ev.payload as MigrationPayload & { fast?: boolean }).fast;
      if (kind === "mig_fast" && fast !== true) continue;
      if (kind === "mig_slow" && fast !== false) continue;
      const dir = migDir(ev);
      if (dir == null) continue;
      const tMs = new Date(ev.ts).getTime();
      const entry = priceAtOrBefore(points, tMs)!;
      entries.push({ tMs, dir, entry });
    }
    return entries;
  }

  // double: señal Flowy y, dentro de la ventana, una migración en la misma dir.
  if (kind === "double") {
    const migs = data.events.filter((e) => e.type === "goal_migration");
    for (const ev of data.events) {
      if (ev.type !== "saturation_signal") continue;
      const sigMs = new Date(ev.ts).getTime();
      const dir: Dir = (ev.payload as SaturationPayload).direction === "buy" ? 1 : -1;
      const winEnd = sigMs + params.doubleWindowSec * 1000;
      for (const m of migs) {
        const mMs = new Date(m.ts).getTime();
        if (mMs < sigMs || mMs > winEnd) continue;
        if (migDir(m) !== dir) continue;
        const entry = priceAtOrBefore(points, mMs);
        if (entry == null) continue;
        entries.push({ tMs: mMs, dir, entry });
        break; // primera migración que confirma
      }
    }
    return entries;
  }

  return entries;
}

/** Recorrido a favor / en contra (MFE/MAE) de una entrada hasta maxHold. */
function excursion(points: PricePoint[], e: Entry, maxHoldMs: number): { mfe: number; mae: number } {
  const endMs = e.tMs + maxHoldMs;
  let mfe = 0;
  let mae = 0;
  for (const p of points) {
    if (p.t <= e.tMs) continue;
    if (p.t > endMs) break;
    const move = (p.price - e.entry) * e.dir;
    if (move > mfe) mfe = move;
    if (-move > mae) mae = -move;
  }
  return { mfe, mae };
}

export function runBacktest(kind: EntryKind, sessions: SessionData[], params: BacktestParams): KindResult {
  const allEntries: { points: PricePoint[]; entry: Entry }[] = [];
  const maes: number[] = [];
  const mfes: number[] = [];
  const maxHoldMs = params.maxHoldSec * 1000;

  for (const s of sessions) {
    const points = buildPricePoints(s.series);
    if (points.length === 0) continue;
    for (const entry of collectEntries(kind, s, params)) {
      allEntries.push({ points, entry });
      const ex = excursion(points, entry, maxHoldMs);
      mfes.push(ex.mfe);
      maes.push(ex.mae);
    }
  }

  maes.sort((a, b) => a - b);
  mfes.sort((a, b) => a - b);

  const grid: GridCell[] = [];
  for (const stop of params.stops) {
    for (const target of params.targets) {
      let trades = 0;
      let wins = 0;
      let gross = 0;
      let profit = 0;
      let loss = 0;
      for (const { points, entry } of allEntries) {
        const pnl = simulateOne(points, entry, stop, target, maxHoldMs);
        trades++;
        gross += pnl;
        if (pnl > 0) {
          wins++;
          profit += pnl;
        } else {
          loss += -pnl;
        }
      }
      grid.push({
        stop,
        target,
        trades,
        wins,
        winRate: trades ? wins / trades : 0,
        expectancy: trades ? gross / trades : 0,
        profitFactor: loss > 0 ? profit / loss : profit > 0 ? Infinity : 0,
      });
    }
  }

  const minTrades = Math.max(5, Math.round(allEntries.length * 0.3));
  const eligible = grid.filter((c) => c.trades >= minTrades);
  const best = (eligible.length ? eligible : grid).reduce<GridCell | null>(
    (b, c) => (b == null || c.expectancy > b.expectancy ? c : b),
    null
  );

  return {
    kind,
    entries: allEntries.length,
    maeP50: percentile(maes, 50),
    maeP80: percentile(maes, 80),
    mfeP50: percentile(mfes, 50),
    mfeP80: percentile(mfes, 80),
    grid,
    best,
  };
}
