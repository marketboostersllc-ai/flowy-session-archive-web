import Link from "next/link";
import { dataMode, getAvailableSessions } from "@/lib/data";

function formatDateEs(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

export default async function HomePage() {
  const sessions = await getAvailableSessions();

  const byDate = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (!byDate.has(s.session_date)) byDate.set(s.session_date, new Set());
    byDate.get(s.session_date)!.add(s.symbol);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <header className="mb-10">
        <p className="font-[family-name:var(--font-mono)] text-xs tracking-[0.2em] text-gamma">FLOWY</p>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Archivo de sesión
        </h1>
        <p className="mt-2 max-w-xl text-sm text-text-dim">
          Qué pasó cada día en SP y NQ: precio, GOALs, saturaciones del oscilador y
          migraciones de volumen, sesión a sesión.
        </p>
      </header>

      {dataMode === "mock" && (
        <div className="mb-8 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Datos de ejemplo — el archivo real se activa en cuanto haya sesiones grabadas.
        </div>
      )}

      {dates.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-6 text-sm text-text-dim">
          Todavía no hay ninguna sesión grabada.
        </div>
      ) : (
        <ul className="space-y-2">
          {dates.map((date) => {
            const symbols = byDate.get(date)!;
            return (
              <li
                key={date}
                className="flex items-center justify-between rounded-xl border border-border bg-panel px-5 py-4"
              >
                <span className="capitalize text-text">{formatDateEs(date)}</span>
                <div className="flex gap-2">
                  {["ES", "NQ"].map((sym) =>
                    symbols.has(sym) ? (
                      <Link
                        key={sym}
                        href={`/session/${sym}/${date}`}
                        className="rounded-md border border-border bg-panel-2 px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-text-dim transition hover:border-gamma hover:text-gamma"
                      >
                        {sym}
                      </Link>
                    ) : null
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
