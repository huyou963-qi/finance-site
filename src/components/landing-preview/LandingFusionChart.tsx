"use client";

import { useEffect, useRef } from "react";

/** 归一化控制点 x∈[0,1] y∈[0,1]（y 越大越靠下） */
const BASE = [
  { x: 0, y: 0.79 },
  { x: 0.1, y: 0.73 },
  { x: 0.2, y: 0.6 },
  { x: 0.3, y: 0.63 },
  { x: 0.4, y: 0.43 },
  { x: 0.5, y: 0.48 },
  { x: 0.6, y: 0.32 },
  { x: 0.7, y: 0.37 },
  { x: 0.8, y: 0.23 },
  { x: 0.9, y: 0.27 },
  { x: 1, y: 0.15 },
];

function lerpY(x: number): number {
  for (let i = 0; i < BASE.length - 1; i++) {
    const a = BASE[i];
    const b = BASE[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      const smooth = t * t * (3 - 2 * t);
      return a.y + (b.y - a.y) * smooth;
    }
  }
  return BASE[BASE.length - 1].y;
}

function sampleCurve(w: number, h: number, t: number, padBottom: number) {
  const pts: { x: number; y: number }[] = [];
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const nx = i / steps;
    const px = nx * w;
    const breath =
      Math.sin(t * 0.018 + nx * 6.2) * h * 0.012 +
      Math.sin(t * 0.011 + nx * 14) * h * 0.006;
    const py = lerpY(nx) * (h - padBottom) + breath;
    pts.push({ x: px, y: py });
  }
  return pts;
}

function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  stroke: string | CanvasGradient,
  width: number,
  alpha = 1,
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i + 1].x) / 2;
    const cy = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

function fillArea(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], h: number, grad: CanvasGradient) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, h);
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i + 1].x) / 2;
    const cy = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.lineTo(last.x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

export function LandingFusionChart({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);
  const beamRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!reduced) {
        tRef.current += 1;
        beamRef.current = (beamRef.current + 0.004) % 1;
      }

      ctx.clearRect(0, 0, w, h);

      const padBottom = 8;
      const pts = sampleCurve(w, h, tRef.current, padBottom);
      const ghost = sampleCurve(w, h, tRef.current + 40, padBottom);

      const areaGrad = ctx.createLinearGradient(0, 0, 0, h);
      areaGrad.addColorStop(0, "rgba(35, 131, 226, 0.22)");
      areaGrad.addColorStop(1, "rgba(35, 131, 226, 0)");
      fillArea(ctx, pts, h, areaGrad);

      const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
      lineGrad.addColorStop(0, "rgba(94, 179, 255, 0.35)");
      lineGrad.addColorStop(0.35, "rgba(35, 131, 226, 0.85)");
      lineGrad.addColorStop(0.65, "rgba(35, 131, 226, 1)");
      lineGrad.addColorStop(1, "rgba(11, 107, 203, 0.7)");

      drawSmoothLine(ctx, ghost, "rgba(94, 179, 255, 0.2)", 4, 0.6);
      drawSmoothLine(ctx, pts, lineGrad, 2.5, 1);

      const glowGrad = ctx.createLinearGradient(0, 0, w, 0);
      glowGrad.addColorStop(0, "rgba(94, 179, 255, 0)");
      glowGrad.addColorStop(0.5, "rgba(94, 179, 255, 0.5)");
      glowGrad.addColorStop(1, "rgba(94, 179, 255, 0)");
      drawSmoothLine(ctx, pts, glowGrad, 8, 0.35);

      const bi = Math.floor(beamRef.current * (pts.length - 1));
      const bp = pts[bi];
      if (bp) {
        const gr = ctx.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, 14);
        gr.addColorStop(0, "rgba(94, 179, 255, 0.95)");
        gr.addColorStop(0.4, "rgba(35, 131, 226, 0.4)");
        gr.addColorStop(1, "rgba(35, 131, 226, 0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`h-full min-h-[220px] w-full md:min-h-[320px] lg:min-h-[420px] ${className}`}
      aria-hidden
    />
  );
}
