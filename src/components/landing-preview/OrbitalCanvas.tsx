"use client";

import { useEffect, useRef } from "react";

type Orbit = {
  rx: number;
  ry: number;
  speed: number;
  phase: number;
  dotR: number;
};

const ORBITS: Orbit[] = [
  { rx: 120, ry: 48, speed: 0.004, phase: 0, dotR: 3 },
  { rx: 180, ry: 72, speed: -0.003, phase: 1.2, dotR: 2.5 },
  { rx: 240, ry: 96, speed: 0.0022, phase: 2.4, dotR: 2 },
  { rx: 300, ry: 120, speed: -0.0018, phase: 0.8, dotR: 2 },
];

export function OrbitalCanvas({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const tRef = useRef(0);

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
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      if (!reduced) tRef.current += 1;

      for (const o of ORBITS) {
        ctx.strokeStyle = "rgba(35, 131, 226, 0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.rx, o.ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        const angle = o.phase + tRef.current * o.speed;
        const x = cx + Math.cos(angle) * o.rx;
        const y = cy + Math.sin(angle) * o.ry;

        ctx.fillStyle = "rgba(35, 131, 226, 0.75)";
        ctx.beginPath();
        ctx.arc(x, y, o.dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(94, 179, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(x, y, o.dotR * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(35, 131, 226, 0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

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
