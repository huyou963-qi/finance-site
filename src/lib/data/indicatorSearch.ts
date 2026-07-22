import { InstrumentKind, type PrismaClient } from "@prisma/client";
import { getFredCatalogCached, worldBankIndicatorLabel } from "@/lib/data/fredCatalog";
import { getFredRateLimiter } from "@/lib/data/scheduler/fredRateLimiter";
import {
  fredCatalogKey,
  readOnboardingStatus,
  wbCatalogKey,
} from "@/lib/data/indicatorOnboarding";
import { allItemsInGroup } from "@/lib/data/catalogTree";

export type IndicatorSearchHit = {
  origin: "local" | "fred" | "worldbank";
  source: string;
  sourceSeriesKey: string;
  /** 本地已知时的统一目录键 */
  key: string | null;
  title: string;
  frequency: string | null;
  units: string | null;
  alreadyLocal: boolean;
  onboardingStatus: "pending_completion" | "complete" | null;
  countryCode?: string | null;
};

export type IndicatorSearchResult = {
  q: string;
  local: IndicatorSearchHit[];
  external: IndicatorSearchHit[];
  externalEnabled: boolean;
  externalNote: string | null;
};

type CacheEntry = { at: number; result: IndicatorSearchResult };
const searchCache = new Map<string, CacheEntry>();
const SEARCH_CACHE_TTL_MS = 60_000;

function cacheKey(q: string, limit: number, includeExternal: boolean): string {
  return `${includeExternal ? "1" : "0"}:${limit}:${q.toLowerCase()}`;
}

function matchText(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

async function searchLocalCatalog(
  q: string,
  limit: number,
): Promise<IndicatorSearchHit[]> {
  const { countries } = await getFredCatalogCached();
  const hits: IndicatorSearchHit[] = [];
  const seen = new Set<string>();

  for (const country of countries) {
    for (const category of country.categories) {
      for (const item of allItemsInGroup(category)) {
        const blob = `${item.label} ${item.key} ${country.name} ${country.code} ${category.name}`;
        if (!matchText(blob, q)) continue;
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        const source = item.key.startsWith("fred:")
          ? "fred"
          : item.key.startsWith("wb:")
            ? "worldbank"
            : "mds";
        const sourceSeriesKey = item.key.startsWith("fred:")
          ? item.key.slice(5).split("::")[0] ?? item.key
          : item.key.startsWith("wb:")
            ? item.key.slice(3)
            : item.key.replace(/^mds:/, "");
        hits.push({
          origin: "local",
          source,
          sourceSeriesKey,
          key: item.key,
          title: item.label,
          frequency: item.frequency,
          units: null,
          alreadyLocal: true,
          onboardingStatus: null,
          countryCode: country.code,
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

async function searchLocalDbPending(
  prisma: PrismaClient,
  q: string,
  limit: number,
  excludeKeys: Set<string>,
): Promise<IndicatorSearchHit[]> {
  const rows = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { fredSeriesId: { contains: q, mode: "insensitive" } },
      ],
    },
    take: Math.min(limit * 3, 80),
    select: {
      code: true,
      name: true,
      freqLabel: true,
      unit: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: { select: { sourceId: true, sourceSeriesKey: true } },
    },
  });

  const hits: IndicatorSearchHit[] = [];
  for (const row of rows) {
    const md =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const status = readOnboardingStatus(row.metadata);
    // 站内补充：待完善草稿 + 任意带订阅的本地序列（已在目录中的由 catalog 覆盖）
    const catalogKey =
      typeof md.catalogKey === "string" && md.catalogKey.trim()
        ? md.catalogKey.trim()
        : row.fredSeriesId
          ? fredCatalogKey(row.fredSeriesId)
          : `mds:${row.code}`;

    if (excludeKeys.has(catalogKey)) continue;

    const displayName =
      typeof md.displayName === "string" && md.displayName.trim()
        ? md.displayName.trim()
        : row.name;
    const blob = `${displayName} ${row.code} ${row.fredSeriesId ?? ""} ${catalogKey}`;
    if (!matchText(blob, q) && status !== "pending_completion") continue;

    // 非 pending 且已在正式树外：仍允许搜到「仅数据库」类指标
    hits.push({
      origin: "local",
      source: row.dataSubscription?.sourceId ?? (row.fredSeriesId ? "fred" : "mds"),
      sourceSeriesKey:
        row.dataSubscription?.sourceSeriesKey ?? row.fredSeriesId ?? row.code,
      key: catalogKey,
      title: displayName,
      frequency: row.freqLabel,
      units: row.unit,
      alreadyLocal: true,
      onboardingStatus: status,
      countryCode: typeof md.countryCode === "string" ? md.countryCode : null,
    });
    excludeKeys.add(catalogKey);
    if (hits.length >= limit) break;
  }
  return hits;
}

type FredSeriesHit = {
  id: string;
  title: string;
  frequency: string | null;
  units: string | null;
};

async function searchFredExternal(
  q: string,
  limit: number,
  apiKey: string,
): Promise<FredSeriesHit[]> {
  const url =
    `https://api.stlouisfed.org/fred/series/search` +
    `?search_text=${encodeURIComponent(q.slice(0, 80))}` +
    `&search_type=full_text` +
    `&limit=${Math.min(Math.max(limit, 1), 25)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json`;
  const res = await getFredRateLimiter().fetch(url);
  if (!res.ok) {
    throw new Error(`FRED search HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    seriess?: {
      id?: string;
      title?: string;
      frequency?: string;
      units?: string;
    }[];
  };
  const out: FredSeriesHit[] = [];
  for (const s of json.seriess ?? []) {
    const id = s.id?.trim();
    if (!id) continue;
    out.push({
      id,
      title: (s.title ?? id).trim(),
      frequency: s.frequency?.trim() || null,
      units: s.units?.trim() || null,
    });
  }
  return out;
}

async function loadLocalFredIds(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES, fredSeriesId: { not: null } },
    select: { fredSeriesId: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    const id = r.fredSeriesId?.trim().toUpperCase();
    if (id) set.add(id);
  }
  return set;
}

async function searchWorldBankExternal(q: string, limit: number): Promise<IndicatorSearchHit[]> {
  // 世行无稳定关键词搜索 API：用公开 indicator 列表 + 本地静态标签模糊匹配
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  const url =
    `https://api.worldbank.org/v2/indicator` +
    `?format=json&per_page=${Math.min(limit * 40, 200)}`;
  let remote: { id: string; name: string }[] = [];
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.ok) {
      const json = (await res.json()) as unknown[];
      const rows = (json[1] ?? []) as { id?: string; name?: string }[];
      remote = rows
        .filter((r) => r.id && r.name)
        .map((r) => ({ id: r.id!, name: r.name! }));
    }
  } catch {
    remote = [];
  }

  const scored: { id: string; name: string; score: number }[] = [];
  for (const row of remote) {
    const idL = row.id.toLowerCase();
    const nameL = row.name.toLowerCase();
    const label = worldBankIndicatorLabel(row.id).toLowerCase();
    if (!idL.includes(needle) && !nameL.includes(needle) && !label.includes(needle)) {
      continue;
    }
    let score = 0;
    if (idL === needle) score += 100;
    if (idL.includes(needle)) score += 40;
    if (nameL.includes(needle)) score += 20;
    if (label.includes(needle)) score += 30;
    scored.push({ id: row.id, name: worldBankIndicatorLabel(row.id) || row.name, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // 精确粘贴 indicator id（如 FP.CPI.TOTL.ZG）即使远程列表未命中也返回
  if (/^[A-Z0-9._]+$/i.test(q.trim()) && q.includes(".")) {
    const id = q.trim();
    if (!scored.some((s) => s.id === id)) {
      scored.unshift({
        id,
        name: worldBankIndicatorLabel(id) || id,
        score: 90,
      });
    }
  }

  return scored.slice(0, limit).map((s) => ({
    origin: "worldbank" as const,
    source: "worldbank",
    sourceSeriesKey: `US:${s.id}`,
    key: wbCatalogKey("US", s.id),
    title: s.name,
    frequency: "年",
    units: null,
    alreadyLocal: false,
    onboardingStatus: null,
    countryCode: "US",
  }));
}

async function loadLocalWbKeys(prisma: PrismaClient): Promise<Set<string>> {
  const rows = await prisma.dataSubscription.findMany({
    where: { sourceId: "worldbank" },
    select: { sourceSeriesKey: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    const key = r.sourceSeriesKey.trim().toUpperCase();
    if (key) set.add(key);
  }
  return set;
}

export async function searchIndicators(
  prisma: PrismaClient,
  options: {
    q: string;
    limit?: number;
    includeExternal?: boolean;
  },
): Promise<IndicatorSearchResult> {
  const q = options.q.trim();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 40);
  const includeExternal = options.includeExternal !== false;

  if (!q) {
    return {
      q: "",
      local: [],
      external: [],
      externalEnabled: includeExternal,
      externalNote: null,
    };
  }

  const ck = cacheKey(q, limit, includeExternal);
  const cached = searchCache.get(ck);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.result;
  }

  const localFromCatalog = await searchLocalCatalog(q, limit);
  const excludeKeys = new Set(localFromCatalog.map((h) => h.key!).filter(Boolean));
  const localFromDb = await searchLocalDbPending(
    prisma,
    q,
    Math.max(0, limit - localFromCatalog.length),
    excludeKeys,
  );
  const local = [...localFromCatalog, ...localFromDb].slice(0, limit);

  let external: IndicatorSearchHit[] = [];
  let externalNote: string | null = null;
  let externalEnabled = includeExternal;

  if (includeExternal) {
    const apiKey = process.env.FRED_API_KEY?.trim();
    const localFredIds = await loadLocalFredIds(prisma);
    const localWb = await loadLocalWbKeys(prisma);

    const tasks: Promise<void>[] = [];

    if (apiKey) {
      tasks.push(
        (async () => {
          try {
            const fredHits = await searchFredExternal(q, limit, apiKey);
            for (const h of fredHits) {
              const idUp = h.id.toUpperCase();
              if (localFredIds.has(idUp)) continue;
              const key = fredCatalogKey(h.id);
              if (excludeKeys.has(key)) continue;
              external.push({
                origin: "fred",
                source: "fred",
                sourceSeriesKey: h.id,
                key,
                title: h.title,
                frequency: h.frequency,
                units: h.units,
                alreadyLocal: false,
                onboardingStatus: null,
                countryCode: "US",
              });
            }
          } catch (e) {
            externalNote =
              e instanceof Error ? `FRED 搜索失败：${e.message}` : "FRED 搜索失败";
          }
        })(),
      );
    } else {
      externalNote = "未配置 FRED_API_KEY，外部 FRED 搜索不可用";
    }

    tasks.push(
      (async () => {
        try {
          const wbHits = await searchWorldBankExternal(q, Math.min(10, limit));
          for (const h of wbHits) {
            const seriesKey = h.sourceSeriesKey.toUpperCase();
            if (localWb.has(seriesKey)) continue;
            if (h.key && excludeKeys.has(h.key)) continue;
            // 已在站内结果中的 wb key 也跳过
            if (h.key && local.some((l) => l.key === h.key)) continue;
            external.push({ ...h, alreadyLocal: false });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "World Bank 搜索失败";
          externalNote = externalNote ? `${externalNote}；${msg}` : msg;
        }
      })(),
    );

    await Promise.all(tasks);

    // FRED 优先，再 WB
    external.sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === "fred" ? -1 : 1;
      return a.title.localeCompare(b.title, "zh-CN");
    });
    external = external.slice(0, limit);
  } else {
    externalEnabled = false;
    externalNote = "登录后可搜索 FRED / 世界银行外部指标";
  }

  const result: IndicatorSearchResult = {
    q,
    local,
    external,
    externalEnabled,
    externalNote,
  };
  searchCache.set(ck, { at: Date.now(), result });
  return result;
}

export function clearIndicatorSearchCache(): void {
  searchCache.clear();
}
