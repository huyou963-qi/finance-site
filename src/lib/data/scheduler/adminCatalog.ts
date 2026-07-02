import { InstrumentKind, Prisma, type PrismaClient } from "@prisma/client";
import {
  getFredCatalogCached,
  macroCountryName,
  type UnifiedCatalogCountry,
  type UnifiedCatalogItem,
} from "@/lib/data/fredCatalog";
import { readFetchAcquisition } from "./fetchAcquisition";
import {
  acquisitionStatusLabel,
  isExcelBootstrap,
  isNetworkAcquisitionConfirmed,
  needsNetworkSource,
  resolveAcquisitionStatus,
  resolveUpdateStatus,
  updateStatusLabel,
  updateStatusReason,
  type AcquisitionStatus,
  type UpdateStatus,
} from "./catalogAcquisition";
import { parseReleaseRule, summarizeReleaseRule } from "./releaseRule";
import {
  effectiveReleaseRule,
  loadPackageMapByInstrumentId,
  type PackageByInstrument,
} from "./releasePackageStore";
import { sortByCatalogCountryCode } from "@/lib/data/catalogCountryOrder";

export type AdminCatalogIndicator = {
  key: string;
  label: string;
  frequency: string;
  countryCode: string;
  categoryName: string;
  instrumentCode: string | null;
  instrumentId: string | null;
  /** 官方/发布页（优先） */
  sourcePageUrl: string | null;
  /** API 或数据源根地址 */
  apiSourceUrl: string | null;
  sourceName: string | null;
  agencyName: string | null;
  agencyWebsiteUrl: string | null;
  /** 数据库 metadata.source / providerNote（Excel 第 6 行等） */
  dbSource: string | null;
  latestValue: number | null;
  latestObsDate: string | null;
  unit: string | null;
  nextRunAt: string | null;
  releaseRuleSummary: string | null;
  /** 经济日历下一发布（UTC ISO） */
  calendarReleaseAt: string | null;
  calendarEventTitle: string | null;
  calendarSyncStatus: string | null;
  subscriptionEnabled: boolean | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  inDatabase: boolean;
  hasScheduledUpdates: boolean;
  fetchAcquisitionStatus: "known" | "pending" | null;
  fetchAcquisitionMethod: string | null;
  fetchAcquisitionMessage: string | null;
  fetchAcquisitionProbedAt: string | null;
  fetchAcquisitionFetchUrl: string | null;
  lastFetchStatus: string | null;
  lastFetchAt: string | null;
  lastFetchUpserted: number | null;
  acquisitionStatus: AcquisitionStatus | null;
  acquisitionStatusLabel: string | null;
  updateStatus: UpdateStatus | null;
  updateStatusLabel: string | null;
  /** 兼容：仅 updateStatus === stale */
  isStale: boolean;
  staleReason: string | null;
  calendarProvider: string | null;
  /** 曾用 Excel 一次性导入历史 */
  excelBootstrap: boolean;
  /** 网络获取已确认；为 false 时不展示/不参与调度列 */
  networkAcquisitionConfirmed: boolean;
  /** @deprecated 使用 !networkAcquisitionConfirmed */
  needsNetworkSource: boolean;
  /** 发布包 ID（Phase B） */
  releasePackageId: string | null;
  releasePackageLabelZh: string | null;
};

export type AdminCatalogCategory = {
  name: string;
  indicators: AdminCatalogIndicator[];
  subgroups?: Array<{ name: string; indicators: AdminCatalogIndicator[] }>;
};

export type AdminCatalogCountry = {
  code: string;
  name: string;
  categories: AdminCatalogCategory[];
};

export type AdminDataCatalogPayload = {
  builtAt: string;
  countries: AdminCatalogCountry[];
  stats: {
    totalIndicators: number;
    inDatabase: number;
    withSubscription: number;
    withLatestValue: number;
    fetchKnown: number;
    fetchPending: number;
    staleCount: number;
    readyCount: number;
    sourceCurrentCount: number;
    /** 在 mds 中但不在 FMP 统一目录树中的指标数 */
    dbOnlyCount: number;
  };
};

/** 管理端：仅存在于数据库、未出现在 FMP 统一目录的指标归入此类 */
export const DB_ONLY_CATALOG_CATEGORY = "仅数据库（未在 FMP 统一目录）";

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function isoDateTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

export function catalogKeyToSourcePageUrl(key: string): string | null {
  if (key.startsWith("fred:")) {
    const id = key.slice(5).trim();
    if (!id) return null;
    return `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`;
  }
  if (key.startsWith("wb:")) {
    const parts = key.split(":");
    if (parts.length < 3) return null;
    const country = parts[1];
    const indicator = parts.slice(2).join(":");
    return `https://data.worldbank.org/indicator/${encodeURIComponent(indicator)}?locations=${encodeURIComponent(country)}`;
  }
  return null;
}

function defaultSourceForProvider(
  item: UnifiedCatalogItem,
): { sourceName: string; apiSourceUrl: string | null; sourcePageUrl: string | null } {
  const page = catalogKeyToSourcePageUrl(item.key);
  if (item.provider === "fred") {
    return {
      sourceName: "FRED API",
      apiSourceUrl: "https://api.stlouisfed.org/fred",
      sourcePageUrl: page,
    };
  }
  if (item.provider === "wb") {
    return {
      sourceName: "World Bank Open Data",
      apiSourceUrl: "https://api.worldbank.org/v2",
      sourcePageUrl: page,
    };
  }
  return {
    sourceName: "本地数据库 (mds)",
    apiSourceUrl: null,
    sourcePageUrl: page,
  };
}

type InstRow = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  fredSeriesId: string | null;
  metadata: unknown;
  dataSubscription: {
    enabled: boolean;
    nextRunAt: Date | null;
    lastSuccessAt: Date | null;
    lastObsDate: Date | null;
    lastError: string | null;
    releaseRule: unknown;
    sourceSeriesKey: string;
    source: {
      id: string;
      name: string;
      baseUrl: string | null;
      termsUrl: string | null;
      adapterKind: string;
      agency: { nameZh: string; websiteUrl: string | null } | null;
    };
  } | null;
};

function resolveInstrumentForKey(
  key: string,
  byCode: Map<string, InstRow>,
  byFred: Map<string, InstRow>,
): InstRow | undefined {
  if (key.startsWith("mds:")) {
    return byCode.get(key.slice(4));
  }
  if (key.startsWith("fred:")) {
    const fredId = key.slice(5).toUpperCase();
    return byFred.get(fredId) ?? byCode.get(`sched_fred_${fredId}`);
  }
  return undefined;
}

function inferCountryCodeForInstrument(inst: InstRow): string {
  const md =
    inst.metadata && typeof inst.metadata === "object"
      ? (inst.metadata as Record<string, unknown>)
      : null;
  const fromMeta = md?.countryCode ?? md?.country;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim().toUpperCase().slice(0, 2);
  }
  if (inst.code.startsWith("chov_")) return "CN";
  if (inst.code.startsWith("jpov_")) return "JP";
  if (
    inst.code.startsWith("ism_") ||
    inst.code.startsWith("sched_fred_") ||
    inst.code.startsWith("usov_") ||
    inst.code.startsWith("debtcap_")
  ) {
    return "US";
  }
  return "OT";
}

function syntheticCatalogItem(inst: InstRow, countryCode: string): UnifiedCatalogItem {
  const fred = inst.fredSeriesId?.trim();
  return {
    key: fred ? `fred:${fred}` : `mds:${inst.code}`,
    label: inst.name,
    frequency: "月",
    provider: fred ? "fred" : "mds",
    countryCode,
    categoryName: DB_ONLY_CATALOG_CATEGORY,
  };
}

function collectMatchedInstrumentIds(
  catalog: { countries: UnifiedCatalogCountry[] },
  byCode: Map<string, InstRow>,
  byFred: Map<string, InstRow>,
): Set<string> {
  const ids = new Set<string>();
  for (const country of catalog.countries) {
    for (const cat of country.categories) {
      for (const item of cat.items) {
        const inst = resolveInstrumentForKey(item.key, byCode, byFred);
        if (inst) ids.add(inst.id);
      }
      for (const sg of cat.subgroups ?? []) {
        for (const item of sg.items) {
          const inst = resolveInstrumentForKey(item.key, byCode, byFred);
          if (inst) ids.add(inst.id);
        }
      }
    }
  }
  return ids;
}

function appendDbOnlyCategories(
  countries: AdminCatalogCountry[],
  orphans: InstRow[],
  latestByInstrument: Map<string, { value: number; obsDate: Date }>,
  latestFetchByInstrument: Map<
    string,
    { status: string; startedAt: Date; rowsUpserted: number; error: string | null; sourceLagDays: number | null }
  >,
  packageByInstrument: Map<string, PackageByInstrument>,
): AdminCatalogCountry[] {
  if (orphans.length === 0) return countries;

  const byCountry = new Map<string, InstRow[]>();
  for (const inst of orphans) {
    const cc = inferCountryCodeForInstrument(inst);
    const list = byCountry.get(cc) ?? [];
    list.push(inst);
    byCountry.set(cc, list);
  }

  const countryMap = new Map(countries.map((c) => [c.code, { ...c, categories: [...c.categories] }]));

  for (const [cc, insts] of byCountry) {
    const indicators = [...insts]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((inst) =>
        enrichIndicator(
          syntheticCatalogItem(inst, cc),
          cc,
          DB_ONLY_CATALOG_CATEGORY,
          inst,
          latestByInstrument,
          latestFetchByInstrument,
          packageByInstrument,
        ),
      );

    const existing = countryMap.get(cc);
    if (existing) {
      existing.categories.push({ name: DB_ONLY_CATALOG_CATEGORY, indicators });
      countryMap.set(cc, existing);
    } else {
      countryMap.set(cc, {
        code: cc,
        name: cc === "OT" ? "其他" : macroCountryName(cc) || cc,
        categories: [{ name: DB_ONLY_CATALOG_CATEGORY, indicators }],
      });
    }
  }

  return sortByCatalogCountryCode([...countryMap.values()], (c) => c.code);
}

function countIndicatorsInCountries(countries: AdminCatalogCountry[]): {
  totalIndicators: number;
  inDatabase: number;
  withSubscription: number;
  withLatestValue: number;
  fetchKnown: number;
  fetchPending: number;
  staleCount: number;
  readyCount: number;
  sourceCurrentCount: number;
  dbOnlyCount: number;
} {
  let totalIndicators = 0;
  let inDatabase = 0;
  let withSubscription = 0;
  let withLatestValue = 0;
  let fetchKnown = 0;
  let fetchPending = 0;
  let staleCount = 0;
  let readyCount = 0;
  let sourceCurrentCount = 0;
  let dbOnlyCount = 0;

  const walk = (ind: AdminCatalogIndicator, isDbOnly: boolean) => {
    totalIndicators += 1;
    if (isDbOnly) dbOnlyCount += 1;
    if (ind.inDatabase) inDatabase += 1;
    if (ind.networkAcquisitionConfirmed) {
      fetchKnown += 1;
      if (ind.hasScheduledUpdates) withSubscription += 1;
      if (ind.isStale) staleCount += 1;
      if (ind.updateStatus === "source_current") sourceCurrentCount += 1;
      if (ind.acquisitionStatus === "ready") readyCount += 1;
    } else {
      fetchPending += 1;
    }
    if (ind.latestValue != null) withLatestValue += 1;
  };

  for (const country of countries) {
    for (const cat of country.categories) {
      const isDbOnly = cat.name === DB_ONLY_CATALOG_CATEGORY;
      for (const ind of cat.indicators) walk(ind, isDbOnly);
      for (const sg of cat.subgroups ?? []) {
        for (const ind of sg.indicators) walk(ind, isDbOnly);
      }
    }
  }

  return {
    totalIndicators,
    inDatabase,
    withSubscription,
    withLatestValue,
    fetchKnown,
    fetchPending,
    staleCount,
    readyCount,
    sourceCurrentCount,
    dbOnlyCount,
  };
}

function enrichIndicator(
  item: UnifiedCatalogItem,
  countryCode: string,
  categoryName: string,
  inst: InstRow | undefined,
  latestByInstrument: Map<string, { value: number; obsDate: Date }>,
  latestFetchByInstrument: Map<
    string,
    {
      status: string;
      startedAt: Date;
      rowsUpserted: number;
      error: string | null;
      sourceLagDays: number | null;
    }
  >,
  packageByInstrument: Map<string, PackageByInstrument>,
): AdminCatalogIndicator {
  const defaults = defaultSourceForProvider(item);
  const sub = inst?.dataSubscription ?? null;
  const latest = inst ? latestByInstrument.get(inst.id) : undefined;
  const pkgInfo = inst ? packageByInstrument.get(inst.id) : undefined;
  const rule = sub
    ? effectiveReleaseRule(
        sub.releaseRule,
        pkgInfo
          ? {
              releaseTemplate: pkgInfo.releaseTemplate,
              scheduleState: pkgInfo.scheduleState,
            }
          : null,
      )
    : null;
  const scheduleNextRunAt = pkgInfo?.nextRunAt ?? sub?.nextRunAt ?? null;

  const md =
    inst?.metadata && typeof inst.metadata === "object"
      ? (inst.metadata as Record<string, unknown>)
      : null;
  const metaSourceUrl =
    typeof md?.sourceUrl === "string"
      ? md.sourceUrl
      : typeof md?.officialUrl === "string"
        ? md.officialUrl
        : null;

  const fa = inst ? readFetchAcquisition(inst.metadata) : null;
  const dbSource =
    (md && String(md.source ?? "").trim()) ||
    (md && String(md.providerNote ?? "").trim()) ||
    null;
  const dbSourceClean = dbSource && dbSource !== "-" ? dbSource : null;

  const calendarMatch =
    rule?.type === "economic_calendar" ? rule.calendarMatch : undefined;
  const calendarSync =
    rule?.type === "economic_calendar" ? rule.calendarSync : undefined;
  const lastFetch = inst ? latestFetchByInstrument.get(inst.id) : undefined;

  const excelBootstrap = inst ? isExcelBootstrap(inst.metadata) : false;

  const acquisitionStatus: AcquisitionStatus | null = inst
    ? resolveAcquisitionStatus({
        subscriptionEnabled: sub?.enabled ?? false,
        adapterKind: (sub?.source.adapterKind as import("@prisma/client").SourceAdapterKind) ?? null,
        sourceSeriesKey: sub?.sourceSeriesKey ?? null,
        metadata: inst.metadata,
      })
    : null;

  const needsNetwork = inst
    ? needsNetworkSource({ metadata: inst.metadata, acquisitionStatus })
    : false;

  const networkConfirmed = isNetworkAcquisitionConfirmed({
    inDatabase: Boolean(inst),
    acquisitionStatus,
    fetchAcquisitionStatus: fa?.status ?? null,
  });

  const sourceSync = rule?.type === "economic_calendar" ? rule.sourceSync : undefined;

  const updateStatus =
    networkConfirmed && sub && acquisitionStatus
      ? resolveUpdateStatus({
          acquisitionStatus,
          subscriptionEnabled: sub.enabled,
          nextRunAt: scheduleNextRunAt,
          lastSuccessAt: sub.lastSuccessAt,
          lastFetchStatus: lastFetch?.status ?? null,
          lastFetchAt: lastFetch?.startedAt ?? null,
          lastFetchUpserted: lastFetch?.rowsUpserted ?? null,
          sourceLagDays: lastFetch?.sourceLagDays ?? null,
          sourceSync: sourceSync ?? null,
          calendarReleaseAt: calendarMatch?.releaseAt ?? null,
        })
      : null;

  const latestObsIso = isoDate(latest?.obsDate ?? sub?.lastObsDate);

  const calendarProvider =
    rule?.type === "economic_calendar"
      ? rule.calendarProvider ?? "tradingeconomics"
      : null;

  return {
    key: item.key,
    label: item.label,
    frequency: item.frequency,
    countryCode,
    categoryName,
    instrumentCode: inst?.code ?? null,
    instrumentId: inst?.id ?? null,
    sourcePageUrl:
      metaSourceUrl ??
      catalogKeyToSourcePageUrl(item.key) ??
      sub?.source.agency?.websiteUrl ??
      defaults.sourcePageUrl,
    apiSourceUrl: sub?.source.baseUrl ?? defaults.apiSourceUrl,
    sourceName: sub?.source.name ?? defaults.sourceName,
    agencyName: sub?.source.agency?.nameZh ?? (dbSourceClean && !defaults.sourceName ? dbSourceClean : null),
    agencyWebsiteUrl: sub?.source.agency?.websiteUrl ?? null,
    dbSource: dbSourceClean,
    latestValue: latest?.value ?? null,
    latestObsDate: isoDate(latest?.obsDate ?? sub?.lastObsDate),
    unit: inst?.unit ?? null,
    nextRunAt: networkConfirmed ? isoDateTime(scheduleNextRunAt) : null,
    releaseRuleSummary: networkConfirmed && rule ? summarizeReleaseRule(rule) : null,
    calendarReleaseAt: networkConfirmed ? (calendarMatch?.releaseAt ?? null) : null,
    calendarEventTitle: networkConfirmed ? (calendarMatch?.title ?? null) : null,
    calendarSyncStatus: networkConfirmed ? (calendarSync?.status ?? null) : null,
    subscriptionEnabled: networkConfirmed ? (sub?.enabled ?? null) : null,
    lastSuccessAt: networkConfirmed ? isoDateTime(sub?.lastSuccessAt) : null,
    lastError: networkConfirmed ? (sub?.lastError ?? null) : null,
    inDatabase: Boolean(inst),
    hasScheduledUpdates: networkConfirmed && Boolean(sub?.enabled),
    fetchAcquisitionStatus: fa?.status ?? null,
    fetchAcquisitionMethod: fa?.methodLabel ?? fa?.method ?? null,
    fetchAcquisitionMessage: fa?.message ?? fa?.error ?? null,
    fetchAcquisitionProbedAt: fa?.probedAt ?? null,
    fetchAcquisitionFetchUrl: fa?.fetchUrl ?? null,
    lastFetchStatus: networkConfirmed ? (lastFetch?.status ?? null) : null,
    lastFetchAt: networkConfirmed ? isoDateTime(lastFetch?.startedAt) : null,
    lastFetchUpserted: networkConfirmed ? (lastFetch?.rowsUpserted ?? null) : null,
    acquisitionStatus: networkConfirmed ? acquisitionStatus : null,
    acquisitionStatusLabel:
      networkConfirmed && acquisitionStatus
        ? acquisitionStatusLabel(acquisitionStatus, { excelBootstrap })
        : null,
    updateStatus,
    updateStatusLabel: networkConfirmed && updateStatus ? updateStatusLabel(updateStatus) : null,
    isStale: networkConfirmed && updateStatus === "stale",
    staleReason:
      networkConfirmed &&
      updateStatus &&
      (updateStatus === "stale" || updateStatus === "source_current")
        ? updateStatusReason({
            status: updateStatus,
            nextRunAt: scheduleNextRunAt,
            latestObsDate: latestObsIso,
            sourceSync: sourceSync ?? null,
          })
        : null,
    calendarProvider: networkConfirmed ? calendarProvider : null,
    excelBootstrap,
    networkAcquisitionConfirmed: networkConfirmed,
    needsNetworkSource: needsNetwork,
    releasePackageId: pkgInfo?.packageId ?? null,
    releasePackageLabelZh: pkgInfo?.labelZh ?? null,
  };
}

async function loadLatestObservations(
  prisma: PrismaClient,
  instrumentIds: string[],
): Promise<Map<string, { value: number; obsDate: Date }>> {
  const map = new Map<string, { value: number; obsDate: Date }>();
  if (instrumentIds.length === 0) return map;

  // 取各 instrument 真实最新观测日（按 obs_date DESC）。
  // 旧逻辑在同月内优先 day=1，会导致日频序列（如 HY OAS）同步后仍显示月初值。
  const rows = await prisma.$queryRaw<
    { instrument_id: string; obs_date: Date; value: number }[]
  >`
    SELECT DISTINCT ON (instrument_id)
      instrument_id::text AS instrument_id,
      obs_date,
      value
    FROM mds."MacroObservation"
    WHERE instrument_id IN (${Prisma.join(instrumentIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY instrument_id, obs_date DESC
  `;

  for (const r of rows) {
    map.set(r.instrument_id, { value: r.value, obsDate: r.obs_date });
  }
  return map;
}

async function loadLatestFetchRunsByInstrument(
  prisma: PrismaClient,
  instrumentIds: string[],
): Promise<
  Map<string, { status: string; startedAt: Date; rowsUpserted: number; error: string | null; sourceLagDays: number | null }>
> {
  const map = new Map<
    string,
    {
      status: string;
      startedAt: Date;
      rowsUpserted: number;
      error: string | null;
      sourceLagDays: number | null;
    }
  >();
  if (instrumentIds.length === 0) return map;

  const rows = await prisma.$queryRaw<
    {
      instrument_id: string;
      status: string;
      started_at: Date;
      rows_upserted: number;
      error: string | null;
      source_lag_days: number | null;
    }[]
  >`
    SELECT DISTINCT ON (ds.instrument_id)
      ds.instrument_id::text AS instrument_id,
      fr.status::text AS status,
      fr.started_at,
      fr.rows_upserted,
      fr.error,
      fr.source_lag_days
    FROM mds.fetch_run fr
    INNER JOIN mds.data_subscription ds ON ds.id = fr.subscription_id
    WHERE ds.instrument_id IN (${Prisma.join(instrumentIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY ds.instrument_id, fr.started_at DESC
  `;

  for (const r of rows) {
    map.set(r.instrument_id, {
      status: r.status,
      startedAt: r.started_at,
      rowsUpserted: r.rows_upserted,
      error: r.error,
      sourceLagDays: r.source_lag_days,
    });
  }
  return map;
}

export async function buildAdminDataCatalog(
  prisma: PrismaClient,
): Promise<AdminDataCatalogPayload> {
  const catalog = await getFredCatalogCached();

  const instruments = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: {
        select: {
          enabled: true,
          nextRunAt: true,
          lastSuccessAt: true,
          lastObsDate: true,
          lastError: true,
          releaseRule: true,
          sourceSeriesKey: true,
          source: {
            select: {
              id: true,
              name: true,
              baseUrl: true,
              termsUrl: true,
              adapterKind: true,
              agency: { select: { nameZh: true, websiteUrl: true } },
            },
          },
        },
      },
    },
  });

  const byCode = new Map(instruments.map((i) => [i.code, i]));
  const byFred = new Map<string, InstRow>();
  for (const i of instruments) {
    if (i.fredSeriesId) byFred.set(i.fredSeriesId.toUpperCase(), i);
  }

  const latestByInstrument = await loadLatestObservations(
    prisma,
    instruments.map((i) => i.id),
  );
  const latestFetchByInstrument = await loadLatestFetchRunsByInstrument(
    prisma,
    instruments.map((i) => i.id),
  );
  const packageByInstrument = await loadPackageMapByInstrumentId(prisma);

  const matchedIds = collectMatchedInstrumentIds(catalog, byCode, byFred);
  const dbOnlyInstruments = instruments.filter((i) => !matchedIds.has(i.id));

  let countries: AdminCatalogCountry[] = catalog.countries.map((c) =>
    mapCountry(c, byCode, byFred, latestByInstrument, latestFetchByInstrument, packageByInstrument),
  );

  countries = appendDbOnlyCategories(
    countries,
    dbOnlyInstruments,
    latestByInstrument,
    latestFetchByInstrument,
    packageByInstrument,
  );

  const stats = countIndicatorsInCountries(countries);

  return {
    builtAt: new Date().toISOString(),
    countries: sortByCatalogCountryCode(countries, (c) => c.code),
    stats,
  };
}

function mapCountry(
  country: UnifiedCatalogCountry,
  byCode: Map<string, InstRow>,
  byFred: Map<string, InstRow>,
  latestByInstrument: Map<string, { value: number; obsDate: Date }>,
  latestFetchByInstrument: Map<
    string,
    { status: string; startedAt: Date; rowsUpserted: number; error: string | null; sourceLagDays: number | null }
  >,
  packageByInstrument: Map<string, PackageByInstrument>,
): AdminCatalogCountry {
  return {
    code: country.code,
    name: country.name || macroCountryName(country.code),
    categories: country.categories.map((cat) => ({
      name: cat.name,
      indicators: cat.items.map((item) =>
        enrichIndicator(
          item,
          country.code,
          cat.name,
          resolveInstrumentForKey(item.key, byCode, byFred),
          latestByInstrument,
          latestFetchByInstrument,
          packageByInstrument,
        ),
      ),
      subgroups: (cat.subgroups ?? []).map((sg) => ({
        name: sg.name,
        indicators: sg.items.map((item) =>
          enrichIndicator(
            item,
            country.code,
            `${cat.name} / ${sg.name}`,
            resolveInstrumentForKey(item.key, byCode, byFred),
            latestByInstrument,
            latestFetchByInstrument,
            packageByInstrument,
          ),
        ),
      })),
    })),
  };
}
