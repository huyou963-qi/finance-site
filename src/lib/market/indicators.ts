import type { Instrument, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inferInstrumentCountryCode } from "@/lib/data/instrumentCountry";
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
const CPI_BASIS: Record<string, { scope: "headline" | "core"; seasonalAdjustment: "adjusted" | "unadjusted" }> = {
  CPIAUCSL: { scope: "headline", seasonalAdjustment: "adjusted" },
  CPIAUCNS: { scope: "headline", seasonalAdjustment: "unadjusted" },
  CPILFESL: { scope: "core", seasonalAdjustment: "adjusted" },
  CPILFENS: { scope: "core", seasonalAdjustment: "unadjusted" },
};
const COUNTRY_PREFIXES: [string, RegExp][] = [
  ["US", /^(?:美国|(?:united states|usa|us)(?=\s|\p{Script=Han}|$))/u],
  ["CN", /^(?:中国|(?:china|cn)(?=\s|\p{Script=Han}|$))/u],
  ["JP", /^(?:日本|(?:japan|jp)(?=\s|\p{Script=Han}|$))/u],
  ["DE", /^(?:德国|(?:germany|de)(?=\s|\p{Script=Han}|$))/u],
  ["EA", /^(?:欧元区|(?:euro area|eurozone|ea)(?=\s|\p{Script=Han}|$))/u],
];
const SEARCH_QUALIFIERS: Record<string, string[]> = {
  现货: ["现货", "spot"],
  期货: ["期货", "futures"],
  持仓: ["持仓", "position", "positions", "positioning", "cot"],
  核心: ["核心", "core", "less food and energy"],
  总项: ["总项", "headline", "all items", "全部城市消费者"],
  未季调: ["未季调", "unadjusted", "not seasonally adjusted", "nsa"],
  季调: ["季调", "seasonally adjusted"],
};
const QUALIFIER_PATTERN = new RegExp(
  `(?<![a-z0-9])(?:${Object.values(SEARCH_QUALIFIERS).flat().filter(term => /^[a-z]/.test(term)).sort((a, b) => b.length - a.length).join("|")})(?![a-z0-9])|未季调|季调|现货|期货|持仓|核心|总项`,
  "gu",
);
const QUALIFIER_BY_ALIAS = new Map(Object.entries(SEARCH_QUALIFIERS).flatMap(([key, aliases]) => aliases.map(alias => [alias, key])));
const CPI_LABELS = ["消费者物价指数", "消费者价格指数", "consumer price index"];
const CPI_LABEL_PATTERN = new RegExp(CPI_LABELS.join("|"), "g");
function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}
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
  const cpiBasis = CPI_BASIS[row.fredSeriesId ?? ""];
  const basis = cpiBasis ? { type: "price_index" as const, ...cpiBasis }
    : row.code.startsWith("cot_") ? { type: "positioning" as const } : null;
  return {
    indicatorId: row.id, catalogKey: row.fredSeriesId ? `fred:${row.fredSeriesId}` : `mds:${row.code}`, code: row.code,
    name: String(m.displayName ?? row.shortName ?? row.name), nameEn: row.nameEn, description: row.description,
    symbol: row.tickerSymbol ?? row.fredSeriesId, provider: known?.provider ?? (typeof m.source === "string" ? m.source : source.name ?? null),
    sourceUrl: safeSourceUrl(m.officialUrl) ?? safeSourceUrl(m.sourceUrl) ?? safeSourceUrl(source.url) ?? (row.fredSeriesId ? `https://fred.stlouisfed.org/series/${encodeURIComponent(row.fredSeriesId)}` : null),
    originalIndicatorId: row.fredSeriesId ?? scrape.seriesId ?? source.seriesKey ?? row.code,
    frequency: nativeFrequency(row.freqLabel), nativeFrequencyLabel: row.freqLabel,
    unit: known?.unit ?? row.unit, nativeUnit: row.unit, currency: known?.currency ?? m.currency ?? null,
    market: inferInstrumentCountryCode(row), location: known?.location ?? m.location ?? m.countryNameZh ?? null,
    instrumentType, basis, aliases: known?.aliases ?? WPSR_ALIASES[row.code] ?? [],
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
  const query = normalizeSearch(p.query).replace(/^u\.s\.(?=\s|\p{Script=Han}|$)/u, "us");
  const country = COUNTRY_PREFIXES.find(([, prefix]) => prefix.test(query));
  const subject = normalizeSearch(country ? query.replace(country[1], "") : query);
  const tokens = [...new Set(subject
    .replace(CPI_LABEL_PATTERN, " cpi ")
    .replace(QUALIFIER_PATTERN, alias => ` ${QUALIFIER_BY_ALIAS.get(alias)} `)
    .split(/[\s,]+/).filter(Boolean))];
  const qualifiers = tokens.filter(token => Object.hasOwn(SEARCH_QUALIFIERS, token));
  const keywords = tokens.filter(token => !qualifiers.includes(token));
  const matchesAlias = (aliases: string[]) => aliases.some(alias => {
    const normalized = normalizeSearch(alias);
    return normalized === subject || tokens.some(token => normalized.includes(token));
  });
  const ids = Object.entries(ENERGY_IDENTITIES).filter(([, x]) => matchesAlias(x.aliases)).map(([id]) => id);
  const codes = Object.entries(WPSR_ALIASES).filter(([, aliases]) => matchesAlias(aliases)).map(([code]) => code);
  if (tokens.includes("cpi")) ids.push(...Object.keys(CPI_BASIS));
  const lookupTerms = keywords.length ? keywords.flatMap(term => term === "cpi" ? [term, ...CPI_LABELS] : [term])
    : qualifiers.flatMap(term => SEARCH_QUALIFIERS[term]!);
  const alternatives: Prisma.InstrumentWhereInput[] = [...new Set([subject, ...lookupTerms])]
    .filter(Boolean)
    .map(term => term.replace(/[%_\\]/g, "\\$&"))
    .flatMap(term => [
      ...["name", "nameEn", "shortName", "description", "code", "fredSeriesId", "tickerSymbol"]
        .map(key => ({ [key]: { contains: term, mode: "insensitive" as const } })),
      { metadata: { path: ["displayName"], string_contains: term } },
    ]);
  alternatives.push({ fredSeriesId: { in: ids } }, { code: { in: codes } });
  if (/^(fred|mds):.+$/.test(subject)) {
    alternatives.push(subject.startsWith("fred:")
      ? { fredSeriesId: { equals: subject.slice(5), mode: "insensitive" } }
      : { code: { equals: subject.slice(4), mode: "insensitive" } });
  }
  const rows = await prisma.instrument.findMany({
    where: {
      kind: "MACRO_SERIES",
      OR: alternatives,
    },
    orderBy: { code: "asc" },
  });
  const ranked = rows.flatMap(row => {
    const indicator = describeIndicator(row);
    if (country && indicator.market !== country[0]) return [];
    const identifiers = [row.code, row.fredSeriesId, row.tickerSymbol, indicator.catalogKey].filter((value): value is string => !!value).map(normalizeSearch);
    const names = [row.name, row.nameEn, row.shortName, indicator.name, ...indicator.aliases]
      .filter((value): value is string => !!value).map(normalizeSearch);
    const searchable = [...identifiers, ...names, normalizeSearch(row.description ?? "")].map(value => value.replace(CPI_LABEL_PATTERN, " cpi "));
    if (p.category && (p.category === "energy"
      ? !/oil|eia|brent|wti|柴油|原油|馏分油|能源/i.test(`${searchable.join(" ")} ${indicator.provider ?? ""}`)
      : !JSON.stringify(objectMetadata(row.metadata).catalogCategory ?? "").includes(p.category))) return [];
    const exactId = identifiers.includes(subject);
    const exactName = names.includes(subject);
    const cpiBasis = indicator.basis?.type === "price_index" ? indicator.basis : null;
    const qualifies = qualifiers.every(term => {
      if (term === "现货") return indicator.instrumentType === "spot" || names.some(name => /现货|\bspot\b/.test(name));
      if (term === "期货") return indicator.instrumentType === "futures";
      if (term === "持仓" && indicator.basis?.type === "positioning") return true;
      if (cpiBasis && term === "核心") return cpiBasis.scope === "core";
      if (cpiBasis && term === "总项") return cpiBasis.scope === "headline";
      if (cpiBasis && (term === "季调" || term === "未季调")) return cpiBasis.seasonalAdjustment === (term === "季调" ? "adjusted" : "unadjusted");
      return names.some(name => Array.from(name.matchAll(QUALIFIER_PATTERN)).some(([alias]) => QUALIFIER_BY_ALIAS.get(alias) === term));
    });
    const matched = keywords.filter(term => searchable.some(value => value.includes(term))).length;
    if (!exactId && (!qualifies || (!exactName && (keywords.length ? matched === 0 : !qualifiers.length)))) return [];
    const complete = exactId || exactName || matched === keywords.length;
    if (!complete && (country || qualifiers.length)) return [];
    const preferredCpi = country?.[0] === "US" && keywords.length === 1 && keywords[0] === "cpi"
      && cpiBasis?.scope === (qualifiers.includes("核心") ? "core" : "headline")
      && cpiBasis.seasonalAdjustment === (qualifiers.includes("未季调") ? "unadjusted" : "adjusted");
    const score = exactId ? 4 : preferredCpi ? 3 : exactName ? 2 : complete ? 1 : 0;
    return [{ indicator, score, matched }];
  }).sort((a, b) => b.score - a.score || b.matched - a.matched);
  return {
    indicators: await Promise.all(ranked.slice(0, p.limit).map(async ({ indicator }) => ({ ...indicator, ...await indicatorCoverage(indicator.indicatorId) }))),
    truncated: ranked.length > p.limit,
    note: "只返回数据库已登记的宏观序列；不将现货替换为期货。未知字段为 null。",
  };
}
