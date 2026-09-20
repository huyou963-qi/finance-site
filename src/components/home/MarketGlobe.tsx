"use client";

import type { FeatureCollection, MultiLineString, Polygon } from "geojson";
import type { GeometryObject, Topology } from "topojson-specification";
import { geoCircle, geoGraticule, geoOrthographic, geoPath, geoRotation } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesTopology from "world-atlas/countries-110m.json";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  buildGlobeGeometry,
  clamp01,
  NIGHT_BANDS,
  PIXEL_BITS,
  smoothstep,
  TEXEL_FRACTION_BITS,
  TWILIGHT_BANDS,
  type GlobeGeometry,
} from "./globeLighting";

type Market = { city: string; exchange: string; code: string; symbol: string; lon: number; lat: number; session: string };

const MARKETS: Market[] = [
  { city: "纽约", exchange: "NYSE / Nasdaq", code: "US", symbol: "^GSPC", lon: -74.006, lat: 40.713, session: "09:30–16:00 ET" },
  { city: "伦敦", exchange: "London Stock Exchange", code: "UK", symbol: "^FTSE", lon: -0.128, lat: 51.507, session: "08:00–16:30 GMT" },
  { city: "法兰克福", exchange: "Deutsche Börse", code: "DE", symbol: "^GDAXI", lon: 8.682, lat: 50.111, session: "09:00–17:30 CET" },
  { city: "东京", exchange: "Tokyo Stock Exchange", code: "JP", symbol: "^N225", lon: 139.692, lat: 35.69, session: "09:00–15:30 JST" },
  { city: "香港", exchange: "Hong Kong Exchanges", code: "HK", symbol: "^HSI", lon: 114.169, lat: 22.319, session: "09:30–16:00 HKT" },
  { city: "上海", exchange: "Shanghai Stock Exchange", code: "CN", symbol: "000001.SS", lon: 121.474, lat: 31.23, session: "09:30–15:00 CST" },
  { city: "新加坡", exchange: "Singapore Exchange", code: "SG", symbol: "^STI", lon: 103.82, lat: 1.352, session: "09:00–17:00 SGT" },
  { city: "悉尼", exchange: "Australian Securities Exchange", code: "AU", symbol: "^AXJO", lon: 151.209, lat: -33.869, session: "10:00–16:00 AET" },
];

/** CanvasRenderingContext2D.roundRect 在部分较旧浏览器（如 Chrome < 99）上不存在，手动画路径兜底。 */
function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

const MARKET_LABEL_OFFSET_Y: Record<string, number> = {
  UK: -11,
  DE: 11,
  JP: -9,
  CN: 9,
  HK: -7,
  SG: 7,
};

const CITY_LIGHTS: Array<[number, number]> = [
  [-122.42, 37.77], [-118.24, 34.05], [-87.63, 41.88], [-95.37, 29.76], [-99.13, 19.43],
  [-77.04, 38.91], [-71.06, 42.36], [-43.17, -22.91], [-58.38, -34.6], [-3.7, 40.42],
  [12.5, 41.9], [4.9, 52.37], [18.07, 59.33], [30.52, 50.45], [28.98, 41.01],
  [31.24, 30.04], [3.38, 6.52], [28.05, -26.2], [37.62, 55.75], [46.68, 24.71],
  [51.39, 35.69], [77.21, 28.61], [77.59, 12.97], [90.41, 23.81], [100.5, 13.76],
  [106.85, -6.21], [116.41, 39.9], [113.26, 23.13], [121.57, 25.04], [135.5, 34.69],
  [144.96, -37.81], [174.76, -36.85], [-123.12, 49.28], [-73.57, 45.5], [-80.19, 25.76],
];

const topology = countriesTopology as unknown as Topology;
const countryObject = countriesTopology.objects.countries as unknown as GeometryObject;
const countries = feature(topology, countryObject) as FeatureCollection;
const borders = mesh(topology, countryObject, (a, b) => a !== b) as MultiLineString;

function solarPosition(date: Date) {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - yearStart) / 86_400_000);
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const gamma = (2 * Math.PI / 365) * (day - 1 + (minutes / 60 - 12) / 24);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  let longitude = (720 - minutes - equation) / 4;
  longitude = ((longitude + 540) % 360) - 180;
  return { lon: longitude, lat: declination * 180 / Math.PI };
}

function illumination(lon: number, lat: number, sun: { lon: number; lat: number }) {
  const toRad = Math.PI / 180;
  return Math.sin(lat * toRad) * Math.sin(sun.lat * toRad)
    + Math.cos(lat * toRad) * Math.cos(sun.lat * toRad) * Math.cos((lon - sun.lon) * toRad);
}

function formatUtc(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

const CLOCK_TICK_MS = 30_000;
function subscribeClock(onTick: () => void) {
  const timer = window.setInterval(onTick, CLOCK_TICK_MS);
  return () => window.clearInterval(timer);
}
/** 按 30 秒取整，同一窗口内 snapshot 保持稳定 */
const clockSnapshot = () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS;
/** 首页是 build 期静态预渲染：服务端/水合阶段不出时间，否则预渲染时刻≠浏览器时刻触发 React #418 */
const serverClockSnapshot = () => null;

export function MarketGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef<[number, number, number]>([-104, -18, 0]);
  const zoomRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number, number] } | null>(null);
  const pauseUntilRef = useRef(0);
  const activeMarketRef = useRef<Market>(MARKETS[5]);
  const marketChangesRef = useRef<Record<string, number>>({});
  const [selected, setSelected] = useState(MARKETS[5]);
  const nowMs = useSyncExternalStore(subscribeClock, clockSnapshot, serverClockSnapshot);

  useEffect(() => {
    const controller = new AbortController();
    const loadMarketChanges = async () => {
      // 不用 Promise.allSettled / Array.prototype.at：部分旧 WebKit 内核浏览器（如傲游 5）缺失，会直接抛未捕获异常
      const results = await Promise.all(MARKETS.map(async (market) => {
        const params = new URLSearchParams({
          symbol: market.symbol,
          interval: "1d",
          limit: "2",
          adjust: "none",
        });
        const response = await fetch(`/api/data/klines?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { candles?: Array<{ close?: number }> };
        const candles = payload.candles ?? [];
        const previous = candles[candles.length - 2]?.close;
        const latest = candles[candles.length - 1]?.close;
        if (typeof previous !== "number" || typeof latest !== "number" || previous === 0) return null;
        return [market.code, (latest / previous - 1) * 100] as const;
      }).map((task) => task.catch(() => null)));
      if (controller.signal.aborted) return;
      marketChangesRef.current = Object.fromEntries(
        results.flatMap((result) => result ? [result] : []),
      );
    };
    void loadMarketChanges();
    const timer = window.setInterval(() => void loadMarketChanges(), 300_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const earthTexture = new Image();
    const textureSource = document.createElement("canvas");
    const textureSourceContext = textureSource.getContext("2d", { willReadFrequently: true });
    const textureGlobe = document.createElement("canvas");
    const textureGlobeContext = textureGlobe.getContext("2d");
    /** 源贴图的 Uint32 视图；每帧只从这里按行查表 */
    let textureWords: Uint32Array | null = null;
    let textureWidth = 0;
    let textureHeight = 0;
    earthTexture.decoding = "async";
    earthTexture.onload = () => {
      if (!textureSourceContext) return;
      textureSource.width = earthTexture.naturalWidth;
      textureSource.height = earthTexture.naturalHeight;
      // 调色一次性烘焙进贴图。原先是每帧给 drawImage 挂 filter，而 Canvas2D 的
      // filter 会强制额外一遍离屏合成，对 ~950px 的图每帧要花掉好几毫秒。
      textureSourceContext.filter = "contrast(1.06) saturate(1.04)";
      textureSourceContext.drawImage(earthTexture, 0, 0);
      textureSourceContext.filter = "none";
      const pixels = textureSourceContext.getImageData(0, 0, textureSource.width, textureSource.height);
      textureWords = new Uint32Array(pixels.data.buffer);
      textureWidth = textureSource.width;
      textureHeight = textureSource.height;
    };
    earthTexture.src = "/earth-blue-marble-v1.png";
    const projection = geoOrthographic().precision(0.7).clipAngle(90);
    const path = geoPath(projection, context);
    const minorGraticule = geoGraticule().stepMinor([10, 10]).stepMajor([90, 360])();
    const majorGraticule = geoGraticule().stepMinor([30, 30]).stepMajor([90, 360])();
    const referenceLatitudes = [-66.563, -23.436, 0, 23.436, 66.563].map((lat) => ({
      type: "LineString" as const,
      coordinates: Array.from({ length: 181 }, (_, index) => [-180 + index * 2, lat]),
    }));
    let frame = 0;
    let last = performance.now();
    let geometry: GlobeGeometry | null = null;
    let globePixels: ImageData | null = null;
    let globeWords: Uint32Array | null = null;
    /** 拖动中倾角 φ 每帧都在变，用低分辨率重建（约 7ms）避开满分辨率的 ~34ms 卡顿 */
    const DRAG_GEOMETRY_SIZE = 400;

    // 尺寸改用 ResizeObserver：原先每帧 getBoundingClientRect 会强制一次同步布局
    let cssWidth = canvas.clientWidth || 320;
    let cssHeight = canvas.clientHeight || 320;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      cssWidth = rect.width || cssWidth;
      cssHeight = rect.height || cssHeight;
    });
    observer.observe(canvas);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      const width = Math.max(320, Math.round(cssWidth * dpr));
      const height = Math.max(320, Math.round(cssHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      return { width, height, dpr };
    };

    /** 夜灯辉光预渲染成 sprite：原先每盏灯一次 shadowBlur，35 盏就是 35 遍离屏模糊 */
    const cityLightSprite = document.createElement("canvas");
    cityLightSprite.width = 64;
    cityLightSprite.height = 64;
    const cityLightSpriteContext = cityLightSprite.getContext("2d");
    if (cityLightSpriteContext) {
      const glow = cityLightSpriteContext.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, "rgba(255, 219, 150, 1)");
      glow.addColorStop(0.18, "rgba(255, 201, 105, 0.95)");
      glow.addColorStop(0.45, "rgba(255, 170, 72, 0.34)");
      glow.addColorStop(1, "rgba(255, 170, 72, 0)");
      cityLightSpriteContext.fillStyle = glow;
      cityLightSpriteContext.fillRect(0, 0, 64, 64);
    }

    /** 边缘减光是屏幕空间的径向渐变，与经纬无关，只随半径变，缓存起来复用 */
    let limbGradient: CanvasGradient | null = null;
    let limbGradientKey = "";
    const getLimbGradient = (cx: number, cy: number, radius: number) => {
      const key = `${cx.toFixed(1)}:${cy.toFixed(1)}:${radius.toFixed(1)}`;
      if (limbGradient && limbGradientKey === key) return limbGradient;
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      for (let i = 0; i <= 10; i += 1) {
        const t = i / 10;
        const z = Math.sqrt(Math.max(0, 1 - t * t));
        // 原逐像素式：limb = 0.7 + 0.3 * smoothstep(0.02, 0.72, z)，以黑色叠加即等价于乘法
        gradient.addColorStop(t, `rgba(0, 0, 0, ${(0.3 * (1 - smoothstep(0.02, 0.72, z))).toFixed(4)})`);
      }
      limbGradient = gradient;
      limbGradientKey = key;
      return gradient;
    };

    /**
     * 夜半球那 30 多档是逐档整盘 alpha 混合，成本在**填充面积**而非顶点数：
     * 满分辨率下约 1950 万像素/帧，实测 13ms。而昼夜明暗本身是低频渐变，
     * 放在低分辨率离屏画好再放大即可，像素量降一个量级，边缘变柔反而更自然。
     */
    const NIGHT_LAYER_SIZE = 320;
    const nightCanvas = document.createElement("canvas");
    nightCanvas.width = NIGHT_LAYER_SIZE;
    nightCanvas.height = NIGHT_LAYER_SIZE;
    const nightContext = nightCanvas.getContext("2d");
    // precision 是**重采样容差**：值越小插的点越多。这层只有 320px 且会被平滑放大，
    // 没必要按亚像素精度重采样。
    const nightProjection = geoOrthographic().precision(2).clipAngle(90)
      .translate([NIGHT_LAYER_SIZE / 2, NIGHT_LAYER_SIZE / 2])
      .scale(NIGHT_LAYER_SIZE / 2);
    const nightPath = nightContext ? geoPath(nightProjection, nightContext) : null;

    /**
     * 覆盖层的多边形只跟对日点有关，而太阳每分钟才走 0.25°，没必要每帧重算 30 多个
     * geoCircle。按 0.1°（约 24 秒）量化缓存，移动超过这个量级才重建。
     */
    type LightingShapes = { night: Polygon[]; twilight: Array<[Polygon, Polygon]> };
    let lightingShapes: LightingShapes | null = null;
    let lightingShapesKey = "";
    const getLightingShapes = (sun: { lon: number; lat: number }) => {
      const key = `${Math.round(sun.lon * 10)}:${Math.round(sun.lat * 10)}`;
      if (lightingShapes && lightingShapesKey === key) return lightingShapes;
      const antisolar: [number, number] = [sun.lon + 180, -sun.lat];
      // geoCircle 默认每 6° 取一点；单档对比度仅约 2.4%，又要整层放大平滑，
      // 取粗到 18° 也看不出棱角，顶点数直接降到三分之一
      const circle = (radius: number) =>
        geoCircle().center(antisolar).radius(radius).precision(18)() as Polygon;
      lightingShapes = {
        night: NIGHT_BANDS.map((band) => circle(band.radius)),
        twilight: TWILIGHT_BANDS.map((band) => [circle(band.outer), circle(band.inner)] as [Polygon, Polygon]),
      };
      lightingShapesKey = key;
      return lightingShapes;
    };
    const isVisible = (lon: number, lat: number) => {
      const rotated = geoRotation(rotationRef.current)([lon, lat]);
      return Math.cos(rotated[1] * Math.PI / 180) * Math.cos(rotated[0] * Math.PI / 180) > 0;
    };
    const drawTexturedEarth = (
      target: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      radius: number,
    ) => {
      if (!textureWords || !textureGlobeContext) return false;
      // 量化到 32 的倍数，免得滚轮缩放每动一格都重建一次几何缓存
      const size = Math.min(
        textureHeight,
        Math.max(320, Math.ceil(radius * 2 / 32) * 32),
      );
      const phi = rotationRef.current[1];
      // 倾角在拖动中逐帧变化，满分辨率重建约 34ms 会丢帧，降一档分辨率、松手后补回；
      // 横向拖动不改 φ，不触发重建，画质保持不变
      const phiChanged = geometry != null && geometry.phi !== phi;
      const targetSize = dragRef.current && phiChanged ? Math.min(DRAG_GEOMETRY_SIZE, size) : size;
      if (!geometry || geometry.size !== targetSize || geometry.phi !== phi) {
        geometry = buildGlobeGeometry(targetSize, phi, textureWidth, textureHeight);
      }
      if (textureGlobe.width !== targetSize || textureGlobe.height !== targetSize) {
        textureGlobe.width = targetSize;
        textureGlobe.height = targetSize;
        globePixels = null;
      }
      if (!globePixels || globePixels.width !== targetSize) {
        // 复用同一块缓冲：原先每帧 createImageData 会新分配约 3MB，持续制造 GC 压力
        globePixels = textureGlobeContext.createImageData(targetSize, targetSize);
        globeWords = new Uint32Array(globePixels.data.buffer);
      }
      if (!globeWords) return false;

      const { count, dst, srcRow, baseFixed, alphaBits } = geometry;
      const { rgbMask } = PIXEL_BITS;
      const source = textureWords;
      const output = globeWords;
      const fixedWidth = textureWidth << TEXEL_FRACTION_BITS;
      let shift = Math.round(-rotationRef.current[0] / 360 * fixedWidth) % fixedWidth;
      if (shift < 0) shift += fixedWidth;
      output.fill(0);
      // 昼夜明暗已移到覆盖层，这里只剩一次横向查表：
      // 整帧无三角函数、无浮点取模、无逐通道运算
      for (let k = 0; k < count; k += 1) {
        let fixed = baseFixed[k] + shift;
        if (fixed >= fixedWidth) fixed -= fixedWidth;
        output[dst[k]] = (source[srcRow[k] + (fixed >> TEXEL_FRACTION_BITS)] & rgbMask) | alphaBits[k];
      }
      textureGlobeContext.putImageData(globePixels, 0, 0);
      target.save();
      target.beginPath();
      target.arc(cx, cy, radius, 0, Math.PI * 2);
      target.clip();
      target.imageSmoothingEnabled = true;
      target.imageSmoothingQuality = "high";
      target.drawImage(textureGlobe, cx - radius, cy - radius, radius * 2, radius * 2);
      target.restore();
      return true;
    };

    /**
     * 昼夜与边缘减光：以对日点为圆心叠若干张 geoCircle 圆盘逼近原来的 smoothstep 曲线。
     * 每张只是一次 canvas fill，取代了原先 60 余万次逐像素光照运算。
     */
    const drawLighting = (
      cx: number,
      cy: number,
      radius: number,
      sun: { lon: number; lat: number },
    ) => {
      const shapes = getLightingShapes(sun);
      context.save();
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.clip();

      if (nightContext && nightPath) {
        nightProjection.rotate(rotationRef.current);
        nightContext.clearRect(0, 0, NIGHT_LAYER_SIZE, NIGHT_LAYER_SIZE);
        nightContext.fillStyle = "rgb(6, 14, 32)";
        shapes.night.forEach((shape, index) => {
          nightContext.beginPath();
          nightPath(shape);
          nightContext.globalAlpha = NIGHT_BANDS[index].alpha;
          nightContext.fill();
        });
        nightContext.globalAlpha = 1;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(nightCanvas, cx - radius, cy - radius, radius * 2, radius * 2);
      }

      // 晨昏线暖色辉光：外圆 + 内圆用 evenodd 取环带
      context.globalCompositeOperation = "lighter";
      context.fillStyle = "rgb(255, 170, 72)";
      shapes.twilight.forEach(([outer, inner], index) => {
        context.beginPath();
        path(outer);
        path(inner);
        context.globalAlpha = TWILIGHT_BANDS[index].alpha;
        context.fill("evenodd");
      });
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";

      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fillStyle = getLimbGradient(cx, cy, radius);
      context.fill();
      context.restore();
    };

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      // 原先有个 42ms 闸门把帧率压到 24fps，配 60Hz 的 rAF 会让实际间隔在 50/33ms
      // 之间来回跳，本身就是肉眼可见的顿挫。渲染成本降下来之后不再需要它。
      const elapsed = Math.min(90, time - last);
      last = time;
      if (!dragRef.current && time > pauseUntilRef.current) {
        rotationRef.current[0] = (rotationRef.current[0] + elapsed * 0.0017) % 360;
      }
      const { width, height, dpr } = resize();
      const radius = Math.min(width, height) * 0.43 * zoomRef.current;
      const cx = width / 2;
      const cy = height / 2;
      projection.translate([cx, cy]).scale(radius).rotate(rotationRef.current);
      context.clearRect(0, 0, width, height);

      context.save();
      context.beginPath();
      context.ellipse(cx, cy + radius * 0.93, radius * 0.66, radius * 0.12, 0, 0, Math.PI * 2);
      context.fillStyle = "rgba(28, 55, 74, 0.08)";
      context.shadowColor = "rgba(28, 55, 74, 0.12)";
      context.shadowBlur = 30 * dpr;
      context.fill();
      context.restore();

      context.save();
      context.lineWidth = 0.7 * dpr;
      for (const [index, factor] of [1.11, 1.24, 1.4].entries()) {
        context.beginPath();
        context.ellipse(cx, cy, radius * factor, radius * factor * (0.28 + index * 0.025), -0.24, 0, Math.PI * 2);
        context.strokeStyle = index === 0 ? "rgba(49, 100, 137, 0.09)" : "rgba(49, 100, 137, 0.05)";
        context.stroke();
      }
      context.restore();

      const sun = solarPosition(new Date());
      const textureDrawn = drawTexturedEarth(context, cx, cy, radius);
      if (!textureDrawn) {
        const sunPoint = projection([sun.lon, sun.lat]);
        const oceanGradient = context.createRadialGradient(
          sunPoint?.[0] ?? cx, sunPoint?.[1] ?? cy, radius * 0.04, cx, cy, radius * 1.1,
        );
        oceanGradient.addColorStop(0, "#f7fcff");
        oceanGradient.addColorStop(0.42, "#d9ebf2");
        oceanGradient.addColorStop(1, "#aac8d6");
        context.save();
        context.beginPath();
        path({ type: "Sphere" });
        context.fillStyle = oceanGradient;
        context.shadowColor = "rgba(28, 92, 134, 0.22)";
        context.shadowBlur = 44 * dpr;
        context.fill();
        context.restore();
        countries.features.forEach((country, index) => {
          context.beginPath();
          path(country);
          const palette = ["#c4d8df", "#cbdde4", "#bdd3db"];
          context.fillStyle = palette[index % palette.length];
          context.fill();
        });
      }
      drawLighting(cx, cy, radius, sun);
      context.beginPath(); path(minorGraticule);
      context.strokeStyle = "rgba(42, 86, 112, 0.095)"; context.lineWidth = Math.max(0.55, 0.55 * dpr); context.stroke();
      context.beginPath(); path(majorGraticule);
      context.strokeStyle = "rgba(35, 80, 109, 0.13)"; context.lineWidth = Math.max(0.75, 0.75 * dpr); context.stroke();
      referenceLatitudes.forEach((line, index) => {
        context.beginPath(); path(line);
        context.setLineDash(index === 2 ? [] : [3 * dpr, 5 * dpr]);
        context.strokeStyle = index === 2 ? "rgba(30, 91, 128, 0.19)" : "rgba(30, 91, 128, 0.12)";
        context.lineWidth = (index === 2 ? 1 : 0.75) * dpr; context.stroke();
      });
      context.setLineDash([]);
      context.beginPath(); path(borders);
      context.strokeStyle = "rgba(255, 255, 255, 0.58)"; context.lineWidth = Math.max(0.55, 0.62 * dpr); context.stroke();

      context.save();
      CITY_LIGHTS.forEach(([lon, lat]) => {
        if (!isVisible(lon, lat)) return;
        const darkness = clamp01((-illumination(lon, lat, sun) - 0.02) * 2.5);
        if (darkness <= 0) return;
        const point = projection([lon, lat]);
        if (!point) return;
        // 预渲染 sprite 代替 shadowBlur：同样的光晕，但不必每盏灯跑一遍离屏模糊
        const glowSize = (0.8 + darkness * 1.1) * 7 * dpr;
        context.globalAlpha = 0.3 + darkness * 0.6;
        context.drawImage(cityLightSprite, point[0] - glowSize / 2, point[1] - glowSize / 2, glowSize, glowSize);
      });
      context.restore();
      const pulse = (Math.sin(time / 500) + 1) / 2;
      MARKETS.forEach((market) => {
        if (!isVisible(market.lon, market.lat)) return;
        const point = projection([market.lon, market.lat]);
        if (!point) return;
        const active = activeMarketRef.current.city === market.city;
        const dark = illumination(market.lon, market.lat, sun) < -0.05;
        const color = dark ? "244, 167, 72" : "35, 131, 226";
        context.beginPath(); context.arc(point[0], point[1], (7 + pulse * (active ? 9 : 4)) * dpr, 0, Math.PI * 2);
        context.fillStyle = `rgba(${color}, ${active ? 0.12 - pulse * 0.04 : 0.055})`; context.fill();
        context.beginPath(); context.arc(point[0], point[1], (active ? 4.5 : 3.2) * dpr, 0, Math.PI * 2);
        context.fillStyle = `rgb(${color})`; context.fill();
        context.strokeStyle = "rgba(255,255,255,0.95)"; context.lineWidth = 1.4 * dpr; context.stroke();
        const change = marketChangesRef.current[market.code];
        if (typeof change === "number") {
          const changeLabel = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
          context.save();
          context.font = `500 ${9.5 * dpr}px ui-sans-serif, system-ui, sans-serif`;
          const cityWidth = context.measureText(market.city).width;
          context.font = `650 ${10.5 * dpr}px ui-sans-serif, system-ui, sans-serif`;
          const changeWidth = context.measureText(changeLabel).width;
          const paddingX = 8 * dpr;
          const dotGap = 8 * dpr;
          const textGap = 6 * dpr;
          const boxHeight = 23 * dpr;
          const boxWidth = paddingX * 2 + dotGap + cityWidth + textGap + changeWidth;
          const placeLeft = point[0] > cx;
          const connectorLength = 10 * dpr;
          const boxX = placeLeft ? point[0] - boxWidth - connectorLength : point[0] + connectorLength;
          const boxY = point[1] - boxHeight / 2 + (MARKET_LABEL_OFFSET_Y[market.code] ?? 0) * dpr;
          const marketColor = change >= 0 ? "16, 185, 129" : "239, 68, 68";

          context.beginPath();
          context.moveTo(point[0] + (placeLeft ? -4 : 4) * dpr, point[1]);
          context.lineTo(placeLeft ? boxX + boxWidth : boxX, boxY + boxHeight / 2);
          context.strokeStyle = "rgba(226, 232, 240, 0.5)";
          context.lineWidth = 0.75 * dpr;
          context.stroke();

          context.beginPath();
          roundRectPath(context, boxX, boxY, boxWidth, boxHeight, 7 * dpr);
          context.fillStyle = "rgba(8, 18, 38, 0.84)";
          context.shadowColor = "rgba(2, 8, 23, 0.28)";
          context.shadowBlur = 8 * dpr;
          context.shadowOffsetY = 2 * dpr;
          context.fill();
          context.shadowColor = "transparent";
          context.shadowBlur = 0;
          context.shadowOffsetY = 0;
          context.strokeStyle = "rgba(226, 232, 240, 0.2)";
          context.lineWidth = 0.7 * dpr;
          context.stroke();

          const middleY = boxY + boxHeight / 2;
          context.beginPath();
          context.arc(boxX + paddingX + 1.5 * dpr, middleY, 2.25 * dpr, 0, Math.PI * 2);
          context.fillStyle = `rgb(${marketColor})`;
          context.fill();

          const cityX = boxX + paddingX + dotGap;
          context.font = `500 ${9.5 * dpr}px ui-sans-serif, system-ui, sans-serif`;
          context.fillStyle = "rgba(226, 232, 240, 0.72)";
          context.textBaseline = "middle";
          context.fillText(market.city, cityX, middleY);
          context.font = `650 ${10.5 * dpr}px ui-sans-serif, system-ui, sans-serif`;
          context.fillStyle = `rgb(${marketColor})`;
          context.fillText(changeLabel, cityX + cityWidth + textGap, middleY);
          context.restore();
        }
      });
      context.save(); context.beginPath(); path({ type: "Sphere" });
      context.strokeStyle = "rgba(76, 137, 169, 0.22)"; context.lineWidth = 1.2 * dpr;
      context.shadowColor = "rgba(97, 180, 218, 0.55)"; context.shadowBlur = 18 * dpr; context.stroke(); context.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      earthTexture.onload = null;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const selectNearest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const radius = Math.min(canvas.width, canvas.height) * 0.43 * zoomRef.current;
    const projection = geoOrthographic().translate([canvas.width / 2, canvas.height / 2]).scale(radius).rotate(rotationRef.current);
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    let nearest: { market: Market; distance: number } | null = null;
    for (const market of MARKETS) {
      const rotated = geoRotation(rotationRef.current)([market.lon, market.lat]);
      if (Math.cos(rotated[1] * Math.PI / 180) * Math.cos(rotated[0] * Math.PI / 180) <= 0) continue;
      const point = projection([market.lon, market.lat]);
      if (!point) continue;
      const distance = Math.hypot(point[0] - x, point[1] - y);
      if (!nearest || distance < nearest.distance) nearest = { market, distance };
    }
    if (nearest && nearest.distance < 24 * dpr) {
      activeMarketRef.current = nearest.market;
      setSelected(nearest.market);
    }
  };

  const focusMarket = (market: Market) => {
    activeMarketRef.current = market;
    setSelected(market);
    rotationRef.current = [-market.lon, -market.lat, 0];
    pauseUntilRef.current = performance.now() + 6_000;
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[820px] select-none" aria-label="全球主要资本市场交互地球">
      <canvas ref={canvasRef} className="h-full w-full cursor-grab touch-none active:cursor-grabbing" role="img" tabIndex={0}
        aria-label="可拖动旋转的全球市场地球。方向键旋转，滚轮缩放，市场节点可点击。"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, rotation: [...rotationRef.current] };
          pauseUntilRef.current = performance.now() + 6_000;
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          rotationRef.current = [drag.rotation[0] + (event.clientX - drag.x) * 0.28,
            Math.max(-78, Math.min(78, drag.rotation[1] - (event.clientY - drag.y) * 0.22)), 0];
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) selectNearest(event.clientX, event.clientY);
        }}
        onPointerCancel={() => { dragRef.current = null; }}
        onWheel={(event) => {
          event.preventDefault();
          zoomRef.current = Math.max(0.82, Math.min(1.13, zoomRef.current - event.deltaY * 0.0006));
          pauseUntilRef.current = performance.now() + 6_000;
        }}
        onKeyDown={(event) => {
          const [lon, lat] = rotationRef.current;
          if (event.key === "ArrowLeft") rotationRef.current = [lon - 5, lat, 0];
          else if (event.key === "ArrowRight") rotationRef.current = [lon + 5, lat, 0];
          else if (event.key === "ArrowUp") rotationRef.current = [lon, Math.min(78, lat + 5), 0];
          else if (event.key === "ArrowDown") rotationRef.current = [lon, Math.max(-78, lat - 5), 0];
          else return;
          event.preventDefault(); pauseUntilRef.current = performance.now() + 6_000;
        }}
      />
      <div className="pointer-events-none absolute left-[8%] top-[8%] rounded-full border border-slate-200 bg-white/82 px-3 py-1.5 text-[11px] font-medium tracking-wide text-slate-500 shadow-sm backdrop-blur-md">
        LIVE · {nowMs == null ? "--:--" : formatUtc(new Date(nowMs))} UTC
      </div>
      <div className="absolute bottom-[4%] left-[2%] z-20 w-[84%] rounded-2xl border border-slate-200/85 bg-white/88 p-3.5 shadow-[0_18px_60px_rgba(28,55,74,0.13)] backdrop-blur-xl sm:w-[68%] sm:p-4 lg:-left-[3%] lg:bottom-[8%]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#00bfa5]">{selected.code} MARKET</div>
            <div className="mt-0.5 text-base font-semibold text-slate-900">{selected.city} · {selected.exchange}</div>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-5 text-slate-500">{selected.session}</div>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="选择主要市场">
          {MARKETS.map((market) => (
            <button key={market.code} type="button" onClick={() => focusMarket(market)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${selected.code === market.code ? "bg-[#00bfa5] text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"}`}>
              {market.city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
