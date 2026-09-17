import Link from "next/link";
import { dataMode, getAvailableSessions, getSession } from "@/lib/data";
import {
  DEFAULT_PARAMS,
  ENTRY_LABELS,
  runBacktest,
  signalGapStats,
  type EntryKind,
  type KindResult,
} from "@/lib/backtest";
import { TICK_SIZE, type SessionData, type SessionSymbol } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: EntryKind[] = ["flowy", "mig_all", "mig_fast", "mig_slow", "double"];

// $ por tick del E-mini: NQ = $5, ES = $12,50.
const DOLLAR_PER_TICK: Record<SessionSymbol, number> = { NQ: 5, ES: 12.5 };

const COOLDOWN_OPTIONS = [
  { label: "Sin", sec: 0 },
  { label: "1 min", sec: 60 },
  { label: "2 min", sec: 120 },
  { label: "5 min", sec: 300 },
  { label: "10 min", sec: 600 },
  { label: "15 min", sec: 900 },
];

function CooldownSelector({ current }: { current: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="font-[family-name:var(--font-mono)] text-xs text-text-dim">Enfriamiento señal:</span>
      {COOLDOWN_OPTIONS.map((o) => (
        <Link
          key={o.sec}
          href={o.sec === DEFAULT_PARAMS.signalCooldownSec ? "/backtest" : `/backtest?cd=${o.sec}`}
          scroll={false}
          className={`rounded-full border px-3 py-1 font-[family-name:var(--font-mono)] text-xs transition ${
            o.sec === current
              ? "border-gamma bg-gamma/15 text-gamma"
              : "border-border bg-panel-2 text-text-dim hover:border-gamma/40 hover:text-text"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}
function pts(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
}
function usd(x: number): string {
  return `${x >= 0 ? "+" : "-"}$${Math.abs(x).toFixed(0)}`;
}
// Win rate de break-even que impone el R:R (stop/(stop+target)) y la ventaja
// real = win% conseguido − break-even, en puntos porcentuales.
function beRate(stop: number, target: number): number {
  return stop + target > 0 ? stop / (stop + target) : 0;
}
function pf(x: number): string {
  return x === Infinity ? "∞" : x.toFixed(2);
}

/** Color de la celda del heatmap según expectancy (puntos/trade). */
function cellStyle(exp: number, maxAbs: number): React.CSSProperties {
  if (maxAbs <= 0) return {};
  const a = Math.min(1, Math.abs(exp) / maxAbs);
  const c = exp >= 0 ? "16,185,129" : "239,68,68"; // verde / rojo
  return { backgroundColor: `rgba(${c}, ${(0.12 + a * 0.5).toFixed(2)})` };
}

function ExpGrid({ res, dpt }: { res: KindResult; dpt: number }) {
  const stops = DEFAULT_PARAMS.stops;
  const targets = DEFAULT_PARAMS.targets;
  const maxAbs = Math.max(...res.grid.map((c) => Math.abs(c.expectancy)), 0.01);
  const cell = (stop: number, target: number) =>
    res.grid.find((c) => c.stop === stop && c.target === target);
  const isBest = (stop: number, target: number) =>
    res.best != null && res.best.stop === stop && res.best.target === target;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-right font-[family-name:var(--font-mono)] text-xs">
        <thead>
          <tr className="text-text-dim">
            <th className="p-1.5 text-left font-normal">stop ↓ / target →</th>
            {targets.map((t) => (
              <th key={t} className="p-1.5 font-normal">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stops.map((s) => (
            <tr key={s}>
              <td className="p-1.5 text-left text-text-dim">{s}</td>
              {targets.map((t) => {
                const c = cell(s, t);
                if (!c) return <td key={t} className="p-1.5" />;
                return (
                  <td
                    key={t}
                    className={`p-1.5 tabular-nums ${isBest(s, t) ? "font-semibold text-text outline outline-1 outline-gamma" : "text-text"}`}
                    style={cellStyle(c.expectancy, maxAbs)}
                    title={`stop ${s} / target ${t} ticks · ${c.trades} trades · win ${pct(c.winRate)} · exp ${usd(c.expectancy * dpt)}/trade · PF ${pf(c.profitFactor)}`}
                  >
                    {pts(c.expectancy)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-text-dim">
        Stop/target en <strong>ticks</strong>. Cada celda = expectancy (ticks por trade). Verde &gt; 0, rojo &lt; 0.
        Recuadro dorado = mejor combinación. Pasa el ratón para ver nº de trades, win%, expectancy en $ y profit factor.
      </p>
    </div>
  );
}

function SymbolSection({
  symbol,
  sessions,
  cooldownSec,
}: {
  symbol: SessionSymbol;
  sessions: SessionData[];
  cooldownSec: number;
}) {
  const tickSize = TICK_SIZE[symbol];
  const dpt = DOLLAR_PER_TICK[symbol];
  const params = { ...DEFAULT_PARAMS, signalCooldownSec: cooldownSec };
  const results = KINDS.map((k) => runBacktest(k, sessions, params, tickSize));
  const gaps = signalGapStats(sessions);

  return (
    <section className="mb-14">
      <h2 className="mb-4 font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
        {symbol} <span className="text-sm font-normal text-text-dim">· ${dpt}/tick</span>
      </h2>

      <CooldownSelector current={cooldownSec} />

      {/* Distribución de huecos entre señales de la misma dirección */}
      {gaps.total > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-panel/80 p-4">
          <p className="mb-2 text-sm font-semibold text-text">
            Repetición de señales de Flowy <span className="font-normal text-text-dim">· {gaps.total} huecos consecutivos (misma dirección)</span>
          </p>
          <div className="flex flex-wrap gap-2 font-[family-name:var(--font-mono)] text-xs">
            {gaps.buckets.map((b) => (
              <span key={b.label} className="rounded-md border border-border bg-panel-2 px-2.5 py-1 text-text-dim">
                {b.label}: <span className="text-text">{b.n}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-text-dim">
            Los huecos cortos (&lt;1-2 min) son repeticiones de la misma señal. El cooldown actual ({cooldownSec / 60} min)
            las fusiona; ajústalo arriba y compara.
          </p>
        </div>
      )}

      {/* Resumen: mejor stop/target por tipo */}
      <div className="mb-6 overflow-x-auto rounded-2xl border border-border bg-panel/80">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="p-3 font-normal">Tipo de entrada</th>
              <th className="p-3 text-right font-normal">Entradas</th>
              <th className="p-3 text-right font-normal">MAE p50/p80 (ticks)</th>
              <th className="p-3 text-right font-normal">MFE p50/p80 (ticks)</th>
              <th className="p-3 text-right font-normal">Stop (ticks)</th>
              <th className="p-3 text-right font-normal">Target (ticks)</th>
              <th className="p-3 text-right font-normal">Win%</th>
              <th className="p-3 text-right font-normal">Win% vs BE</th>
              <th className="p-3 text-right font-normal">Exp. (ticks)</th>
              <th className="p-3 text-right font-normal">Exp. ($)</th>
              <th className="p-3 text-right font-normal">PF</th>
            </tr>
          </thead>
          <tbody className="font-[family-name:var(--font-mono)]">
            {results.map((r) => (
              <tr key={r.kind} className="border-b border-border/50 last:border-0">
                <td className="p-3 font-[family-name:var(--font-sans)] text-text">{ENTRY_LABELS[r.kind]}</td>
                <td className="p-3 text-right tabular-nums text-text">{r.entries}</td>
                <td className="p-3 text-right tabular-nums text-text-dim">
                  {r.maeP50.toFixed(0)}/{r.maeP80.toFixed(0)}
                </td>
                <td className="p-3 text-right tabular-nums text-text-dim">
                  {r.mfeP50.toFixed(0)}/{r.mfeP80.toFixed(0)}
                </td>
                <td className="p-3 text-right tabular-nums text-text">{r.best ? r.best.stop : "—"}</td>
                <td className="p-3 text-right tabular-nums text-text">{r.best ? r.best.target : "—"}</td>
                <td className="p-3 text-right tabular-nums text-text">{r.best ? pct(r.best.winRate) : "—"}</td>
                {(() => {
                  if (!r.best) return <td className="p-3 text-right tabular-nums text-text-dim">—</td>;
                  const be = beRate(r.best.stop, r.best.target);
                  const edge = (r.best.winRate - be) * 100;
                  return (
                    <td
                      className={`p-3 text-right tabular-nums font-semibold ${edge >= 0 ? "text-gamma" : "text-red-400"}`}
                      title={`break-even ${(be * 100).toFixed(0)}% · conseguido ${(r.best.winRate * 100).toFixed(0)}%`}
                    >
                      {`${edge >= 0 ? "+" : ""}${edge.toFixed(0)} pp`}
                    </td>
                  );
                })()}
                <td
                  className={`p-3 text-right tabular-nums font-semibold ${r.best && r.best.expectancy >= 0 ? "text-gamma" : "text-red-400"}`}
                >
                  {r.best ? pts(r.best.expectancy) : "—"}
                </td>
                <td
                  className={`p-3 text-right tabular-nums font-semibold ${r.best && r.best.expectancy >= 0 ? "text-gamma" : "text-red-400"}`}
                >
                  {r.best ? usd(r.best.expectancy * dpt) : "—"}
                </td>
                <td className="p-3 text-right tabular-nums text-text">{r.best ? pf(r.best.profitFactor) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rejilla por tipo */}
      <div className="grid gap-6">
        {results.map((r) => (
          <div key={r.kind} className="rounded-2xl border border-border bg-panel/80 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="font-[family-name:var(--font-sans)] text-sm font-semibold text-text">
                {ENTRY_LABELS[r.kind]}
              </h3>
              <span className="font-[family-name:var(--font-mono)] text-xs text-text-dim">
                {r.entries} entradas
              </span>
            </div>
            {r.entries === 0 ? (
              <p className="text-sm text-text-dim">
                Sin entradas de este tipo en los datos disponibles
                {r.kind === "mig_fast" || r.kind === "mig_slow"
                  ? " (la etiqueta rápida/lenta solo existe en sesiones grabadas desde el 17-sep-2026)."
                  : "."}
              </p>
            ) : (
              <ExpGrid res={r} dpt={dpt} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ cd?: string }>;
}) {
  const sp = await searchParams;
  const cdRaw = Number(sp.cd);
  const cooldownSec = COOLDOWN_OPTIONS.some((o) => o.sec === cdRaw) ? cdRaw : DEFAULT_PARAMS.signalCooldownSec;

  const list = await getAvailableSessions();
  const bySymbol = new Map<SessionSymbol, SessionData[]>();

  for (const s of list) {
    const data = await getSession(s.symbol, s.session_date);
    if (!data) continue;
    if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, []);
    bySymbol.get(s.symbol)!.push(data);
  }

  const symbols = [...bySymbol.keys()].sort();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <header className="mb-10">
        <Link href="/" className="font-[family-name:var(--font-mono)] text-xs text-text-dim hover:text-gamma">
          ← Archivo de sesión
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-heading)] text-4xl font-semibold text-text">
          Backtest de entradas
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-dim">
          Simula stop/target sobre el precio real grabado, por tipo de entrada, para decidir el stop y el
          profit de la estrategia. Stop/target en ticks (rango amplio, hasta 1500). Cada operación se cierra en
          su stop o su target (y al cierre de sesión si no toca ninguno). Migración = dirección &quot;imán&quot;
          (hacia el goal que gana volumen). Doble confirmación =
          señal Flowy + migración en la misma dirección dentro de {DEFAULT_PARAMS.doubleWindowSec}s. Señales de
          Flowy de-duplicadas: una repetición de la misma dirección dentro del enfriamiento no cuenta como nuevo
          trade. Stops acotados a ≤300 ticks (tolerancia); targets hasta 1500. El enfriamiento de señal se elige
          en el encabezado de cada tabla.
        </p>
      </header>

      {dataMode === "mock" && (
        <div className="mb-8 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Datos de ejemplo — las cifras reales aparecen con Supabase configurado y sesiones grabadas.
        </div>
      )}

      {symbols.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel/80 p-6 text-sm text-text-dim">
          Todavía no hay sesiones grabadas para simular.
        </div>
      ) : (
        symbols.map((sym) => (
          <SymbolSection key={sym} symbol={sym} sessions={bySymbol.get(sym)!} cooldownSec={cooldownSec} />
        ))
      )}
    </main>
  );
}
