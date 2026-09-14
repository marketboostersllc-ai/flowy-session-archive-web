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

export interface GoalBarItem {
  time: UTCTimestamp;
  price: number;
  /** 0..1, relativo al toque de mayor volumen de la sesión (fijo, no cambia con el replay). */
  ratio: number;
  label: string;
}

const MAX_BAR_PX = 96;
const MIN_BAR_PX = 16;
const BAR_HEIGHT_PX = 7;

/**
 * Dibuja los GOALs tocados como barras horizontales (ancho ∝ volumen), igual
 * que el histograma de FlowXcanner/Flowy 2.0 en ATAS — en vez de un simple
 * punto, la barra comunica de un vistazo cuánto volumen tenía ese goal.
 */
export class GoalBarsPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<"Baseline", Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _items: GoalBarItem[] = [];
  private _color: string;

  constructor(color: string) {
    this._color = color;
  }

  setItems(items: GoalBarItem[]): void {
    this._items = items;
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
    const items = this._items;
    const color = this._color;

    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        if (!chart || !series || items.length === 0) return;
        target.useMediaCoordinateSpace(({ context }) => {
          for (const item of items) {
            const x = chart.timeScale().timeToCoordinate(item.time);
            const y = series.priceToCoordinate(item.price);
            if (x == null || y == null) continue;

            const w = Math.max(MIN_BAR_PX, item.ratio * MAX_BAR_PX);
            context.fillStyle = color;
            context.beginPath();
            const rx = x - w - 5;
            const ry = y - BAR_HEIGHT_PX / 2;
            const r = 2;
            context.moveTo(rx + r, ry);
            context.arcTo(rx + w, ry, rx + w, ry + BAR_HEIGHT_PX, r);
            context.arcTo(rx + w, ry + BAR_HEIGHT_PX, rx, ry + BAR_HEIGHT_PX, r);
            context.arcTo(rx, ry + BAR_HEIGHT_PX, rx, ry, r);
            context.arcTo(rx, ry, rx + w, ry, r);
            context.closePath();
            context.fill();

            context.fillStyle = "#0a0b10";
            context.beginPath();
            context.arc(x - 3, y, 2.4, 0, Math.PI * 2);
            context.fill();
          }
        });
      },
    };

    return [{ renderer: () => renderer }];
  }
}
