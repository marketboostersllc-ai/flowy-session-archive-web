import Link from "next/link";
import { notFound } from "next/navigation";
import SessionView from "@/components/SessionView";
import { getSession } from "@/lib/data";
import type { SessionSymbol } from "@/lib/types";

function formatDateEs(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

type Props = {
  params: Promise<{ symbol: string; date: string }>;
};

export default async function SessionPage({ params }: Props) {
  const { symbol, date } = await params;
  const sym = symbol.toUpperCase();
  if (sym !== "NQ" && sym !== "ES") notFound();

  const data = await getSession(sym as SessionSymbol, date);
  if (!data) notFound();

  const { session, series, events, mode } = data;

  const touchCount = events.filter((e) => e.type === "goal_touch").length;
  const signalCount = events.filter((e) => e.type === "saturation_signal").length;
  const migrationCount = events.filter((e) => e.type === "goal_migration").length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-text-faint transition hover:text-gamma">
        ← Archivo de sesión
      </Link>

      <header className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-xs tracking-[0.2em] text-gamma">
            {session.symbol}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold capitalize text-text">
            {formatDateEs(session.session_date)}
          </h1>
        </div>
        <div className="flex gap-4 font-[family-name:var(--font-mono)] text-xs text-text-dim">
          <span>
            <span className="text-purple">{touchCount}</span> toques
          </span>
          <span>
            <span className="text-press">{signalCount}</span> señales
          </span>
          <span>
            <span className="text-amber">{migrationCount}</span> migraciones
          </span>
        </div>
      </header>

      {mode === "mock" && (
        <div className="mb-6 rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Datos de ejemplo — el archivo real se activa en cuanto haya sesiones grabadas.
        </div>
      )}

      <SessionView series={series} events={events} />
    </main>
  );
}
