export function changeArrow(cur: number | null, prev: number | null): string {
  if (cur === null || prev === null) return "—";
  const d = cur - prev;
  if (Math.abs(d) < 0.01) return "→";
  return d > 0 ? "↑" : "↓";
}

export function formatValue(v: number | null, unit: string): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  if (unit === "%" || unit.includes("%")) return `${v.toFixed(1)}%`;
  if (unit === "bp") return `${v.toFixed(0)} bp`;
  if (unit === "指数") return v.toFixed(1);
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(2);
}

export function sparklinePath(data: number[], w: number, h: number): string {
  if (data.length === 0) return "";
  if (data.length === 1) {
    const y = h / 2;
    return `M 0 ${y} L ${w} ${y}`;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function timingAccent(timing: "leading" | "coincident" | "lagging"): string {
  if (timing === "leading") return "#0b6bcb";
  if (timing === "coincident") return "#b45309";
  return "#eb5757";
}

export function prosperityLevel(index: number): string {
  if (index >= 55) return "偏强";
  if (index >= 45) return "中性";
  return "偏弱";
}

export function prosperityTone(index: number): string {
  if (index >= 55) return "text-fs-accent-text";
  if (index >= 45) return "text-fs-text";
  return "text-fs-negative";
}

export function cycleBadgeClass(tag: "cyclical" | "growth" | "defensive" | "mixed"): string {
  if (tag === "cyclical") return "bg-orange-50 text-orange-700";
  if (tag === "growth") return "bg-blue-50 text-blue-700";
  if (tag === "defensive") return "bg-emerald-50 text-emerald-700";
  return "bg-fs-elevated text-fs-secondary";
}
