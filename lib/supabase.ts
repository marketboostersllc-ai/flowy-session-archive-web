import type { SessionDay, SessionEvent, SeriesPoint } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function sb<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    // Las sesiones cerradas no cambian; una en curso sí, así que un TTL corto
    // basta para no pegarle a Supabase en cada visita sin servir datos viejos.
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export async function listClosedSessions(): Promise<SessionDay[]> {
  return sb<SessionDay[]>(
    "session_days?select=*&status=eq.closed&order=session_date.desc&limit=90"
  );
}

export async function getSessionRow(symbol: string, sessionDate: string): Promise<SessionDay | null> {
  const rows = await sb<SessionDay[]>(
    `session_days?symbol=eq.${symbol}&session_date=eq.${sessionDate}&limit=1`
  );
  return rows[0] ?? null;
}

export async function getSeriesForSession(sessionId: number): Promise<SeriesPoint[]> {
  return sb<SeriesPoint[]>(
    `session_series?session_id=eq.${sessionId}&select=ts,price,netgex,z&order=ts.asc&limit=10000`
  );
}

export async function getEventsForSession(sessionId: number): Promise<SessionEvent[]> {
  return sb<SessionEvent[]>(
    `session_events?session_id=eq.${sessionId}&select=id,ts,type,payload&order=ts.asc&limit=2000`
  );
}
