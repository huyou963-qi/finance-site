import { InstrumentKind, Prisma, type PrismaClient } from "@prisma/client";
import {
  getFredCatalogCached,
  macroCountryName,
  type UnifiedCatalogCountry,
  type UnifiedCatalogItem,
} from "@/lib/data/fredCatalog";
import { readFetchAcquisition } from "./fetchAcquisition";
import { parseReleaseRule, summarizeReleaseRule } from "./releaseRule";

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
};

export type AdminCatalogCategory = {
  name: string;
  indicators: AdminCatalogIndicator[];
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
  };
};

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
    source: {
      id: string;
      name: string;
      baseUrl: string | null;
      termsUrl: string | null;
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

function enrichIndicator(
  item: UnifiedCatalogItem,
  countryCode: string,
  categoryName: string,
  inst: InstRow | undefined,
  latestByInstrument: Map<string, { value: number; obsDate: Date }>,
  latestFetchByInstrument: Map<
    string,
    { status: string; startedAt: Date; rowsUpserted: number; error: string | null }
  >,
): AdminCatalogIndicator {
  const defaults = defaultSourceForProvider(item);
  const sub = inst?.dataSubscription ?? null;
  const latest = inst ? latestByInstrument.get(inst.id) : undefined;
  const rule = sub ? parseReleaseRule(sub.releaseRule) : null;

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
    nextRunAt: isoDateTime(sub?.nextRunAt),
    releaseRuleSummary: rule ? summarizeReleaseRule(rule) : null,
    calendarReleaseAt: calendarMatch?.releaseAt ?? null,
    calendarEventTitle: calendarMatch?.title ?? null,
    calendarSyncStatus: calendarSync?.status ?? null,
    subscriptionEnabled: sub?.enabled ?? null,
    lastSuccessAt: isoDateTime(sub?.lastSuccessAt),
    lastError: sub?.lastError ?? null,
    inDatabase: Boolean(inst),
    hasScheduledUpdates: Boolean(sub?.enabled),
    fetchAcquisitionStatus: fa?.status ?? null,
    fetchAcquisitionMethod: fa?.methodLabel ?? fa?.method ?? null,
    fetchAcquisitionMessage: fa?.message ?? fa?.error ?? null,
    fetchAcquisitionProbedAt: fa?.probedAt ?? null,
    fetchAcquisitionFetchUrl: fa?.fetchUrl ?? null,
    lastFetchStatus: lastFetch?.status ?? null,
    lastFetchAt: isoDateTime(lastFetch?.startedAt),
    lastFetchUpserted: lastFetch?.rowsUpserted ?? null,
  };
}

async function loadLatestObservations(
  prisma: PrismaClient,
  instrumentIds: string[],
): Promise<Map<string, { value: number; obsDate: Date }>> {
  const map = new Map<string, { value: number; obsDate: Date }>();
  if (instrumentIds.length === 0) return map;

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
  Map<string, { status: string; startedAt: Date; rowsUpserted: number; error: string | null }>
> {
  const map = new Map<
    string,
    { status: string; startedAt: Date; rowsUpserted: number; error: string | null }
  >();
  if (instrumentIds.length === 0) return map;

  const rows = await prisma.$queryRaw<
    {
      instrument_id: string;
      status: string;
      started_at: Date;
      rows_upserted: number;
      error: string | null;
    }[]
  >`
    SELECT DISTINCT ON (ds.instrument_id)
      ds.instrument_id::text AS instrument_id,
      fr.status::text AS status,
      fr.started_at,
      fr.rows_upserted,
      fr.error
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
          source: {
            select: {
              id: true,
              name: true,
              baseUrl: true,
              termsUrl: true,
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

  const countries: AdminCatalogCountry[] = catalog.countries.map((c) =>
    mapCountry(c, byCode, byFred, latestByInstrument, latestFetchByInstrument),
  );

  let totalIndicators = 0;
  let inDatabase = 0;
  let withSubscription = 0;
  let withLatestValue = 0;
  let fetchKnown = 0;
  let fetchPending = 0;

  for (const country of countries) {
    for (const cat of country.categories) {
      for (const ind of cat.indicators) {
        totalIndicators += 1;
        if (ind.inDatabase) inDatabase += 1;
        if (ind.hasScheduledUpdates) withSubscription += 1;
        if (ind.latestValue != null) withLatestValue += 1;
        if (ind.fetchAcquisitionStatus === "known") fetchKnown += 1;
        if (ind.fetchAcquisitionStatus === "pending") fetchPending += 1;
      }
    }
  }

  return {
    builtAt: new Date().toISOString(),
    countries,
    stats: {
      totalIndicators,
      inDatabase,
      withSubscription,
      withLatestValue,
      fetchKnown,
      fetchPending,
    },
  };
}

function mapCountry(
  country: UnifiedCatalogCountry,
  byCode: Map<string, InstRow>,
  byFred: Map<string, InstRow>,
  latestByInstrument: Map<string, { value: number; obsDate: Date }>,
  latestFetchByInstrument: Map<
    string,
    { status: string; startedAt: Date; rowsUpserted: number; error: string | null }
  >,
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
        ),
      ),
    })),
  };
}
