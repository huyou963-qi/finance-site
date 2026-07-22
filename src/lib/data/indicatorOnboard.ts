import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { clearFredCatalogCache } from "@/lib/data/fredCatalog";
import { clearIndicatorSearchCache } from "@/lib/data/indicatorSearch";
import {
  ONBOARDING_STATUS_COMPLETE,
  ONBOARDING_STATUS_PENDING,
  fredCatalogKey,
  fredInstrumentCode,
  freqLabelFromFredFrequency,
  readOnboardingStatus,
  wbCatalogKey,
  wbInstrumentCode,
  wbSourceSeriesKey,
} from "@/lib/data/indicatorOnboarding";
import { weakTranslateTitle } from "@/lib/data/fredTitleZh";
import {
  defaultReleaseRuleForGranularity,
  computeNextRunAt,
} from "@/lib/data/scheduler/releaseRule";
import {
  granularityFromFredFrequency,
} from "@/lib/data/scheduler/adapters/fredAdapter";
import { getFredRateLimiter } from "@/lib/data/scheduler/fredRateLimiter";
import { runDataSubscription } from "@/lib/data/scheduler/runSubscription";
import {
  loadMacroCatalogLayout,
  saveMacroCatalogLayout,
  type CatalogLayoutDocument,
} from "@/lib/data/catalogLayout";
import { randomUUID } from "@/lib/randomId";

export type OnboardSource = "fred" | "worldbank";

export type OnboardRequest = {
  source: OnboardSource;
  sourceSeriesKey: string;
  /** WB 用，默认 US */
  countryCode?: string;
  titleHint?: string;
};

export type OnboardResult = {
  key: string;
  instrumentCode: string;
  created: boolean;
  alreadyLocal: boolean;
  onboardingStatus: typeof ONBOARDING_STATUS_PENDING | typeof ONBOARDING_STATUS_COMPLETE | null;
  title: string;
  backfillStatus: string | null;
  backfillError: string | null;
};

async function fetchFredSeriesMeta(seriesId: string, apiKey: string) {
  const url =
    `https://api.stlouisfed.org/fred/series` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json`;
  const res = await getFredRateLimiter().fetch(url);
  if (!res.ok) {
    throw new Error(`FRED series HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    seriess?: {
      id?: string;
      title?: string;
      frequency?: string;
      units?: string;
    }[];
  };
  const s = json.seriess?.[0];
  if (!s?.id) throw new Error(`FRED 未找到序列 ${seriesId}`);
  return {
    id: s.id.trim(),
    title: (s.title ?? s.id).trim(),
    frequency: s.frequency?.trim(),
    units: s.units?.trim() || null,
  };
}

async function backfillByCode(
  prisma: PrismaClient,
  instrumentCode: string,
): Promise<{ status: string | null; error: string | null }> {
  try {
    const sub = await prisma.dataSubscription.findFirst({
      where: { instrument: { code: instrumentCode } },
      include: {
        source: true,
        instrument: { select: { id: true, code: true, name: true, metadata: true } },
        releasePackage: {
          select: {
            id: true,
            labelZh: true,
            releaseTemplate: true,
            scheduleState: true,
            nextRunAt: true,
          },
        },
      },
    });
    if (!sub) return { status: null, error: "no_subscription" };
    const result = await runDataSubscription(prisma, sub, { force: true });
    return {
      status: result.status,
      error: result.status === "failed" ? result.error ?? "failed" : null,
    };
  } catch (e) {
    return {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function catalogKeyFromInstrument(row: {
  code: string;
  fredSeriesId: string | null;
  metadata: unknown;
}): string {
  const md =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  if (typeof md.catalogKey === "string" && md.catalogKey.trim()) {
    return md.catalogKey.trim();
  }
  if (row.fredSeriesId) return fredCatalogKey(row.fredSeriesId);
  return `mds:${row.code}`;
}

export async function onboardIndicator(
  prisma: PrismaClient,
  req: OnboardRequest,
): Promise<OnboardResult> {
  if (req.source === "fred") {
    return onboardFred(prisma, req.sourceSeriesKey.trim(), req.titleHint);
  }
  if (req.source === "worldbank") {
    const parts = req.sourceSeriesKey.includes(":")
      ? req.sourceSeriesKey.split(":")
      : [req.countryCode ?? "US", req.sourceSeriesKey];
    const countryCode = (parts[0] ?? "US").trim().toUpperCase();
    const indicatorId = (parts.slice(1).join(":") || req.sourceSeriesKey).trim();
    return onboardWorldBank(prisma, countryCode, indicatorId, req.titleHint);
  }
  throw new Error("不支持的数据源");
}

async function onboardFred(
  prisma: PrismaClient,
  seriesIdRaw: string,
  titleHint?: string,
): Promise<OnboardResult> {
  const seriesId = seriesIdRaw.trim().toUpperCase();
  if (!seriesId) throw new Error("缺少 FRED series id");

  const existing = await prisma.instrument.findFirst({
    where: {
      OR: [{ fredSeriesId: seriesId }, { code: fredInstrumentCode(seriesId) }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: { select: { id: true } },
    },
  });

  if (existing) {
    const key = catalogKeyFromInstrument(existing);
    // 确保有订阅
    if (!existing.dataSubscription) {
      await ensureFredSubscription(prisma, existing.id, seriesId, DataGranularity.MONTHLY);
    }
    return {
      key,
      instrumentCode: existing.code,
      created: false,
      alreadyLocal: true,
      onboardingStatus: readOnboardingStatus(existing.metadata),
      title: existing.name,
      backfillStatus: null,
      backfillError: null,
    };
  }

  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 FRED_API_KEY");

  const meta = await fetchFredSeriesMeta(seriesId, apiKey);
  const granularity = granularityFromFredFrequency(meta.frequency);
  const freqLabel = freqLabelFromFredFrequency(meta.frequency);
  const code = fredInstrumentCode(meta.id);
  const catalogKey = fredCatalogKey(meta.id);
  const titleEn = meta.title;
  const zh = weakTranslateTitle({
    titleEn: titleHint?.trim() && /[\u4e00-\u9fff]/.test(titleHint) ? titleEn : titleHint?.trim() || titleEn,
    seriesId: meta.id,
    units: meta.units,
    source: "fred",
  });
  // titleHint 若已是中文（侧栏传入弱译），优先采用
  const labelZh =
    titleHint?.trim() && /[\u4e00-\u9fff]/.test(titleHint) ? titleHint.trim() : zh.labelZh;
  const labelZhWeak = !(titleHint?.trim() && /[\u4e00-\u9fff]/.test(titleHint)) && zh.weak;
  const nowIso = new Date().toISOString();

  const metadata: Prisma.InputJsonValue = {
    onboardingStatus: ONBOARDING_STATUS_PENDING,
    catalogKey,
    source: "FRED",
    sourceTag: "indicator-search",
    addedVia: "indicator_search",
    pendingSince: nowIso,
    countryCode: "US",
    countryNameZh: "美国",
    displayName: labelZh,
    nameEn: titleEn,
    labelZhWeak,
    catalogCategory: "未分配",
    fetchAcquisition: {
      status: "known",
      probedAt: nowIso,
      method: "fred_api",
      methodLabel: "FRED API（搜索入库）",
      officialUrl: `https://fred.stlouisfed.org/series/${meta.id}`,
      message: "用户搜索添加，已确认 FRED 源",
    },
  };

  const instrument = await prisma.instrument.create({
    data: {
      code,
      kind: InstrumentKind.MACRO_SERIES,
      name: labelZh,
      nameEn: titleEn,
      freqLabel,
      unit: meta.units,
      fredSeriesId: meta.id,
      externalRefs: {
        catalogKey,
        agencyId: "us-fred",
        sourceId: "fred",
      },
      metadata,
    },
  });

  await ensureFredSubscription(prisma, instrument.id, meta.id, granularity);

  clearFredCatalogCache();
  clearIndicatorSearchCache();

  const backfill = await backfillByCode(prisma, code);

  return {
    key: catalogKey,
    instrumentCode: code,
    created: true,
    alreadyLocal: false,
    onboardingStatus: ONBOARDING_STATUS_PENDING,
    title: labelZh,
    backfillStatus: backfill.status,
    backfillError: backfill.error,
  };
}

async function ensureFredSubscription(
  prisma: PrismaClient,
  instrumentId: string,
  fredId: string,
  granularity: DataGranularity,
) {
  const fredSource = await prisma.dataSource.findUnique({ where: { id: "fred" } });
  if (!fredSource) {
    throw new Error("数据源 fred 未初始化，请先运行 data:seed-p0 / data:apply");
  }
  const rule = defaultReleaseRuleForGranularity(granularity);
  // defaultReleaseRuleForGranularity 对 MONTHLY 返回 calendar_monthly；草稿用 probe_interval 更稳妥
  const probeRule =
    granularity === DataGranularity.DAILY ||
    granularity === DataGranularity.WEEKLY ||
    granularity === DataGranularity.MONTHLY ||
    granularity === DataGranularity.QUARTERLY ||
    granularity === DataGranularity.ANNUAL
      ? ({
          type: "probe_interval" as const,
          intervalHours:
            granularity === DataGranularity.DAILY
              ? 6
              : granularity === DataGranularity.WEEKLY
                ? 12
                : granularity === DataGranularity.MONTHLY
                  ? 72
                  : 168,
        })
      : rule;
  const nextRunAt = computeNextRunAt(probeRule, new Date()) ?? new Date();

  await prisma.dataSubscription.upsert({
    where: { instrumentId },
    create: {
      instrumentId,
      sourceId: "fred",
      sourceSeriesKey: fredId,
      fetchMethod: DataFetchMethod.API,
      granularity,
      releaseRule: probeRule,
      nextRunAt,
      enabled: true,
      priority: 5,
    },
    update: {
      sourceSeriesKey: fredId,
      granularity,
      releaseRule: probeRule,
      enabled: true,
    },
  });
}

async function onboardWorldBank(
  prisma: PrismaClient,
  countryCode: string,
  indicatorId: string,
  titleHint?: string,
): Promise<OnboardResult> {
  const cc = countryCode.trim().toUpperCase() || "US";
  const ind = indicatorId.trim();
  if (!ind) throw new Error("缺少 World Bank indicator id");

  const sourceSeriesKey = wbSourceSeriesKey(cc, ind);
  const code = wbInstrumentCode(cc, ind);
  const catalogKey = wbCatalogKey(cc, ind);

  const existing = await prisma.instrument.findFirst({
    where: {
      OR: [
        { code },
        {
          dataSubscription: {
            sourceId: "worldbank",
            sourceSeriesKey,
          },
        },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: { select: { id: true } },
    },
  });

  if (existing) {
    return {
      key: catalogKeyFromInstrument(existing) || catalogKey,
      instrumentCode: existing.code,
      created: false,
      alreadyLocal: true,
      onboardingStatus: readOnboardingStatus(existing.metadata),
      title: existing.name,
      backfillStatus: null,
      backfillError: null,
    };
  }

  const wbSource = await prisma.dataSource.findUnique({ where: { id: "worldbank" } });
  if (!wbSource) {
    throw new Error("数据源 worldbank 未初始化，请先运行 data:seed");
  }

  const titleEn = titleHint?.trim() && !/[\u4e00-\u9fff]/.test(titleHint) ? titleHint.trim() : ind;
  const zh = weakTranslateTitle({
    titleEn: titleEn || ind,
    seriesId: ind,
    source: "worldbank",
  });
  const labelZh =
    titleHint?.trim() && /[\u4e00-\u9fff]/.test(titleHint) ? titleHint.trim() : zh.labelZh;
  const labelZhWeak = !(titleHint?.trim() && /[\u4e00-\u9fff]/.test(titleHint)) && zh.weak;
  const nowIso = new Date().toISOString();
  const granularity = DataGranularity.ANNUAL;
  const probeRule = { type: "probe_interval" as const, intervalHours: 168 };
  const nextRunAt = computeNextRunAt(probeRule, new Date()) ?? new Date();

  const instrument = await prisma.instrument.create({
    data: {
      code,
      kind: InstrumentKind.MACRO_SERIES,
      name: labelZh,
      nameEn: zh.labelEn || titleEn,
      freqLabel: "年",
      unit: null,
      externalRefs: {
        catalogKey,
        sourceId: "worldbank",
      },
      metadata: {
        onboardingStatus: ONBOARDING_STATUS_PENDING,
        catalogKey,
        source: "World Bank",
        sourceTag: "indicator-search",
        addedVia: "indicator_search",
        pendingSince: nowIso,
        countryCode: cc,
        displayName: labelZh,
        nameEn: zh.labelEn || titleEn,
        labelZhWeak,
        catalogCategory: "未分配",
        fetchAcquisition: {
          status: "known",
          probedAt: nowIso,
          method: "worldbank_api",
          methodLabel: "世界银行 API（搜索入库）",
          message: "用户搜索添加，已确认 World Bank 源",
        },
      },
    },
  });

  await prisma.dataSubscription.create({
    data: {
      instrumentId: instrument.id,
      sourceId: "worldbank",
      sourceSeriesKey,
      fetchMethod: DataFetchMethod.API,
      granularity,
      releaseRule: probeRule,
      nextRunAt,
      enabled: true,
      priority: 5,
    },
  });

  clearFredCatalogCache();
  clearIndicatorSearchCache();

  const backfill = await backfillByCode(prisma, code);

  return {
    key: catalogKey,
    instrumentCode: code,
    created: true,
    alreadyLocal: false,
    onboardingStatus: ONBOARDING_STATUS_PENDING,
    title: labelZh,
    backfillStatus: backfill.status,
    backfillError: backfill.error,
  };
}

export type PromoteRequest = {
  instrumentCode: string;
  displayName?: string;
  catalogCategory: string;
  countryCode?: string;
  releasePackageId?: string | null;
  unit?: string | null;
  freqLabel?: string | null;
};

export type PromoteResult = {
  key: string;
  instrumentCode: string;
  onboardingStatus: typeof ONBOARDING_STATUS_COMPLETE;
  catalogCategory: string;
};

function ensureLayoutHasKey(
  layout: CatalogLayoutDocument,
  countryCode: string,
  categoryName: string,
  key: string,
): CatalogLayoutDocument {
  const countries = layout.countries.map((c) => ({
    ...c,
    categories: c.categories.map((cat) => ({
      ...cat,
      itemKeys: [...cat.itemKeys],
      subgroups: cat.subgroups.map((sg) => ({ ...sg, itemKeys: [...sg.itemKeys] })),
    })),
  }));

  let country = countries.find((c) => c.countryCode === countryCode);
  if (!country) {
    country = { countryCode, categories: [] };
    countries.push(country);
  }

  // 从其他分类移除该 key
  for (const cat of country.categories) {
    cat.itemKeys = cat.itemKeys.filter((k) => k !== key);
    for (const sg of cat.subgroups) {
      sg.itemKeys = sg.itemKeys.filter((k) => k !== key);
    }
  }

  let cat = country.categories.find((c) => c.name === categoryName);
  if (!cat) {
    cat = {
      id: randomUUID(),
      name: categoryName,
      itemKeys: [],
      subgroups: [],
    };
    country.categories.push(cat);
  }
  if (!cat.itemKeys.includes(key)) cat.itemKeys.push(key);

  return { version: layout.version, countries };
}

export async function promoteIndicator(
  prisma: PrismaClient,
  req: PromoteRequest,
): Promise<PromoteResult> {
  const code = req.instrumentCode.trim();
  const category = req.catalogCategory.trim();
  if (!code) throw new Error("缺少 instrumentCode");
  if (!category) throw new Error("请指定目录分类 catalogCategory");

  const inst = await prisma.instrument.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      freqLabel: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: { select: { id: true } },
    },
  });
  if (!inst) throw new Error("指标不存在");

  const md =
    inst.metadata && typeof inst.metadata === "object" && !Array.isArray(inst.metadata)
      ? { ...(inst.metadata as Record<string, unknown>) }
      : {};

  const key = catalogKeyFromInstrument(inst);
  const displayName = req.displayName?.trim() || (typeof md.displayName === "string" ? md.displayName : inst.name);
  const countryCode = (
    req.countryCode?.trim() ||
    (typeof md.countryCode === "string" ? md.countryCode : "US")
  ).toUpperCase();

  md.onboardingStatus = ONBOARDING_STATUS_COMPLETE;
  md.catalogKey = key;
  md.displayName = displayName;
  md.catalogCategory = category;
  md.countryCode = countryCode;
  md.promotedAt = new Date().toISOString();
  delete md.pendingSince;

  await prisma.instrument.update({
    where: { id: inst.id },
    data: {
      name: displayName,
      unit: req.unit !== undefined ? req.unit : inst.unit,
      freqLabel: req.freqLabel !== undefined ? req.freqLabel : inst.freqLabel,
      metadata: md as Prisma.InputJsonValue,
    },
  });

  if (req.releasePackageId && inst.dataSubscription) {
    const pkg = await prisma.releasePackage.findUnique({
      where: { id: req.releasePackageId },
    });
    if (!pkg) throw new Error(`发布包不存在: ${req.releasePackageId}`);
    await prisma.dataSubscription.update({
      where: { id: inst.dataSubscription.id },
      data: { releasePackageId: pkg.id },
    });
    await prisma.releasePackageMember.upsert({
      where: {
        packageId_instrumentId: {
          packageId: pkg.id,
          instrumentId: inst.id,
        },
      },
      create: {
        packageId: pkg.id,
        instrumentId: inst.id,
      },
      update: {},
    });
  }

  const layout = await loadMacroCatalogLayout();
  if (layout) {
    const next = ensureLayoutHasKey(layout, countryCode, category, key);
    await saveMacroCatalogLayout(next);
  }

  clearFredCatalogCache();
  clearIndicatorSearchCache();

  return {
    key,
    instrumentCode: code,
    onboardingStatus: ONBOARDING_STATUS_COMPLETE,
    catalogCategory: category,
  };
}

/** 待完善 / 已晋升用户添加指标 → 供 allowlist 与正式树注入 */
export async function loadSearchOnboardedInstruments(prisma: PrismaClient) {
  const rows = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      OR: [
        { metadata: { path: ["addedVia"], equals: "indicator_search" } },
        { metadata: { path: ["onboardingStatus"], equals: ONBOARDING_STATUS_PENDING } },
        { metadata: { path: ["onboardingStatus"], equals: ONBOARDING_STATUS_COMPLETE } },
      ],
    },
    select: {
      code: true,
      name: true,
      freqLabel: true,
      unit: true,
      fredSeriesId: true,
      metadata: true,
    },
  });
  return rows;
}
