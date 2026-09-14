"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SessionChart from "./SessionChart";
import EventTimeline from "./EventTimeline";
import MigrationImpactPanel from "./MigrationImpactPanel";
import SaturationImpactPanel from "./SaturationImpactPanel";
import ExcursionPanel from "./ExcursionPanel";
import type { SeriesPoint, SessionEvent, SessionSymbol } from "@/lib/types";
import { formatEtTime } from "@/lib/format";

const SPEEDS = [1, 2, 5, 10, 20] as const;

function nearestIndexForTs(series: SeriesPoint[], iso: string): number {
  const target = new Date(iso).getTime();
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(series[mid].ts).getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 translate-x-[1px]">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
      {collapsed ? <path d="M12.5 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M17.5 9l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export default function SessionPlayer({
  symbol,
  series,
  events,
}: {
  symbol: SessionSymbol;
  series: SeriesPoint[];
  events: SessionEvent[];
}) {
  const last = Math.max(0, series.length - 1);
  const [playIndex, setPlayIndex] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(5);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [showEvents, setShowEvents] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const delay = Math.max(15, 1000 / speed);
    timerRef.current = setInterval(() => {
      setPlayIndex((i) => {
        if (i >= last) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, delay);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, speed, last]);

  const togglePlay = useCallback(() => {
    setSelectedEventId(null);
    setPlaying((p) => {
      if (!p && playIndex >= last) setPlayIndex(0);
      return !p;
    });
  }, [playIndex, last]);

  const handleSelectEvent = useCallback(
    (id: number) => {
      const ev = events.find((e) => e.id === id);
      if (!ev) return;
      setPlaying(false);
      setPlayIndex(nearestIndexForTs(series, ev.ts));
      setSelectedEventId(id);
      // Los paneles de impacto están más abajo en la página: al seleccionar
      // una fila ahí, sube el gráfico a la vista para que se vea el punto.
      chartAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [events, series]
  );

  const current = series[playIndex];
  const pct = last > 0 ? Math.round((playIndex / last) * 100) : 100;
  const isLive = playIndex >= last;

  return (
    <div>
      <div ref={chartAnchorRef} />
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShowEvents((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-panel-2 px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-text-faint transition hover:border-gamma hover:text-gamma"
        >
          <PanelIcon collapsed={!showEvents} />
          {showEvents ? "Ocultar eventos" : "Mostrar eventos"}
        </button>
      </div>

      <div className={showEvents ? "grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]" : "grid grid-cols-1 gap-4"}>
        <div className="space-y-3">
        <SessionChart series={series} events={events} playIndex={playIndex} highlightEventId={selectedEventId} />

        <div className="rounded-2xl border border-border bg-panel/80 px-5 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Reproducir"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#0a0b10] transition hover:brightness-110 active:scale-95"
              style={{ background: "linear-gradient(135deg,#59aaf8,#28f7bf)" }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>

            <input
              type="range"
              min={0}
              max={last}
              value={playIndex}
              onChange={(e) => {
                setPlaying(false);
                setSelectedEventId(null);
                setPlayIndex(Number(e.target.value));
              }}
              className="flowy-slider flex-1"
              style={{ ["--pct" as string]: `${pct}%` }}
            />

            <span className="w-10 shrink-0 text-right font-[family-name:var(--font-mono)] text-xs text-text-dim">{pct}%</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs">
              <span className={isLive ? "text-text-dim" : "text-gamma"}>{current ? formatEtTime(current.ts) : "—"}</span>
              {isLive && !playing && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] tracking-wide text-text-faint">
                  sesión completa
                </span>
              )}
            </div>
            <div className="flex gap-1 rounded-full border border-border bg-panel-2 p-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded-full px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] transition ${
                    speed === s ? "bg-gamma text-[#0a0b10]" : "text-text-faint hover:text-text-dim"
                  }`}
                >
                  x{s}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>

        {showEvents && <EventTimeline events={events} selectedId={selectedEventId} onSelect={handleSelectEvent} />}
      </div>

      <MigrationImpactPanel symbol={symbol} series={series} events={events} selectedId={selectedEventId} onSelect={handleSelectEvent} />
      <SaturationImpactPanel
        kind="armed"
        symbol={symbol}
        series={series}
        events={events}
        selectedId={selectedEventId}
        onSelect={handleSelectEvent}
      />
      <SaturationImpactPanel
        kind="signal"
        symbol={symbol}
        series={series}
        events={events}
        selectedId={selectedEventId}
        onSelect={handleSelectEvent}
      />

      <ExcursionPanel kind="migration" symbol={symbol} series={series} events={events} selectedId={selectedEventId} onSelect={handleSelectEvent} />
      <ExcursionPanel kind="armed" symbol={symbol} series={series} events={events} selectedId={selectedEventId} onSelect={handleSelectEvent} />
      <ExcursionPanel kind="signal" symbol={symbol} series={series} events={events} selectedId={selectedEventId} onSelect={handleSelectEvent} />
    </div>
  );
}
