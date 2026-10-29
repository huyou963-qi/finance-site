import type { ISeriesPrimitive, SeriesAttachedParameter, Time } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { NBER_RECESSION_MARK_AREA_STYLE, type NberRecessionBand } from "@/lib/data/nberRecessionBands";

/** 底层 primitive 由图表驱动重绘，始终跟随时间轴且不参与价格自动缩放。 */
export class RecessionShading implements ISeriesPrimitive<Time> {
  private attachedParams?: SeriesAttachedParameter<Time>;
  constructor(private readonly bands: () => readonly NberRecessionBand[]) {}
  attached(params: SeriesAttachedParameter<Time>) { this.attachedParams = params; }
  detached() { this.attachedParams = undefined; }
  refresh() { this.attachedParams?.requestUpdate(); }
  paneViews() {
    return [{ zOrder: () => "bottom" as const, renderer: () => ({ draw: (target: CanvasRenderingTarget2D) => this.draw(target) }) }];
  }
  private draw(target: CanvasRenderingTarget2D) {
    const params = this.attachedParams;
    const bands = this.bands();
    if (!params || !bands.length) return;
    const bars = params.series.data();
    const times = bars.map(({ time }) => typeof time === "number" ? time * 1000 : typeof time === "string" ? Date.parse(time) : Date.UTC(time.year, time.month - 1, time.day));
    const scale = params.chart.timeScale();
    const halfBar = scale.options().barSpacing / 2;
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.fillStyle = NBER_RECESSION_MARK_AREA_STYLE.itemStyle.color;
      for (const band of bands) {
        const first = times.findIndex((time) => time >= band.startMs);
        if (first < 0 || times[first] > band.endMs) continue;
        let last = first;
        while (last + 1 < times.length && times[last + 1] <= band.endMs) last++;
        const left = scale.timeToCoordinate(bars[first].time);
        const right = scale.timeToCoordinate(bars[last].time);
        if (left == null || right == null) continue;
        const x = Math.max(0, left - halfBar);
        const end = Math.min(mediaSize.width, right + halfBar);
        if (end > x) context.fillRect(x, 0, end - x, mediaSize.height);
      }
    });
  }
}
