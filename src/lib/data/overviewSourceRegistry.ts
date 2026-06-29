/**
 * 美国经济 Overview 分析框架 — 经济角色 → 数据源台账（§3.1）
 * 与 `.cursor/prompts/us-overview-analysis-framework.md` 同步
 */

export type OverviewPillar = "L1" | "L2C" | "L2I" | "L2G" | "L2X" | "L2S" | "L3" | "L4" | "L5";

export type OverviewSourceStatus = "OK" | "TBD" | "PROXY";

export type OverviewSourceProvider = "fred" | "mds";

export type OverviewDefaultTemplate = "snapshot" | "demand" | "optional";

export type OverviewSourceEntry = {
  roleId: string;
  displayName: string;
  pillar: OverviewPillar;
  provider: OverviewSourceProvider;
  virtualKey: string;
  fredId?: string;
  instrumentCode?: string;
  status: OverviewSourceStatus;
  sourceNote: string;
  defaultTemplate: OverviewDefaultTemplate;
};

export const OVERVIEW_ISM_MDS = {
  manufacturing: {
    instrumentCode: "ism_us_ism_headline",
    virtualKey: "mds:ism_us_ism_headline",
    displayName: "ISM 制造业 PMI",
    teUrl: "https://tradingeconomics.com/united-states/business-confidence",
    syncScript: "scripts/data-worker/sync-ism-te.ts",
  },
  services: {
    instrumentCode: "ism_svc_us_svc_headline",
    virtualKey: "mds:ism_svc_us_svc_headline",
    displayName: "ISM 非制造业 PMI",
    teUrl: "https://tradingeconomics.com/united-states/non-manufacturing-pmi",
    syncScript: "scripts/data-worker/sync-ism-svc-te.ts",
  },
} as const;

/** §3.1 角色清单 */
export const OVERVIEW_SOURCE_REGISTRY: readonly OverviewSourceEntry[] = [
  {
    roleId: "us-gdp-saar",
    displayName: "实际 GDP 环比折年率",
    pillar: "L1",
    provider: "fred",
    virtualKey: "fred:A191RL1Q225SBEA",
    fredId: "A191RL1Q225SBEA",
    status: "OK",
    sourceNote: "BEA/FRED",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-indpro-yoy",
    displayName: "工业生产 YoY",
    pillar: "L1",
    provider: "fred",
    virtualKey: "fred:INDPRO::yoy",
    fredId: "INDPRO",
    status: "OK",
    sourceNote: "Fed G.17/FRED",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-unrate",
    displayName: "失业率",
    pillar: "L3",
    provider: "fred",
    virtualKey: "fred:UNRATE",
    fredId: "UNRATE",
    status: "OK",
    sourceNote: "BLS/FRED",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-nfp-change",
    displayName: "新增非农就业",
    pillar: "L3",
    provider: "fred",
    virtualKey: "fred:PAYEMS::diff",
    fredId: "PAYEMS",
    status: "OK",
    sourceNote: "PAYEMS 月差分",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-cpi-yoy",
    displayName: "CPI 同比",
    pillar: "L4",
    provider: "fred",
    virtualKey: "fred:CPIAUCSL::yoy",
    fredId: "CPIAUCSL",
    status: "OK",
    sourceNote: "BLS/FRED",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-core-pce-yoy",
    displayName: "核心 PCE 同比",
    pillar: "L4",
    provider: "fred",
    virtualKey: "fred:PCEPILFE::yoy",
    fredId: "PCEPILFE",
    status: "OK",
    sourceNote: "BEA/FRED",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-fed-target",
    displayName: "联邦基金目标利率",
    pillar: "L5",
    provider: "fred",
    virtualKey: "fred:DFEDTARU",
    fredId: "DFEDTARU",
    status: "OK",
    sourceNote: "Fed/FRED",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-10y2y",
    displayName: "10Y-2Y 利差",
    pillar: "L5",
    provider: "fred",
    virtualKey: "fred:T10Y2Y::avg",
    fredId: "T10Y2Y",
    status: "OK",
    sourceNote: "FRED 日频月均",
    defaultTemplate: "snapshot",
  },
  {
    roleId: "us-pce-real-yoy",
    displayName: "实际个人消费支出 YoY",
    pillar: "L2C",
    provider: "fred",
    virtualKey: "fred:PCEC96::yoy",
    fredId: "PCEC96",
    status: "OK",
    sourceNote: "BEA NIPA",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-retail-yoy",
    displayName: "零售销售 YoY",
    pillar: "L2C",
    provider: "fred",
    virtualKey: "fred:RSAFS::yoy",
    fredId: "RSAFS",
    status: "OK",
    sourceNote: "Census/FRED",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-pfi-real-yoy",
    displayName: "实际私人固定投资 YoY",
    pillar: "L2I",
    provider: "fred",
    virtualKey: "fred:PNFIC1::yoy",
    fredId: "PNFIC1",
    status: "OK",
    sourceNote: "BEA NIPA 私人固定投资",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-houst",
    displayName: "新屋开工",
    pillar: "L2I",
    provider: "fred",
    virtualKey: "fred:HOUST",
    fredId: "HOUST",
    status: "OK",
    sourceNote: "Census 住房投资代理",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-export-real-yoy",
    displayName: "实际出口 YoY",
    pillar: "L2X",
    provider: "fred",
    virtualKey: "fred:EXPGSC1::yoy",
    fredId: "EXPGSC1",
    status: "OK",
    sourceNote: "BEA NIPA 出口",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-import-real-yoy",
    displayName: "实际进口 YoY",
    pillar: "L2X",
    provider: "fred",
    virtualKey: "fred:IMPGSC1::yoy",
    fredId: "IMPGSC1",
    status: "OK",
    sourceNote: "BEA NIPA 进口",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-federal-deficit-gdp",
    displayName: "联邦赤字/GDP %",
    pillar: "L2G",
    provider: "fred",
    virtualKey: "fred:FYFSGDA188S",
    fredId: "FYFSGDA188S",
    status: "OK",
    sourceNote: "OMB/FRED 联邦收支",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-gov-consumption-yoy",
    displayName: "实际政府消费 YoY",
    pillar: "L2G",
    provider: "fred",
    virtualKey: "fred:GCEC1::yoy",
    fredId: "GCEC1",
    status: "OK",
    sourceNote: "BEA NIPA 政府消费支出",
    defaultTemplate: "demand",
  },
  {
    roleId: "us-ism-mfg-pmi",
    displayName: "ISM 制造业 PMI",
    pillar: "L2S",
    provider: "mds",
    virtualKey: OVERVIEW_ISM_MDS.manufacturing.virtualKey,
    instrumentCode: OVERVIEW_ISM_MDS.manufacturing.instrumentCode,
    status: "OK",
    sourceNote: "MDS + TE 抓取",
    defaultTemplate: "optional",
  },
  {
    roleId: "us-ism-nm-pmi",
    displayName: "ISM 非制造业 PMI",
    pillar: "L2S",
    provider: "mds",
    virtualKey: OVERVIEW_ISM_MDS.services.virtualKey,
    instrumentCode: OVERVIEW_ISM_MDS.services.instrumentCode,
    status: "OK",
    sourceNote: "MDS + TE 抓取",
    defaultTemplate: "optional",
  },
] as const;

export const OVERVIEW_DEFAULT_TEMPLATE_ROLE_IDS = OVERVIEW_SOURCE_REGISTRY.filter(
  (r) => r.defaultTemplate !== "optional",
).map((r) => r.roleId);

export const OVERVIEW_FRED_ROLE_IDS = OVERVIEW_SOURCE_REGISTRY.filter(
  (r) => r.provider === "fred",
).map((r) => r.fredId!);

export const OVERVIEW_MDS_ROLE_CODES = OVERVIEW_SOURCE_REGISTRY.filter(
  (r) => r.provider === "mds",
).map((r) => r.instrumentCode!);

export const OVERVIEW_TBD_ROLES = OVERVIEW_SOURCE_REGISTRY.filter((r) => r.status === "TBD");

/** 双模板间 roleId 不得重复（自检用） */
export function assertOverviewTemplateRoleDisjoint(): void {
  const snapshot = OVERVIEW_SOURCE_REGISTRY.filter((r) => r.defaultTemplate === "snapshot").map(
    (r) => r.roleId,
  );
  const demand = OVERVIEW_SOURCE_REGISTRY.filter((r) => r.defaultTemplate === "demand").map(
    (r) => r.roleId,
  );
  const overlap = snapshot.filter((id) => demand.includes(id));
  if (overlap.length > 0) {
    throw new Error(`Overview 模板 roleId 重复：${overlap.join(", ")}`);
  }
}

assertOverviewTemplateRoleDisjoint();
