/** Numeric research is opt-in: never infer consensus or surprise from prose/returns. */
export type MacroReleaseEvidence = {
  metricId?: string;
  label?: string;
  actual: number;
  consensus: number;
  unit: string;
  referencePeriod: string;
  releaseAt: string;
  consensusAsOf?: string;
  consensusEvidenceType?: "contemporaneous-report";
  consensusReportedAt?: string;
  consensusSource: string;
  consensusSourceUrl: string;
  actualSourceUrl: string;
  isInitialRelease: true;
  historicalErrors?: { releaseAt: string; actual: number; consensus: number }[];
};

export type MacroSurpriseResult = {
  status: "missing" | "invalid" | "raw" | "scored";
  reason: string;
  evidence?: MacroReleaseEvidence;
  difference?: number;
  score?: number;
  sampleSize?: number;
  direction?: "above" | "below" | "inline";
  large: boolean;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function instant(value: unknown): number {
  // Require timezone and time: date-only timestamps cannot prove pre-release consensus.
  return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value) : NaN;
}
function url(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}

export function evaluateMacroSurprise(payload: unknown): MacroSurpriseResult {
  const root = object(payload);
  if (!root || root.macroRelease === undefined) {
    return { status: "missing", reason: "预期差未录入", large: false };
  }
  const r = object(root.macroRelease);
  const invalid = (reason: string): MacroSurpriseResult => ({ status: "invalid", reason, large: false });
  if (!r || !finite(r.actual) || !finite(r.consensus)) return invalid("实际值或一致预期无效");
  const release = instant(r.releaseAt), asOf = instant(r.consensusAsOf);
  const retrospective = r.consensusEvidenceType === "contemporaneous-report" && r.consensusAsOf === undefined;
  if (!Number.isFinite(release) || (!retrospective && (!Number.isFinite(asOf) || asOf >= release))) {
    return invalid("缺少可核对的发布前预期时刻");
  }
  if (r.isInitialRelease !== true) return invalid("尚未确认首发口径");
  if (![r.unit, r.referencePeriod, r.consensusSource].every(v => typeof v === "string" && v.trim())) {
    return invalid("缺少单位、参考期或预期来源");
  }
  if (!url(r.actualSourceUrl) || !url(r.consensusSourceUrl)) return invalid("缺少实际值或预期来源链接");
  const evidence = r as unknown as MacroReleaseEvidence;
  const difference = evidence.actual - evidence.consensus;
  if (!Number.isFinite(difference)) return invalid("差值超出计算范围");
  const base: MacroSurpriseResult = { status: "raw", evidence, difference, large: false, reason: "历史误差样本不足，暂不分级" };
  if (retrospective) return { ...base, reason: "历史报道记载的调查预期；未证明发布前精确快照，仅展示原始差值" };
  // Only earlier releases, with unique timestamps, may set the scale. Use the latest 60.
  const samples = new Map<number, number>();
  for (const item of Array.isArray(r.historicalErrors) ? r.historicalErrors : []) {
    const h = object(item);
    if (!h) continue;
    const t = instant(h.releaseAt);
    if (!Number.isFinite(t) || t >= release || !finite(h.actual) || !finite(h.consensus)) continue;
    const error = h.actual - h.consensus;
    if (Number.isFinite(error) && !samples.has(t)) samples.set(t, error);
  }
  const errors = [...samples].sort((a, b) => b[0] - a[0]).slice(0, 60).map(([, e]) => e);
  base.sampleSize = errors.length;
  if (errors.length < 12) return base;
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  const scale = Math.sqrt(errors.reduce((a, b) => a + (b - mean) ** 2, 0) / (errors.length - 1));
  if (!Number.isFinite(scale) || scale <= 1e-12) return { ...base, reason: "历史误差尺度无效，暂不分级" };
  const score = difference / scale;
  if (!Number.isFinite(score)) return { ...base, reason: "标准化计算超出范围，暂不分级" };
  return { ...base, status: "scored", score, large: Math.abs(score) >= 1.5,
    direction: Math.abs(score) < 0.5 ? "inline" : score > 0 ? "above" : "below",
    reason: "试行口径：|S| < 0.5 接近预期；|S| ≥ 1.5 明显偏差" };
}

export function isMacroResearchEvent(event: { eventType: string | null; countries: string[] }): boolean {
  const t = event.eventType ?? "";
  return event.countries.includes("US") &&
    (t.startsWith("macro.") || t.startsWith("policy.") || t === "speech.official" || t === "market.anomaly");
}

/** Related event instruments only; never use this expansion to merge price series. */
export function expandEventAssetTags(assets: readonly string[]): string[] {
  const set = new Set(assets.map(a => a.trim().toUpperCase()).filter(Boolean));
  const gold = ["XAUUSD", "XAUUSD=X", "GC=F", "GLD", "IAU"];
  if (gold.some(a => set.has(a))) gold.forEach(a => set.add(a));
  return [...set];
}

export function isMacroResearchAsset(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return expandEventAssetTags(["XAUUSD"]).includes(s) ||
    ["DX-Y.NYB", "DX=F", "UUP", "^TNX", "^IRX", "^TYX", "TLT", "IEF", "SHY", "GOVT", "SPY", "QQQ", "DIA", "IWM", "^GSPC", "^IXIC", "^DJI"].includes(s);
}
