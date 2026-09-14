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

// El proyecto de Supabase limita cada respuesta de la Data API a 1000 filas
// (el "Max Rows" del proyecto), pase lo que pase en `limit=`/`Range` — una
// sesión completa tiene ~1500-2500 puntos de serie, así que un solo fetch
// se quedaba cortado a mitad de sesión (~13:50 NY en vez de ~16:00 NY).
// Se pagina en páginas por debajo del límite hasta que una página vuelve
// incompleta (fin de los datos).
const PAGE_SIZE = 500;

async function sbAll<T>(path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await sb<T[]>(`${path}${sep}offset=${offset}&limit=${PAGE_SIZE}`);
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
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
  return sbAll<SeriesPoint>(`session_series?session_id=eq.${sessionId}&select=ts,price,netgex,z&order=ts.asc`);
}

export async function getEventsForSession(sessionId: number): Promise<SessionEvent[]> {
  return sbAll<SessionEvent>(`session_events?session_id=eq.${sessionId}&select=id,ts,type,payload&order=ts.asc`);
}
