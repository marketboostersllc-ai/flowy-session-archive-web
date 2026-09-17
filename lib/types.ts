export type SessionSymbol = "NQ" | "ES";

export const TICK_SIZE: Record<SessionSymbol, number> = { NQ: 0.25, ES: 0.25 };

export const GOAL_LABELS: Record<string, string> = {
  classicMajorPosVol: "Goal + (Vol)",
  classicMajorNegVol: "Goal - (Vol)",
  goalCall: "Goal + (OI)",
  goalPut: "Goal - (OI)",
};

export interface SessionDay {
  id: number;
  symbol: SessionSymbol;
  session_date: string; // YYYY-MM-DD
  opened_at: string; // ISO
  closed_at: string | null; // ISO
  status: "open" | "closed";
}

export interface SeriesPoint {
  ts: string; // ISO
  price: number | null;
  netgex: number | null;
  z: number | null;
}

/** Un cambio de strike de un GOAL — fila SOLO cuando cambia (función escalón). */
export interface GoalSeriesPoint {
  ts: string; // ISO
  goal: string;
  strike: number;
  volume: number | null;
}

export type EventType =
  | "goal_touch"
  | "saturation_armed"
  | "saturation_signal"
  | "goal_migration";

export interface GoalTouchPayload {
  goal: string;
  strike: number;
  price: number;
  volume: number;
  timeAtStrikeSeconds: number;
}

export interface SaturationPayload {
  direction: "buy" | "sell";
  z: number;
}

export interface MigrationPayload {
  from: string;
  to: string;
  dropAbs: number;
  riseAbs: number;
  /** true = trasvase rápido, false = lento. Ausente en sesiones grabadas antes
   * de añadir la etiqueta (17-sep-2026). */
  fast?: boolean;
}

export interface SessionEvent {
  id: number;
  ts: string;
  type: EventType;
  payload: GoalTouchPayload | SaturationPayload | MigrationPayload | Record<string, unknown>;
}

export interface SessionData {
  session: SessionDay;
  series: SeriesPoint[];
  events: SessionEvent[];
  goalSeries: GoalSeriesPoint[];
  mode: "live" | "mock";
}

export interface SessionListEntry {
  symbol: SessionSymbol;
  session_date: string;
  status: "open" | "closed";
}
