"use client";

import type { FeatureCollection, MultiLineString } from "geojson";
import type { GeometryObject, Topology } from "topojson-specification";
import { geoGraticule, geoOrthographic, geoPath, geoRotation } from "d3-geo";
import { feature, mesh } from "topojson-client";
import countriesTopology from "world-atlas/countries-110m.json";
import { useEffect, useRef, useState } from "react";

type Market = { city: string; exchange: string; code: string; lon: number; lat: number; session: string };

const MARKETS: Market[] = [
  { city: "纽约", exchange: "NYSE / Nasdaq", code: "US", lon: -74.006, lat: 40.713, session: "09:30–16:00 ET" },
  { city: "伦敦", exchange: "London Stock Exchange", code: "UK", lon: -0.128, lat: 51.507, session: "08:00–16:30 GMT" },
  { city: "法兰克福", exchange: "Deutsche Börse", code: "DE", lon: 8.682, lat: 50.111, session: "09:00–17:30 CET" },
  { city: "东京", exchange: "Tokyo Stock Exchange", code: "JP", lon: 139.692, lat: 35.69, session: "09:00–15:30 JST" },
  { city: "香港", exchange: "Hong Kong Exchanges", code: "HK", lon: 114.169, lat: 22.319, session: "09:30–16:00 HKT" },
  { city: "上海", exchange: "Shanghai Stock Exchange", code: "CN", lon: 121.474, lat: 31.23, session: "09:30–15:00 CST" },
  { city: "新加坡", exchange: "Singapore Exchange", code: "SG", lon: 103.82, lat: 1.352, session: "09:00–17:00 SGT" },
  { city: "悉尼", exchange: "Australian Securities Exchange", code: "AU", lon: 151.209, lat: -33.869, session: "10:00–16:00 AET" },
];

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

function clamp01(value: number) { return Math.max(0, Math.min(1, value)); }

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

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

export function MarketGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef<[number, number, number]>([-104, -18, 0]);
  const zoomRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number; rotation: [number, number, number] } | null>(null);
  const pauseUntilRef = useRef(0);
  const activeMarketRef = useRef<Market>(MARKETS[5]);
  const [selected, setSelected] = useState(MARKETS[5]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const projection = geoOrthographic().precision(0.35).clipAngle(90);
    const path = geoPath(projection, context);
    const minorGraticule = geoGraticule().stepMinor([10, 10]).stepMajor([90, 360])();
    const majorGraticule = geoGraticule().stepMinor([30, 30]).stepMajor([90, 360])();
    const referenceLatitudes = [-66.563, -23.436, 0, 23.436, 66.563].map((lat) => ({
      type: "LineString" as const,
      coordinates: Array.from({ length: 181 }, (_, index) => [-180 + index * 2, lat]),
    }));
    let frame = 0;
    let last = performance.now();
    let lastPaint = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      const width = Math.max(320, Math.round(rect.width * dpr));
      const height = Math.max(320, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      return { width, height, dpr };
    };
    const isVisible = (lon: number, lat: number) => {
      const rotated = geoRotation(rotationRef.current)([lon, lat]);
      return Math.cos(rotated[1] * Math.PI / 180) * Math.cos(rotated[0] * Math.PI / 180) > 0;
    };

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - lastPaint < 42) return;
      const elapsed = Math.min(90, time - last);
      last = time;
      lastPaint = time;
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

      const rotatedSun = geoRotation(rotationRef.current)([sun.lon, sun.lat]);
      const lambda = rotatedSun[0] * Math.PI / 180;
      const phi = rotatedSun[1] * Math.PI / 180;
      const sunVector = { x: Math.cos(phi) * Math.sin(lambda), y: Math.sin(phi), z: Math.cos(phi) * Math.cos(lambda) };
      const image = context.getImageData(0, 0, width, height);
      const data = image.data;
      const left = Math.max(0, Math.floor(cx - radius));
      const right = Math.min(width, Math.ceil(cx + radius));
      const top = Math.max(0, Math.floor(cy - radius));
      const bottom = Math.min(height, Math.ceil(cy + radius));
      for (let y = top; y < bottom; y += 1) {
        const py = -(y + 0.5 - cy) / radius;
        for (let x = left; x < right; x += 1) {
          const px = (x + 0.5 - cx) / radius;
          const rr = px * px + py * py;
          if (rr > 1) continue;
          const light = px * sunVector.x + py * sunVector.y + Math.sqrt(1 - rr) * sunVector.z;
          const pz = Math.sqrt(1 - rr);
          const night = 0.6 * (1 - smoothstep(-0.22, 0.2, light));
          const twilight = 0.17 * (1 - smoothstep(0.01, 0.2, Math.abs(light)));
          const dayGlow = 0.04 * smoothstep(0.3, 0.96, light);
          const limb = 0.06 * (1 - smoothstep(0.03, 0.68, pz));
          const index = (y * width + x) * 4;
          data[index] = data[index] * (1 - night) + 18 * night;
          data[index + 1] = data[index + 1] * (1 - night) + 39 * night;
          data[index + 2] = data[index + 2] * (1 - night) + 64 * night;
          data[index] = data[index] * (1 - twilight) + 244 * twilight;
          data[index + 1] = data[index + 1] * (1 - twilight) + 169 * twilight;
          data[index + 2] = data[index + 2] * (1 - twilight) + 79 * twilight;
          data[index] = data[index] * (1 - dayGlow) + 255 * dayGlow;
          data[index + 1] = data[index + 1] * (1 - dayGlow) + 252 * dayGlow;
          data[index + 2] = data[index + 2] * (1 - dayGlow) + 235 * dayGlow;
          data[index] = data[index] * (1 - limb) + 30 * limb;
          data[index + 1] = data[index + 1] * (1 - limb) + 64 * limb;
          data[index + 2] = data[index + 2] * (1 - limb) + 91 * limb;
        }
      }
      context.putImageData(image, 0, 0);

      CITY_LIGHTS.forEach(([lon, lat]) => {
        if (!isVisible(lon, lat)) return;
        const darkness = clamp01((-illumination(lon, lat, sun) - 0.02) * 2.5);
        if (darkness <= 0) return;
        const point = projection([lon, lat]);
        if (!point) return;
        context.beginPath(); context.arc(point[0], point[1], (0.8 + darkness * 1.1) * dpr, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 201, 105, ${0.3 + darkness * 0.6})`;
        context.shadowColor = "rgba(255, 170, 72, 0.9)"; context.shadowBlur = 7 * dpr; context.fill();
      });
      context.shadowBlur = 0;
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
      });
      context.save(); context.beginPath(); path({ type: "Sphere" });
      context.strokeStyle = "rgba(76, 137, 169, 0.22)"; context.lineWidth = 1.2 * dpr;
      context.shadowColor = "rgba(97, 180, 218, 0.55)"; context.shadowBlur = 18 * dpr; context.stroke(); context.restore();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
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
    <div className="relative mx-auto aspect-square w-full max-w-[680px] select-none" aria-label="全球主要资本市场交互地球">
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
        LIVE · {formatUtc(now)} UTC
      </div>
      <div className="absolute bottom-[7%] left-1/2 w-[84%] -translate-x-1/2 rounded-2xl border border-slate-200/85 bg-white/88 p-3.5 shadow-[0_18px_60px_rgba(28,55,74,0.13)] backdrop-blur-xl sm:w-[70%] sm:p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600">{selected.code} MARKET</div>
            <div className="mt-0.5 text-base font-semibold text-slate-900">{selected.city} · {selected.exchange}</div>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-5 text-slate-500">{selected.session}</div>
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="选择主要市场">
          {MARKETS.map((market) => (
            <button key={market.code} type="button" onClick={() => focusMarket(market)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${selected.code === market.code ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>
              {market.city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
