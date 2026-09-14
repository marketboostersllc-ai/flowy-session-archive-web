"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { SeriesPoint, SessionEvent } from "@/lib/types";
import { GOAL_LABELS } from "@/lib/types";

function toTime(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

type PricePoint = { time: UTCTimestamp; value: number };

function nearestPoint(points: PricePoint[], target: UTCTimestamp): PricePoint | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time < target) lo = mid + 1;
    else hi = mid;
  }
  return points[lo];
}

function eventMarker(ev: SessionEvent, time: UTCTimestamp): SeriesMarker<Time> | null {
  const id = String(ev.id);
  if (ev.type === "goal_touch") {
    const p = ev.payload as { goal: string };
    return { id, time, position: "belowBar", color: "#a855f7", shape: "circle", text: GOAL_LABELS[p.goal] ?? p.goal, size: 1 };
  }
  if (ev.type === "saturation_armed") {
    const p = ev.payload as { direction: "buy" | "sell" };
    return {
      id,
      time,
      position: p.direction === "buy" ? "belowBar" : "aboveBar",
      color: p.direction === "buy" ? "#28f7bf" : "#fc374a",
      shape: p.direction === "buy" ? "arrowUp" : "arrowDown",
      text: "satura",
      size: 1,
    };
  }
  if (ev.type === "saturation_signal") {
    const p = ev.payload as { direction: "buy" | "sell" };
    return {
      id,
      time,
      position: p.direction === "buy" ? "belowBar" : "aboveBar",
      color: p.direction === "buy" ? "#28f7bf" : "#fc374a",
      shape: p.direction === "buy" ? "arrowUp" : "arrowDown",
      text: p.direction === "buy" ? "COMPRA" : "VENTA",
      size: 1,
    };
  }
  if (ev.type === "goal_migration") {
    return { id, time, position: "aboveBar", color: "#ffb300", shape: "square", text: "migración", size: 1 };
  }
  return null;
}

export default function SessionChart({
  series,
  events,
  focusEventId,
  onClear,
}: {
  series: SeriesPoint[];
  events: SessionEvent[];
  focusEventId?: number | null;
  onClear?: () => void;
}) {
  const priceRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const baseMarkersRef = useRef<SeriesMarker<Time>[]>([]);
  const pricePointsRef = useRef<PricePoint[]>([]);

  // Construye el gráfico una vez por sesión (cambia solo si cambian los datos).
  useEffect(() => {
    if (!priceRef.current) return;

    const chart = createChart(priceRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9aa1b4",
        fontFamily: "var(--font-mono)",
        panes: { separatorColor: "#262b38" },
      },
      grid: {
        vertLines: { color: "#1a1e28" },
        horzLines: { color: "#1a1e28" },
      },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#262b38" },
      rightPriceScale: { borderColor: "#262b38" },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;

    const pricePoints: PricePoint[] = series
      .filter((p) => p.price != null)
      .map((p) => ({ time: toTime(p.ts), value: p.price as number }));
    pricePointsRef.current = pricePoints;

    const priceSeries = chart.addSeries(LineSeries, { color: "#59aaf8", lineWidth: 2, priceLineVisible: false }, 0);
    priceSeries.setData(pricePoints);
    priceSeriesRef.current = priceSeries;

    const zPoints = series.filter((p) => p.z != null).map((p) => ({ time: toTime(p.ts), value: p.z as number }));
    const zSeries = chart.addSeries(LineSeries, { color: "#e8eaf0", lineWidth: 1, priceLineVisible: false }, 1);
    zSeries.setData(zPoints);
    zSeries.createPriceLine({ price: 2.5, color: "#ffb30099", lineStyle: 2, title: "+2.5σ", axisLabelVisible: true, lineWidth: 1 });
    zSeries.createPriceLine({ price: -2.5, color: "#ffb30099", lineStyle: 2, title: "-2.5σ", axisLabelVisible: true, lineWidth: 1 });
    zSeries.createPriceLine({ price: 0, color: "#5c6478", lineStyle: 3, title: "", axisLabelVisible: false, lineWidth: 1 });

    const netgexPoints = series.filter((p) => p.netgex != null).map((p) => ({ time: toTime(p.ts), value: p.netgex as number }));
    const netgexSeries = chart.addSeries(LineSeries, { color: "#28f7bf", lineWidth: 1, priceLineVisible: false }, 2);
    netgexSeries.setData(netgexPoints);

    const panes = chart.panes();
    if (panes[0]) panes[0].setHeight(320);
    if (panes[1]) panes[1].setHeight(140);
    if (panes[2]) panes[2].setHeight(100);

    const markers = events
      .map((ev) => {
        const pt = nearestPoint(pricePoints, toTime(ev.ts));
        return pt ? eventMarker(ev, pt.time) : null;
      })
      .filter((m): m is SeriesMarker<Time> => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    baseMarkersRef.current = markers;
    markersApiRef.current = createSeriesMarkers(priceSeries, markers);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      markersApiRef.current = null;
    };
  }, [series, events]);

  // Señala el evento seleccionado: centra el eje de tiempo en ese instante y
  // marca el punto exacto con el crosshair + agranda su marcador.
  useEffect(() => {
    const chart = chartRef.current;
    const priceSeries = priceSeriesRef.current;
    const markersApi = markersApiRef.current;
    if (!chart || !priceSeries || !markersApi) return;

    if (focusEventId == null) {
      chart.clearCrosshairPosition();
      markersApi.setMarkers(baseMarkersRef.current);
      return;
    }

    const ev = events.find((e) => e.id === focusEventId);
    if (!ev) return;
    const pt = nearestPoint(pricePointsRef.current, toTime(ev.ts));
    if (!pt) return;

    chart.setCrosshairPosition(pt.value, pt.time, priceSeries);
    markersApi.setMarkers(
      baseMarkersRef.current.map((m) => (m.id === String(focusEventId) ? { ...m, size: 2.4 } : m))
    );

    const span = 8 * 60; // ±8 min de contexto alrededor del evento
    chart.timeScale().setVisibleRange({ from: (pt.time - span) as UTCTimestamp, to: (pt.time + span) as UTCTimestamp });
  }, [focusEventId, events]);

  return (
    <div className="w-full rounded-xl border border-border bg-panel p-3">
      <div ref={priceRef} className="h-[580px] w-full" />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-text-faint font-[family-name:var(--font-mono)]">
        <span className="text-gamma">— precio</span>
        <span className="text-text-dim">— oscilador (z)</span>
        <span className="text-volt">— NETGEX</span>
        {focusEventId != null && (
          <button
            type="button"
            onClick={() => {
              chartRef.current?.clearCrosshairPosition();
              chartRef.current?.timeScale().fitContent();
              onClear?.();
            }}
            className="ml-auto rounded border border-border px-2 py-0.5 text-text-dim transition hover:border-gamma hover:text-gamma"
          >
            ver sesión completa
          </button>
        )}
      </div>
    </div>
  );
}
