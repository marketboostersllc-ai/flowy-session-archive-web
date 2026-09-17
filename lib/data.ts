import { mockSessionData, mockSessionList } from "./mock";
import {
  getEventsForSession,
  getGoalSeriesForSession,
  getSeriesForSession,
  getSessionRow,
  listClosedSessions,
  supabaseConfigured,
} from "./supabase";
import type { SessionData, SessionListEntry, SessionSymbol } from "./types";

export const dataMode: "live" | "mock" = supabaseConfigured ? "live" : "mock";

export async function getAvailableSessions(): Promise<SessionListEntry[]> {
  if (!supabaseConfigured) return mockSessionList();
  try {
    const rows = await listClosedSessions();
    return rows.map((r) => ({ symbol: r.symbol, session_date: r.session_date, status: r.status }));
  } catch {
    // Fallo real de red/config con Supabase ya activado: no se cuela un
    // listado de ejemplo haciéndose pasar por real, se devuelve vacío y la
    // página lo explica.
    return [];
  }
}

export async function getSession(
  symbol: SessionSymbol,
  sessionDate: string
): Promise<SessionData | null> {
  if (!supabaseConfigured) return mockSessionData(symbol, sessionDate);

  const row = await getSessionRow(symbol, sessionDate).catch(() => null);
  if (!row) return null;

  const [series, events, goalSeries] = await Promise.all([
    getSeriesForSession(row.id),
    getEventsForSession(row.id),
    getGoalSeriesForSession(row.id),
  ]);

  return { session: row, series, events, goalSeries, mode: "live" };
}
