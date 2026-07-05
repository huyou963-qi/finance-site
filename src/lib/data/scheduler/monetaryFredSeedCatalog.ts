import type { DataGranularity } from "@prisma/client";

/**
 * 美国货币政策与金融条件 — FRED 种子目录
 *
 * Spec: docs/specs/us-monetary-financial.spec.md
 * 全部序列无固定发布日历（日/周/季频 + H.8 月频），统一 probe_interval，
 * 不参与经济日历同步（无 teEventMap / releasePackageCatalog 关键词即自动跳过）。
 */

export type MonetaryFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  source: string;
  sourceUpdateNote: string;
};

function monetaryFredSourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (fredId === "EFFR" || fredId === "RRPONTSYD") {
    return { source: "NY Fed/FRED", sourceUpdateNote: "交易日" };
  }
  if (fredId === "DGS2" || fredId === "DGS10" || fredId === "DFII10" || fredId === "T10Y3M") {
    return { source: "Treasury H.15/FRED", sourceUpdateNote: "交易日" };
  }
  if (fredId === "NFCI") {
    return { source: "Chicago Fed/FRED", sourceUpdateNote: "每周三" };
  }
  if (fredId === "BAMLC0A0CM" || fredId === "BAMLH0A0HYM2") {
    return { source: "ICE BofA/FRED", sourceUpdateNote: "交易日" };
  }
  if (fredId === "BUSLOANS") {
    return { source: "Fed H.8/FRED", sourceUpdateNote: "月度（H.8 周报聚合）" };
  }
  if (fredId === "DRTSCILM") {
    return { source: "Fed SLOOS/FRED", sourceUpdateNote: "季度（SLOOS 调查）" };
  }
  return { source: "Fed/FRED", sourceUpdateNote: "季度" };
}

function monetaryFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  releasePackageId: string,
): MonetaryFredSeedRow & { releasePackageId: string } {
  const { source, sourceUpdateNote } = monetaryFredSourceMeta(fredId);
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel,
    granularity,
    unit,
    releasePackageId,
    category,
    countryCode: "US",
    source,
    sourceUpdateNote,
  };
}

export function buildMonetaryInstrumentMetadata(
  row: MonetaryFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "monetary-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: row.countryCode,
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: row.category,
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fred:${row.fredId}`,
  };
  if (opts?.dataLastObsDateIso) {
    next.dataLastObsDateIso = opts.dataLastObsDateIso;
  }
  return next;
}

/** 本维度新 seed 的 12 条 FRED 序列（含所属发布包，按 FRED 官方 Release: 字段分组） */
export const MONETARY_FRED_SERIES: readonly (MonetaryFredSeedRow & {
  releasePackageId: string;
})[] = [
  monetaryFredRow("EFFR", "有效联邦基金利率", "货币政策", "日", "DAILY", "%", "us.nyfed.effr"),
  monetaryFredRow("DGS2", "2Y 国债收益率", "货币政策", "日", "DAILY", "%", "us.frb.h15_rates"),
  monetaryFredRow("DFII10", "10Y TIPS 实际收益率", "货币政策", "日", "DAILY", "%", "us.frb.h15_rates"),
  monetaryFredRow("RRPONTSYD", "ON RRP 隔夜逆回购余额", "货币政策", "日", "DAILY", "十亿美元", "us.nyfed.rrp"),
  monetaryFredRow("DGS10", "10Y 国债收益率", "货币政策", "日", "DAILY", "%", "us.frb.h15_rates"),
  monetaryFredRow("T10Y3M", "10Y-3M 国债利差", "货币政策", "日", "DAILY", "%", "us.frb.interest_rate_spreads"),
  monetaryFredRow("NFCI", "Chicago Fed 全国金融条件指数", "金融条件", "周", "WEEKLY", "指数", "us.chicagofed.nfci"),
  monetaryFredRow("BAMLC0A0CM", "投资级公司债 OAS", "金融条件", "日", "DAILY", "%", "us.ice.bofa_indices"),
  monetaryFredRow("DRTSCILM", "SLOOS 工商贷款收紧净比例（大中企业）", "金融条件", "季", "QUARTERLY", "%", "us.frb.sloos"),
  monetaryFredRow("BUSLOANS", "工商业贷款存量", "金融条件", "月", "MONTHLY", "十亿美元", "us.frb.h8_bank_assets"),
  monetaryFredRow("DRCCLACBS", "信用卡拖欠率", "金融条件", "季", "QUARTERLY", "%", "us.frb.chargeoff_delinquency"),
  monetaryFredRow("DRBLACBS", "工商业贷款拖欠率", "金融条件", "季", "QUARTERLY", "%", "us.frb.chargeoff_delinquency"),
] as const;

/**
 * 已由其他 seed 入库、本维度直接复用（不重复 seed，不覆盖其 metadata 归类）。
 * `unitIfMissing`：仅当 Instrument.unit 为空时回填（phase2SeedCatalog 的 PHASE2_FRED_EXTRA
 * 未定义 unit 字段，导致其入库的 Instrument.unit 恒为 null；此处按 FRED 官方页核实值
 * 做范围内补漏，不改动 phase2SeedCatalog.ts 本身，避免影响其他域）。
 */
export const MONETARY_FRED_REUSED: readonly {
  fredId: string;
  code: string;
  seededBy: string;
  granularity: DataGranularity;
  unitIfMissing: string;
  /** 期望所属发布包；WALCL 已在 phase2/phase4 挂到真实日历包 us.fed.h41（有 TE 匹配），不改动 */
  expectedReleasePackageId: string;
}[] = [
  {
    fredId: "T10YIE",
    code: "sched_fred_T10YIE",
    seededBy: "cpi",
    granularity: "DAILY",
    unitIfMissing: "%",
    expectedReleasePackageId: "us.frb.interest_rate_spreads",
  },
  {
    fredId: "WALCL",
    code: "sched_fred_WALCL",
    seededBy: "phase2",
    granularity: "WEEKLY",
    unitIfMissing: "百万美元",
    expectedReleasePackageId: "us.fed.h41",
  },
  {
    fredId: "BAMLH0A0HYM2",
    code: "sched_fred_BAMLH0A0HYM2",
    seededBy: "phase2",
    granularity: "DAILY",
    unitIfMissing: "%",
    expectedReleasePackageId: "us.ice.bofa_indices",
  },
] as const;

export const MONETARY_FRED_IDS = new Set(MONETARY_FRED_SERIES.map((x) => x.fredId));

/** 全维度无发布日历事件：按粒度 probe_interval（日 24h / 周 24h / 月 72h / 季 168h） */
export function releaseRuleForMonetaryFred(granularity: DataGranularity) {
  switch (granularity) {
    case "DAILY":
      return { type: "probe_interval" as const, intervalHours: 24 };
    case "WEEKLY":
      return { type: "probe_interval" as const, intervalHours: 24 };
    case "MONTHLY":
      return { type: "probe_interval" as const, intervalHours: 72 };
    case "QUARTERLY":
      return { type: "probe_interval" as const, intervalHours: 168 };
    default:
      return { type: "probe_interval" as const, intervalHours: 24 };
  }
}
