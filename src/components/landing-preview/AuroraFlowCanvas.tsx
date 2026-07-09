"use client";

import { useEffect, useRef } from "react";

type Blob = { x: number; y: number; r: number; phase: number; speed: number; hue: number };

function initBlobs(w: number, h: number): Blob[] {
  return [
    { x: w * 0.25, y: h * 0.35, r: Math.min(w, h) * 0.35, phase: 0, speed: 0.008, hue: 210 },
    { x: w * 0.72, y: h * 0.55, r: Math.min(w, h) * 0.4, phase: 1.4, speed: 0.006, hue: 200 },
    { x: w * 0.5, y: h * 0.7, r: Math.min(w, h) * 0.28, phase: 2.8, speed: 0.01, hue: 220 },
  ];
}

export function AuroraFlowCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef<Blob[]>([]);
  const tRef = useRef(0);
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
      blobsRef.current = initBlobs(w, h);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!reduced) tRef.current += 1;
      const t = tRef.current;

      ctx.clearRect(0, 0, w, h);

      for (const b of blobsRef.current) {
        const ox = Math.sin(t * b.speed + b.phase) * w * 0.06;
        const oy = Math.cos(t * b.speed * 1.3 + b.phase) * h * 0.05;
        const cx = b.x + ox;
        const cy = b.y + oy;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
        g.addColorStop(0, `hsla(${b.hue}, 85%, 62%, 0.28)`);
        g.addColorStop(0.45, `hsla(${b.hue}, 80%, 55%, 0.12)`);
        g.addColorStop(1, "hsla(210, 90%, 60%, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < 40; i++) {
        const sx = ((i * 137.5 + t * 0.3) % w);
        const sy = ((i * 97.3 + t * 0.15) % h);
        const a = 0.15 + 0.35 * Math.sin(t * 0.05 + i);
        ctx.fillStyle = `rgba(94, 179, 255, ${a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
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
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
