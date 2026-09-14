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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <header className="mb-10">
        <p className="font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.3em] text-gamma">FLOWY</p>
        <h1 className="mt-2 font-[family-name:var(--font-heading)] text-4xl font-semibold text-text">
          Archivo de sesión
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-dim">
          Qué pasó cada día en SP y NQ: precio, GOALs, saturaciones del oscilador y
          migraciones de volumen, sesión a sesión. Reproducible a distintas velocidades.
        </p>
      </header>

      {dataMode === "mock" && (
        <div className="mb-8 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Datos de ejemplo — el archivo real se activa en cuanto haya sesiones grabadas.
        </div>
      )}

      {dates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel/80 p-6 text-sm text-text-dim">
          Todavía no hay ninguna sesión grabada.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {dates.map((date) => {
            const symbols = byDate.get(date)!;
            return (
              <li
                key={date}
                className="group flex items-center justify-between rounded-2xl border border-border bg-panel/80 px-5 py-4 transition hover:border-gamma/40 hover:bg-panel-2/60"
              >
                <span className="capitalize text-text">{formatDateEs(date)}</span>
                <div className="flex gap-2">
                  {["ES", "NQ"].map((sym) =>
                    symbols.has(sym) ? (
                      <Link
                        key={sym}
                        href={`/session/${sym}/${date}`}
                        className="rounded-full border border-border bg-panel-2 px-3.5 py-1.5 font-[family-name:var(--font-mono)] text-xs font-semibold text-text-dim transition hover:border-gamma hover:bg-gamma/10 hover:text-gamma"
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
