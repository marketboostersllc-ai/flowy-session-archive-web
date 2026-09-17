import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export interface GoalLineSegment {
  fromTime: UTCTimestamp;
  toTime: UTCTimestamp;
  price: number;
  color: string;
  /** Se dibuja una vez, al inicio del tramo. */
  label: string;
}

/**
 * Dibuja la trayectoria de cada GOAL a lo largo de la sesión — no solo el
 * instante en que el precio lo toca (eso lo pinta GoalBarsPrimitive), sino
 * dónde ha estado ese goal en cada momento, como una línea escalonada, igual
 * que se ve en vivo en ATAS.
 */
export class GoalLinesPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<"Baseline", Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _segments: GoalLineSegment[] = [];

  setSegments(segments: GoalLineSegment[]): void {
    this._segments = segments;
    this._requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, "Baseline">): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {}

  paneViews(): readonly IPrimitivePaneView[] {
    const chart = this._chart;
    const series = this._series;
    const segments = this._segments;

    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        if (!chart || !series || segments.length === 0) return;
        target.useMediaCoordinateSpace(({ context }) => {
          const timeScale = chart.timeScale();
          for (const seg of segments) {
            const x1 = timeScale.timeToCoordinate(seg.fromTime);
            const x2 = timeScale.timeToCoordinate(seg.toTime);
            const y = series.priceToCoordinate(seg.price);
            if (x1 == null || x2 == null || y == null || x2 <= x1) continue;

            context.strokeStyle = seg.color;
            context.lineWidth = 1.25;
            context.setLineDash([3, 2]);
            context.beginPath();
            context.moveTo(x1, y);
            context.lineTo(x2, y);
            context.stroke();
            context.setLineDash([]);

            context.fillStyle = seg.color;
            context.font = "9px var(--font-mono, monospace)";
            context.textBaseline = "bottom";
            context.fillText(seg.label, x1 + 3, y - 2);
          }
        });
      },
    };

    return [{ renderer: () => renderer }];
  }
}
