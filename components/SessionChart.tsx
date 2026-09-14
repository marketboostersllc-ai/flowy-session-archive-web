"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { SeriesPoint, SessionEvent } from "@/lib/types";
import { GOAL_LABELS } from "@/lib/types";

function toTime(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

function nearestTime(points: { time: UTCTimestamp }[], target: UTCTimestamp): UTCTimestamp {
  if (points.length === 0) return target;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].time < target) lo = mid + 1;
    else hi = mid;
  }
  return points[lo].time;
}

function eventMarker(ev: SessionEvent, time: UTCTimestamp): SeriesMarker<Time> | null {
  if (ev.type === "goal_touch") {
    const p = ev.payload as { goal: string };
    return {
      time,
      position: "belowBar",
      color: "#a855f7",
      shape: "circle",
      text: GOAL_LABELS[p.goal] ?? p.goal,
    };
  }
  if (ev.type === "saturation_armed") {
    const p = ev.payload as { direction: "buy" | "sell" };
    return {
      time,
      position: p.direction === "buy" ? "belowBar" : "aboveBar",
      color: p.direction === "buy" ? "#28f7bf" : "#fc374a",
      shape: p.direction === "buy" ? "arrowUp" : "arrowDown",
      text: "satura",
    };
  }
  if (ev.type === "saturation_signal") {
    const p = ev.payload as { direction: "buy" | "sell" };
    return {
      time,
      position: p.direction === "buy" ? "belowBar" : "aboveBar",
      color: p.direction === "buy" ? "#28f7bf" : "#fc374a",
      shape: p.direction === "buy" ? "arrowUp" : "arrowDown",
      text: p.direction === "buy" ? "COMPRA" : "VENTA",
    };
  }
  if (ev.type === "goal_migration") {
    return {
      time,
      position: "aboveBar",
      color: "#ffb300",
      shape: "square",
      text: "migración",
    };
  }
  return null;
}

export default function SessionChart({
  series,
  events,
}: {
  series: SeriesPoint[];
  events: SessionEvent[];
}) {
  const priceRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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

    const pricePoints = series
      .filter((p) => p.price != null)
      .map((p) => ({ time: toTime(p.ts), value: p.price as number }));

    const priceSeries = chart.addSeries(
      LineSeries,
      { color: "#59aaf8", lineWidth: 2, priceLineVisible: false },
      0
    );
    priceSeries.setData(pricePoints);

    const zPoints = series
      .filter((p) => p.z != null)
      .map((p) => ({ time: toTime(p.ts), value: p.z as number }));
    const zSeries = chart.addSeries(
      LineSeries,
      { color: "#e8eaf0", lineWidth: 1, priceLineVisible: false },
      1
    );
    zSeries.setData(zPoints);
    zSeries.createPriceLine({ price: 2.5, color: "#ffb30099", lineStyle: 2, title: "+2.5σ", axisLabelVisible: true, lineWidth: 1 });
    zSeries.createPriceLine({ price: -2.5, color: "#ffb30099", lineStyle: 2, title: "-2.5σ", axisLabelVisible: true, lineWidth: 1 });
    zSeries.createPriceLine({ price: 0, color: "#5c6478", lineStyle: 3, title: "", axisLabelVisible: false, lineWidth: 1 });

    const netgexPoints = series
      .filter((p) => p.netgex != null)
      .map((p) => ({ time: toTime(p.ts), value: p.netgex as number }));
    const netgexSeries = chart.addSeries(
      LineSeries,
      { color: "#28f7bf", lineWidth: 1, priceLineVisible: false },
      2
    );
    netgexSeries.setData(netgexPoints);

    const panes = chart.panes();
    if (panes[0]) panes[0].setHeight(320);
    if (panes[1]) panes[1].setHeight(140);
    if (panes[2]) panes[2].setHeight(100);

    const markers = events
      .map((ev) => eventMarker(ev, nearestTime(pricePoints, toTime(ev.ts))))
      .filter((m): m is SeriesMarker<Time> => m !== null)
      .sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(priceSeries as ISeriesApi<"Line">, markers);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [series, events]);

  return (
    <div className="w-full rounded-xl border border-border bg-panel p-3">
      <div ref={priceRef} className="h-[580px] w-full" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-text-faint font-[family-name:var(--font-mono)]">
        <span className="text-gamma">— precio</span>
        <span className="text-text-dim">— oscilador (z)</span>
        <span className="text-volt">— NETGEX</span>
      </div>
    </div>
  );
}
