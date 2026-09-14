"use client";

import { useEffect, useRef } from "react";
import {
  BaselineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { SeriesPoint, SessionEvent } from "@/lib/types";
import { GOAL_LABELS } from "@/lib/types";
import { GoalBarsPrimitive, type GoalBarItem } from "@/lib/goalBarsPrimitive";
import type { GoalTouchPayload } from "@/lib/types";

function toTime(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

// El eje X siempre en hora de Nueva York (la sesión es RTH), sea cual sea
// la zona horaria del navegador de quien mira la web.
const nyTickFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const nyCrosshairFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "America/New_York",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
function nyTickLabel(time: Time): string {
  return nyTickFmt.format(new Date((time as number) * 1000));
}
function nyCrosshairLabel(time: Time): string {
  return `${nyCrosshairFmt.format(new Date((time as number) * 1000))} NY`;
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

const GOAL_BAR_COLOR = "#c084fc";

function eventMarker(ev: SessionEvent, time: UTCTimestamp, size: number): SeriesMarker<Time> | null {
  const id = String(ev.id);
  // goal_touch ya no se dibuja como marcador: lo pinta GoalBarsPrimitive
  // como barra horizontal (ancho ∝ volumen), igual que en ATAS.
  if (ev.type === "goal_touch") return null;
  if (ev.type === "saturation_armed") {
    const p = ev.payload as { direction: "buy" | "sell" };
    return {
      id,
      time,
      position: p.direction === "buy" ? "belowBar" : "aboveBar",
      color: p.direction === "buy" ? "#28f7bf" : "#fc374a",
      shape: p.direction === "buy" ? "arrowUp" : "arrowDown",
      text: "satura",
      size,
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
      size,
    };
  }
  if (ev.type === "goal_migration") {
    return { id, time, position: "aboveBar", color: "#ffb300", shape: "square", text: "migración", size };
  }
  return null;
}

export default function SessionChart({
  series,
  events,
  playIndex,
  highlightEventId,
}: {
  series: SeriesPoint[];
  events: SessionEvent[];
  /** Índice (en `series`) hasta el que se revela la sesión. Por defecto, toda. */
  playIndex?: number;
  highlightEventId?: number | null;
}) {
  const priceRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const zSeriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const netgexSeriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const goalBarsRef = useRef<GoalBarsPrimitive | null>(null);
  const pricePointsRef = useRef<PricePoint[]>([]);
  const zPointsRef = useRef<PricePoint[]>([]);
  const netgexPointsRef = useRef<PricePoint[]>([]);

  // Construye el gráfico una vez por sesión. El eje de tiempo se fija al
  // rango COMPLETO desde el principio y ya no se toca — así, al reproducir,
  // la línea "crece" dentro de un marco fijo en vez de reencuadrar cada tick.
  useEffect(() => {
    if (!priceRef.current) return;

    const chart = createChart(priceRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#9aa1b4",
        fontFamily: "var(--font-mono)",
        panes: { separatorColor: "#1c2029" },
      },
      grid: {
        vertLines: { color: "#161a23" },
        horzLines: { color: "#161a23" },
      },
      localization: { timeFormatter: nyCrosshairLabel },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#232838",
        tickMarkFormatter: nyTickLabel,
      },
      rightPriceScale: { borderColor: "#232838" },
      crosshair: {
        mode: 0,
        vertLine: { color: "#59aaf866", labelBackgroundColor: "#59aaf8" },
        horzLine: { color: "#59aaf866", labelBackgroundColor: "#59aaf8" },
      },
      autoSize: true,
    });
    chartRef.current = chart;

    pricePointsRef.current = series.filter((p) => p.price != null).map((p) => ({ time: toTime(p.ts), value: p.price as number }));
    zPointsRef.current = series.filter((p) => p.z != null).map((p) => ({ time: toTime(p.ts), value: p.z as number }));
    netgexPointsRef.current = series.filter((p) => p.netgex != null).map((p) => ({ time: toTime(p.ts), value: p.netgex as number }));

    const openPrice = pricePointsRef.current[0]?.value ?? 0;
    const priceSeries = chart.addSeries(
      BaselineSeries,
      {
        baseValue: { type: "price", price: openPrice },
        topLineColor: "#28f7bf",
        topFillColor1: "rgba(40, 247, 191, 0)",
        topFillColor2: "rgba(40, 247, 191, 0)",
        bottomLineColor: "#fc374a",
        bottomFillColor1: "rgba(252, 55, 74, 0)",
        bottomFillColor2: "rgba(252, 55, 74, 0)",
        lineWidth: 2,
        priceLineVisible: false,
      },
      0
    );
    priceSeriesRef.current = priceSeries;
    if (pricePointsRef.current.length > 0) {
      priceSeries.createPriceLine({
        price: openPrice,
        color: "#5c647899",
        lineStyle: 3,
        lineWidth: 1,
        title: "apertura",
        axisLabelVisible: false,
      });
    }

    const zSeries = chart.addSeries(
      BaselineSeries,
      {
        baseValue: { type: "price", price: 0 },
        topLineColor: "#fc374a",
        topFillColor1: "rgba(252, 55, 74, 0.30)",
        topFillColor2: "rgba(252, 55, 74, 0.02)",
        bottomLineColor: "#28f7bf",
        bottomFillColor1: "rgba(40, 247, 191, 0.02)",
        bottomFillColor2: "rgba(40, 247, 191, 0.30)",
        lineWidth: 1,
        priceLineVisible: false,
      },
      1
    );
    zSeriesRef.current = zSeries;
    // Igual que en el indicador de ATAS (Auto invierte NQ y ES): la
    // saturación se lee abajo, no arriba.
    zSeries.priceScale().applyOptions({ invertScale: true });
    zSeries.createPriceLine({ price: 2.5, color: "#ffb300aa", lineStyle: 2, title: "+2.5σ", axisLabelVisible: true, lineWidth: 1 });
    zSeries.createPriceLine({ price: -2.5, color: "#ffb300aa", lineStyle: 2, title: "-2.5σ", axisLabelVisible: true, lineWidth: 1 });

    const netgexSeries = chart.addSeries(
      BaselineSeries,
      {
        baseValue: { type: "price", price: 0 },
        topLineColor: "#59aaf8",
        topFillColor1: "rgba(89, 170, 248, 0.28)",
        topFillColor2: "rgba(89, 170, 248, 0.02)",
        bottomLineColor: "#ffb300",
        bottomFillColor1: "rgba(255, 179, 0, 0.02)",
        bottomFillColor2: "rgba(255, 179, 0, 0.24)",
        lineWidth: 1,
        priceLineVisible: false,
      },
      2
    );
    netgexSeriesRef.current = netgexSeries;

    const panes = chart.panes();
    if (panes[0]) panes[0].setHeight(320);
    if (panes[1]) panes[1].setHeight(140);
    if (panes[2]) panes[2].setHeight(100);

    markersApiRef.current = createSeriesMarkers(priceSeries, []);

    const goalBars = new GoalBarsPrimitive(GOAL_BAR_COLOR);
    priceSeries.attachPrimitive(goalBars);
    goalBarsRef.current = goalBars;

    // El eje de tiempo necesita datos cargados antes de poder fijar un rango
    // visible (si no, lightweight-charts no puede resolver coordenadas y
    // lanza "Value is null"). Se cargan los datos completos aquí una vez;
    // el segundo efecto los recorta enseguida según `playIndex`.
    if (series.length > 0) {
      priceSeries.setData(pricePointsRef.current);
      zSeries.setData(zPointsRef.current);
      netgexSeries.setData(netgexPointsRef.current);
      chart.timeScale().setVisibleRange({ from: toTime(series[0].ts), to: toTime(series[series.length - 1].ts) });
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      zSeriesRef.current = null;
      netgexSeriesRef.current = null;
      markersApiRef.current = null;
      goalBarsRef.current = null;
    };
  }, [series, events]);

  // Revela los datos hasta `playIndex` (reproducción/slider/clic en evento).
  useEffect(() => {
    const chart = chartRef.current;
    const priceSeries = priceSeriesRef.current;
    const zSeries = zSeriesRef.current;
    const netgexSeries = netgexSeriesRef.current;
    const markersApi = markersApiRef.current;
    const goalBars = goalBarsRef.current;
    if (!chart || !priceSeries || !zSeries || !netgexSeries || !markersApi || !goalBars) return;

    const last = series.length - 1;
    const idx = Math.max(0, Math.min(playIndex ?? last, last));
    if (last < 0) return;

    priceSeries.setData(pricePointsRef.current.slice(0, idx + 1));
    zSeries.setData(zPointsRef.current.slice(0, idx + 1));
    netgexSeries.setData(netgexPointsRef.current.slice(0, idx + 1));

    const cutoff = toTime(series[idx].ts);
    const markers = events
      .filter((ev) => toTime(ev.ts) <= cutoff)
      .map((ev) => {
        const pt = nearestPoint(pricePointsRef.current, toTime(ev.ts));
        if (!pt) return null;
        return eventMarker(ev, pt.time, ev.id === highlightEventId ? 2.4 : 1);
      })
      .filter((m): m is SeriesMarker<Time> => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    markersApi.setMarkers(markers);

    const touches = events.filter((ev): ev is SessionEvent & { payload: GoalTouchPayload } => ev.type === "goal_touch");
    const maxVolume = touches.reduce((m, ev) => Math.max(m, ev.payload.volume), 0);
    const barItems: GoalBarItem[] = touches
      .filter((ev) => toTime(ev.ts) <= cutoff)
      .map((ev) => {
        const pt = nearestPoint(pricePointsRef.current, toTime(ev.ts));
        if (!pt) return null;
        return {
          time: pt.time,
          price: pt.value,
          ratio: maxVolume > 0 ? ev.payload.volume / maxVolume : 0,
          label: GOAL_LABELS[ev.payload.goal] ?? ev.payload.goal,
        };
      })
      .filter((b): b is GoalBarItem => b !== null);
    goalBars.setItems(barItems);

    const atRest = idx === last && highlightEventId == null;
    if (atRest) {
      chart.clearCrosshairPosition();
    } else {
      const pt = pricePointsRef.current[idx] ?? nearestPoint(pricePointsRef.current, cutoff);
      if (pt) chart.setCrosshairPosition(pt.value, pt.time, priceSeries);
    }
  }, [series, events, playIndex, highlightEventId]);

  return (
    <div className="w-full rounded-2xl border border-border bg-panel/80 p-4 shadow-[0_0_0_1px_rgba(89,170,248,0.05),0_20px_60px_-30px_rgba(89,170,248,0.35)]">
      <div ref={priceRef} className="h-[580px] w-full" />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-xs font-[family-name:var(--font-mono)] text-text-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#28f7bf,#fc374a)" }} />
          precio (vs. apertura)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#fc374a,#28f7bf)" }} />
          oscilador (z)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#59aaf8,#ffb300)" }} />
          NETGEX
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: GOAL_BAR_COLOR }} />
          toques de GOAL (ancho = volumen)
        </span>
      </div>
    </div>
  );
}
