import type { Instrument } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MarketError, searchIndicatorsSchema } from "./schema";

// Verified identities supplement (never replace) the database's own metadata.
export const ENERGY_IDENTITIES: Record<string, { aliases: string[]; instrumentType: string; location: string; unit: string; currency: string; provider: string }> = {
  DCOILWTICO: { aliases: ["WTI", "WTI Cushing", "库欣原油", "WTI现货", "原油", "oil", "energy"], instrumentType: "spot", location: "Cushing, Oklahoma", unit: "USD/bbl", currency: "USD", provider: "U.S. Energy Information Administration (via FRED)" },
  DCOILBRENTEU: { aliases: ["Brent", "Dated Brent", "布伦特", "布伦特现货", "原油", "oil", "energy"], instrumentType: "spot", location: "Europe / Brent", unit: "USD/bbl", currency: "USD", provider: "U.S. Energy Information Administration (via FRED)" },
  DDFUELNYH: { aliases: ["ULSD", "柴油", "超低硫柴油", "纽约港", "energy"], instrumentType: "spot", location: "New York Harbor", unit: "USD/gal", currency: "USD", provider: "U.S. Energy Information Administration (via FRED)" },
};
const WPSR_ALIASES: Record<string, string[]> = {
  eia_wpsr_wdistus1: ["馏分油", "馏分油库存", "Distillate stocks", "energy"],
  eia_wpsr_wd0st_nus_1: ["ULSD", "柴油", "超低硫柴油", "超低硫库存", "energy"],
  eia_wpsr_wdiupus2: ["Distillate Product Supplied", "馏分油表观需求", "柴油需求", "energy"],
  eia_wpsr_wpuleus3: ["炼厂利用率", "refinery utilization", "energy"],
  eia_wpsr_wcsstus1: ["SPR", "战略石油储备", "石油库存", "energy"],
};
export function objectMetadata(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function nativeFrequency(value: string | null): string {
  const s = (value ?? "").toLowerCase();
  if (/daily|^d$|日/.test(s)) return "daily";
  if (/weekly|^w$|周/.test(s)) return "weekly";
  if (/monthly|^m$|月/.test(s)) return "monthly";
  if (/quarter|^q$|季/.test(s)) return "quarterly";
  if (/annual|year|^a$|年/.test(s)) return "annual";
  return "unknown";
}
export function describeIndicator(row: Instrument) {
  const m = objectMetadata(row.metadata), known = ENERGY_IDENTITIES[row.fredSeriesId ?? ""];
  const source = objectMetadata(m.source), scrape = objectMetadata(m.scrape);
  const text = `${row.name} ${row.description ?? ""}`;
  const instrumentType = known?.instrumentType ?? (row.code === "nymex_wti_futures" || /期货|futures/i.test(text) ? "futures" : /库存|stocks/i.test(text) ? "inventory" : /指数|index/i.test(text) ? "index" : "unknown");
  return {
    indicatorId: row.id, catalogKey: row.fredSeriesId ? `fred:${row.fredSeriesId}` : `mds:${row.code}`, code: row.code,
    name: String(m.displayName ?? row.shortName ?? row.name), nameEn: row.nameEn, description: row.description,
    symbol: row.tickerSymbol ?? row.fredSeriesId, provider: known?.provider ?? (typeof m.source === "string" ? m.source : source.name ?? null),
    sourceUrl: safeSourceUrl(m.officialUrl) ?? safeSourceUrl(m.sourceUrl) ?? safeSourceUrl(source.url) ?? (row.fredSeriesId ? `https://fred.stlouisfed.org/series/${encodeURIComponent(row.fredSeriesId)}` : null),
    originalIndicatorId: row.fredSeriesId ?? scrape.seriesId ?? source.seriesKey ?? row.code,
    frequency: nativeFrequency(row.freqLabel), nativeFrequencyLabel: row.freqLabel,
    unit: known?.unit ?? row.unit, nativeUnit: row.unit, currency: known?.currency ?? m.currency ?? null,
    market: m.countryCode ?? null, location: known?.location ?? m.location ?? m.countryNameZh ?? null,
    instrumentType, aliases: known?.aliases ?? WPSR_ALIASES[row.code] ?? [],
    contractMonth: null,
    continuousContractRule: instrumentType === "futures" ? (row.code === "nymex_wti_futures" ? "Yahoo CL=F 连续合约；供应商未公开可核实的逐日换月表，不视为固定月份合约" : "未知，不自动推断换月或复权规则") : null,
    metadataUpdatedAt: row.updatedAt.toISOString(), lastUpdatedAt: typeof m.dataLastSyncedAtIso === "string" ? m.dataLastSyncedAtIso : null,
  };
}
export async function resolveIndicator(id: string) {
  const row = await prisma.instrument.findFirst({ where: { kind: "MACRO_SERIES", OR: [...(/^[0-9a-f-]{36}$/i.test(id) ? [{ id }] : []), { code: id.startsWith("mds:") ? id.slice(4) : id }, ...(id.startsWith("fred:") ? [{ fredSeriesId: id.slice(5) }] : [])] } });
  if (!row) throw new MarketError("NOT_FOUND", `未找到宏观指标 ${id}；请先搜索，不能自动替换指标`);
  return row;
}
export async function indicatorCoverage(id: string) {
  const r = await prisma.macroObservation.aggregate({ where: { instrumentId: id }, _min: { obsDate: true }, _max: { obsDate: true }, _count: true });
  return { availableFrom: r._min.obsDate?.toISOString().slice(0, 10) ?? null, availableTo: r._max.obsDate?.toISOString().slice(0, 10) ?? null, observations: r._count };
}
export async function searchMarketIndicators(raw: unknown) {
  const p = searchIndicatorsSchema.parse(raw);
  const tokens = p.query.toLowerCase().split(/[\s,，]+/).filter(Boolean);
  const ids = Object.entries(ENERGY_IDENTITIES).filter(([, x]) => tokens.some(t => x.aliases.some(a => a.toLowerCase().includes(t) || t.includes(a.toLowerCase())))).map(([id]) => id);
  const codes = Object.entries(WPSR_ALIASES).filter(([, aliases]) => tokens.some(t => aliases.some(a => a.toLowerCase().includes(t) || t.includes(a.toLowerCase())))).map(([code]) => code);
  const alternatives = tokens.flatMap(t => ["name", "nameEn", "shortName", "description", "code", "fredSeriesId"].map(key => ({ [key]: { contains: t, mode: "insensitive" as const } })));
  const rows = await prisma.instrument.findMany({ where: { kind: "MACRO_SERIES", OR: [{ fredSeriesId: { in: ids } }, { code: { in: codes } }, ...alternatives, ...tokens.map(t => ({ metadata: { path: ["displayName"], string_contains: t } }))] }, take: 200, orderBy: { code: "asc" } });
  const ranked = rows.map(row => ({ row, score: tokens.reduce((s, t) => s + (JSON.stringify(describeIndicator(row)).toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  const filtered = ranked.filter(({ row }) => !p.category || (p.category === "energy" ? /oil|eia|brent|wti|柴油|原油|馏分油|能源/i.test(JSON.stringify(describeIndicator(row))) : JSON.stringify(objectMetadata(row.metadata).catalogCategory ?? "").includes(p.category)));
  return { indicators: await Promise.all(filtered.slice(0, p.limit).map(async ({ row }) => ({ ...describeIndicator(row), ...await indicatorCoverage(row.id) }))), truncated: rows.length === 200 || filtered.length > p.limit, note: "只返回数据库已登记的宏观序列；不将现货替换为期货。未知字段为 null。" };
}
