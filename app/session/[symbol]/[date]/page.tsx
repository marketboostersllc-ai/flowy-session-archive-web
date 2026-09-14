import Link from "next/link";
import { notFound } from "next/navigation";
import SessionPlayer from "@/components/SessionPlayer";
import MigrationImpactPanel from "@/components/MigrationImpactPanel";
import SaturationImpactPanel from "@/components/SaturationImpactPanel";
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
          <p className="font-[family-name:var(--font-mono)] text-xs font-semibold tracking-[0.25em] text-gamma">
            {session.symbol}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-semibold capitalize text-text">
            {formatDateEs(session.session_date)}
          </h1>
        </div>
        <div className="flex gap-2 font-[family-name:var(--font-mono)] text-xs">
          <span className="rounded-full border border-purple/30 bg-purple/10 px-3 py-1.5 text-purple">
            {touchCount} toques
          </span>
          <span className="rounded-full border border-press/30 bg-press/10 px-3 py-1.5 text-press">
            {signalCount} señales
          </span>
          <span className="rounded-full border border-amber/30 bg-amber/10 px-3 py-1.5 text-amber">
            {migrationCount} migraciones
          </span>
        </div>
      </header>

      {mode === "mock" && (
        <div className="mb-6 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Datos de ejemplo — el archivo real se activa en cuanto haya sesiones grabadas.
        </div>
      )}

      <SessionPlayer series={series} events={events} />
      <MigrationImpactPanel symbol={session.symbol} series={series} events={events} />
      <SaturationImpactPanel symbol={session.symbol} series={series} events={events} />
    </main>
  );
}
