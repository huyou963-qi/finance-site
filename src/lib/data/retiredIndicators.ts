import type { MacroDerivedCalcOp, MacroSeriesCalcConfig } from "@/lib/data/macroPresetTemplates";
import { RETIRED_USOV_REPLACEMENTS, type UsOverviewReplacement } from "@/lib/data/usOverviewStandardSeries";
import { GOLD_FUTURES_CODE, GOLD_SPOT_CODE, GOLD_SUPERSEDED_BY } from "@/lib/data/scheduler/goldPrices/catalog";
import { JAPAN_OVERVIEW_STANDARD_DERIVED, JAPAN_OVERVIEW_SUPERSEDED } from "@/lib/data/japanOverviewStandardSeries";

/**
 * 已退役指标登记表（单一真源）——数据库只存有明确来源、稳定更新方式的标准基础数据（AGENTS.md「宏观数据库约束」）。
 *
 * - usov 批：US_Overview xlsx 不合规序列（见 usOverviewStandardSeries.ts）。
 * - 计算型批（2026-09-11）：库内由调度器/xlsx 计算出的二次指标（复合 spread/ratio、环比、MA、单位换算、
 *   合计、调度器 YoY、内部统计汇总）。二次指标一律改在「指标运算」（模板 derivedCalcs / seriesCalcConfig）中实现。
 *
 * 替代方式：
 * - `{ key, calc }`：模板里改用标准基础指标键（可带 ::变换 + seriesCalcConfig）；
 * - `{ derived }`：模板里改成指标运算 `calc:<id>`，输入的基础序列自动补入已选指标（不分配图位）；
 * - `null`：无法用指标运算表达（MA、多序列合计、非标准单位换算）或无模板引用，直接移除。
 */
export type RetiredDerived = {
  id: string;
  name: string;
  op: MacroDerivedCalcOp;
  leftKey: string;
  rightKey: string;
  scale?: number;
};

export type RetiredReplacement = UsOverviewReplacement | { derived: RetiredDerived } | null;

const NONE: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
const DIFF_KEEP: MacroSeriesCalcConfig = { op: "diff", frequency: "keep", unit: "keep", resampleMethod: "end" };
const PCT_KEEP: MacroSeriesCalcConfig = { op: "pctChange", frequency: "keep", unit: "keep", resampleMethod: "end" };
const YOY_MONTH: MacroSeriesCalcConfig = { op: "yoy", frequency: "month", unit: "keep", resampleMethod: "end" };

export const RETIRED_COMPUTED_REPLACEMENTS: Readonly<Record<string, RetiredReplacement>> = {
  // US_Overview：FRED 复合（usovCompositeFred）
  usov_c04_spx_gld: {
    derived: { id: "usov-spx-gld", name: "SPX/GLD", op: "div", leftKey: "mds:usov_c03_sp500", rightKey: `mds:${GOLD_FUTURES_CODE}` },
  },
  usov_c12_2y_effr: {
    derived: { id: "usov-2y-effr", name: "2年-EFFR", op: "sub", leftKey: "fred:DGS2", rightKey: "mds:usov_c11_effr" },
  },
  usov_c25_fed_treasuries_wow: { key: "mds:usov_c24_fed_treasuries::pct", calc: PCT_KEEP },
  usov_c26_fed_treasuries_wow_ma4: null,
  usov_c27_fed_net_liquidity: {
    derived: {
      id: "usov-fed-net-liquidity",
      name: "Fed Net Liquidity",
      op: "sub",
      leftKey: "mds:usov_c23_fed_assets",
      rightKey: "mds:usov_c24_fed_treasuries",
    },
  },
  // 黄金分析：xlsx 派生列
  goldov_c03_basis: {
    derived: { id: "gold-basis", name: "期现差", op: "sub", leftKey: `mds:${GOLD_FUTURES_CODE}`, rightKey: `mds:${GOLD_SPOT_CODE}` },
  },
  goldov_c07_comex_stock: { key: "mds:goldov_c23_comex_stock_oz", calc: NONE },
  goldov_c08_comex_stock_wow: { key: "mds:goldov_c23_comex_stock_oz::diff", calc: DIFF_KEEP },
  goldov_c09_etf_holding: null,
  goldov_c10_etf_holding_wow: null,
  goldov_c11_global_reserve: { key: "mds:goldov_c24_global_reserve_tons", calc: NONE },
  goldov_c16_etf_tons_wow: null,
  goldov_c25_etf_holding_tons: null,
  // 财政：FRED/Treasury 复合与调度器 YoY
  fiscal_primary_deficit_gdp: {
    derived: {
      id: "fiscal-primary-deficit-gdp",
      name: "联邦初级赤字/GDP %",
      op: "sub",
      leftKey: "fred:FYFSGDA188S",
      rightKey: "fred:FYOIGDA188S",
    },
  },
  fiscal_fgcec1_yoy: { key: "fred:FGCEC1::yoy", calc: YOY_MONTH },
  fiscal_interest_share_outlays_annual: null,
  fiscal_individual_tax_share_receipts: null,
  fiscal_net_interest_share_outlays: null,
  fiscal_ss_medicare_share_outlays: null,
  // 内部统计：由 Form 4 汇总计算的月度序列
  sec_us_insider_buy_share_monthly: null,
  sec_us_insider_buy_filings_monthly: null,
  // Japan_Overview：xlsx 利差列（2026-09-21）——可由 c06、c07 逐日精确重算，改为指标运算
  jpov_c08_jgb_10y2y: { derived: JAPAN_OVERVIEW_STANDARD_DERIVED[0]!.calc },
};

/**
 * 源端已停发（2026-09-21）。
 *
 * 与上面两批的退役理由**不同**：usov / 计算型是「本来就不该进库」，这批是
 * 世界银行真的把指标下架了——`data:probe-sources` 对它们一律返回
 * 「世行 API 无有效观测」，`resolveAcquisitionStatus` 因此判 `probe_failed`。
 *
 * **只收零观测的那些。** 同批停发的序列里还有 12 条握着 1990–2019 的真实历史
 * （如 `sched_wb_AU_FR_INR_RINR` 30 个点），而本文件的退役是**硬删除**
 * （seed-retired-indicators 会连 Instrument 带观测一起删），删掉就不可逆，
 * 所以那 12 条不放进来——它们是「已停更但历史有效」，另行决定如何呈现。
 * 往这里加条目前请先确认该 code 的 `MacroObservation` 计数为 0。
 */
const RETIRED_SOURCE_DISCONTINUED_REPLACEMENTS: Readonly<Record<string, RetiredReplacement>> = {
  // GC.BAL.CASH.GD.ZS（财政现金收支差额占 GDP）× 15 国
  sched_wb_AU_GC_BAL_CASH_GD_ZS: null,
  sched_wb_BR_GC_BAL_CASH_GD_ZS: null,
  sched_wb_CA_GC_BAL_CASH_GD_ZS: null,
  sched_wb_CH_GC_BAL_CASH_GD_ZS: null,
  sched_wb_CN_GC_BAL_CASH_GD_ZS: null,
  sched_wb_DE_GC_BAL_CASH_GD_ZS: null,
  sched_wb_FR_GC_BAL_CASH_GD_ZS: null,
  sched_wb_GB_GC_BAL_CASH_GD_ZS: null,
  sched_wb_ID_GC_BAL_CASH_GD_ZS: null,
  sched_wb_IN_GC_BAL_CASH_GD_ZS: null,
  sched_wb_JP_GC_BAL_CASH_GD_ZS: null,
  sched_wb_KR_GC_BAL_CASH_GD_ZS: null,
  sched_wb_MX_GC_BAL_CASH_GD_ZS: null,
  sched_wb_SA_GC_BAL_CASH_GD_ZS: null,
  sched_wb_ZA_GC_BAL_CASH_GD_ZS: null,
  // FS.AST.DOMS.GD.ZS（银行部门国内信贷占 GDP）× 10 国
  sched_wb_AU_FS_AST_DOMS_GD_ZS: null,
  sched_wb_BR_FS_AST_DOMS_GD_ZS: null,
  sched_wb_CH_FS_AST_DOMS_GD_ZS: null,
  sched_wb_CN_FS_AST_DOMS_GD_ZS: null,
  sched_wb_DE_FS_AST_DOMS_GD_ZS: null,
  sched_wb_FR_FS_AST_DOMS_GD_ZS: null,
  sched_wb_GB_FS_AST_DOMS_GD_ZS: null,
  sched_wb_IN_FS_AST_DOMS_GD_ZS: null,
  sched_wb_KR_FS_AST_DOMS_GD_ZS: null,
  sched_wb_SA_FS_AST_DOMS_GD_ZS: null,
  // GC.DOD.TOTL.GD.ZS（政府债务占 GDP）× 4 国
  sched_wb_CN_GC_DOD_TOTL_GD_ZS: null,
  sched_wb_FR_GC_DOD_TOTL_GD_ZS: null,
  sched_wb_JP_GC_DOD_TOTL_GD_ZS: null,
  sched_wb_SA_GC_DOD_TOTL_GD_ZS: null,
  // FR.INR.RINR（实际利率）× 3 国
  sched_wb_DE_FR_INR_RINR: null,
  sched_wb_FR_FR_INR_RINR: null,
  sched_wb_SA_FR_INR_RINR: null,
  // FM.LBL.BMNY.GD.ZS（广义货币占 GDP）× 2 国
  sched_wb_DE_FM_LBL_BMNY_GD_ZS: null,
  sched_wb_FR_FM_LBL_BMNY_GD_ZS: null,
  // AAR 周度铁路运量（2026-09-21）：aar.org 对机房 IP 下发人机验证，从未取到一个观测点；
  // 抓取模块已移除，改接 BTS 月度 fred:RAILFRTCARLOADSD11 / fred:RAILFRTINTERMODALD11。
  // 无模板引用，直接移除（不设键替换，免得部署末自检要求替代序列当场有观测）。
  aar_us_rail_carloads_weekly: null,
  aar_us_rail_intermodal_weekly: null,
};

export const RETIRED_INDICATOR_REPLACEMENTS: Readonly<Record<string, RetiredReplacement>> = {
  ...RETIRED_USOV_REPLACEMENTS,
  ...RETIRED_COMPUTED_REPLACEMENTS,
  ...RETIRED_SOURCE_DISCONTINUED_REPLACEMENTS,
};

export const RETIRED_INDICATOR_CODES = Object.keys(RETIRED_INDICATOR_REPLACEMENTS);

/**
 * 被标准序列取代、但**历史保留**的旧列（2026-09-21）：
 * - 黄金现货/期货 goldov_c01 / goldov_c02 / usov_c05，见 goldPrices/catalog.ts；
 * - goldov_c28_real_rate「美国实际利率」：世行 FR.INR.RINR（年度，贷款利率减 GDP 平减），
 *   世行对美国只发布到 2021 年（2026-07 更新后仍无新值）→ 黄金模板改用日频 10 年期 TIPS
 *   实际收益率 fred:DFII10（模板里本就选了它），图位沿用 c28 的。
 * - Japan_Overview 16 列 → 日本官方标准序列（+ 同比/环比运算），见 japanOverviewStandardSeries.ts。
 *
 * 模板替换与上面的退役键相同（rewriteRetiredKeys：键 → 标准键），但仪器与观测不删：
 * 只写 tombstone（目录隐藏 + 调度器跳过），同 SOURCE_ENDED_HIDDEN_CODES。
 * 这些是 Wind/IDC 的拼接历史，无法从可自动更新的源复现，删了不可逆。
 */
const NONE_CALC: MacroSeriesCalcConfig = { op: "none", frequency: "keep", unit: "keep", resampleMethod: "avg" };
export const SUPERSEDED_KEEP_HISTORY_REPLACEMENTS: Readonly<Record<string, UsOverviewReplacement>> = {
  ...Object.fromEntries(
    Object.entries(GOLD_SUPERSEDED_BY).map(([code, target]) => [code, { key: `mds:${target}`, calc: NONE_CALC }]),
  ),
  goldov_c28_real_rate: { key: "fred:DFII10", calc: NONE_CALC },
  ...JAPAN_OVERVIEW_SUPERSEDED,
};

export const SUPERSEDED_KEEP_HISTORY_CODES = Object.keys(SUPERSEDED_KEEP_HISTORY_REPLACEMENTS);

/**
 * 源端已停更，但**历史数据真实有效**：从目录隐藏、停止抓取，观测一条不删。
 *
 * 与 RETIRED_INDICATOR_CODES 的区别是**只写 tombstone、不删任何东西**
 * （见 seed-retired-indicators.ts 的 hideSourceEndedInstruments）。tombstone 落在
 * `public.macro_catalog_excluded_key`，键 `mds:<code>`，同时起两个作用：
 *   1. `loadExcludedCatalogKeys()` 把它从宏观目录里滤掉；
 *   2. `runDataSubscription()` 开头的 `isCatalogKeyExcluded()` 让调度器直接跳过，
 *      不再每轮对一个 2022 年就停更的序列做无用请求。
 * 想恢复：删掉对应的 tombstone 行即可，数据一直在。
 *
 * 为什么不直接删：这些是经典的、仍有历史分析价值的序列。
 * - TEDRATE：TED Spread，8853 个观测、1986-01-02 → 2022-01-21，FRED 已标 DISCONTINUED。
 *   它本身**不在目录里**（sched_fred_* 被目录按前缀排除），所以此处的意义是止住每轮空抓。
 * - sched_wb_* 12 条：世行已下架的指标，共 272 个观测点、1990–2019，在目录
 *   `SRC_WORLDBANK/偿债能力` 下可见。
 */
export const SOURCE_ENDED_HIDDEN_CODES: readonly string[] = [
  // FRED 标注 DISCONTINUED；8853 个观测，1986-01-02 → 2022-01-21
  "sched_fred_TEDRATE",
  // 世行已下架但留有历史，合计 272 个观测、1990–2019
  "sched_wb_AU_FR_INR_RINR", // 30 个观测
  "sched_wb_FR_CM_MKT_LCAP_GD_ZS", // 29 个观测
  "sched_wb_IN_GC_DOD_TOTL_GD_ZS", // 29 个观测
  "sched_wb_CA_FR_INR_RINR", // 28 个观测
  "sched_wb_SA_FM_LBL_BMNY_GD_ZS", // 28 个观测
  "sched_wb_CH_FM_LBL_BMNY_GD_ZS", // 27 个观测
  "sched_wb_GB_FR_INR_RINR", // 25 个观测
  "sched_wb_JP_FR_INR_RINR", // 25 个观测
  "sched_wb_CA_FM_LBL_BMNY_GD_ZS", // 19 个观测
  "sched_wb_CA_FS_AST_DOMS_GD_ZS", // 17 个观测
  "sched_wb_ID_GC_DOD_TOTL_GD_ZS", // 14 个观测
  "sched_wb_DE_GC_DOD_TOTL_GD_ZS", // 1 个观测
  // 世行对这些国家只发布到 2021/2022（2026-07 世行更新后仍无新值），2026-09-21 核实
  "sched_wb_IN_FM_LBL_BMNY_GD_ZS", // 32 个观测，1990–2021
  "sched_wb_AU_GC_DOD_TOTL_GD_ZS", // 33 个观测，1990–2022
  "sched_wb_IN_FR_INR_RINR", // 33 个观测，1990–2022
  "sched_wb_GB_CM_MKT_LCAP_GD_ZS", // 27 个观测，1990–2022
  "sched_wb_CA_NV_IND_TOTL_ZS", // 26 个观测，1997–2022
  // 国家统计局 2024 年起改称「新建商品房销售…」，旧名称 8 条停在 2023-12（各 10 个观测）；
  // 新名称 8 条（2024-02 起）持续更新，前台只留新名称
  "nbs_cn_realestate_2cfe302f12bf136739", // 商品房销售面积：住宅同比增长
  "nbs_cn_realestate_3b744b20a3fe471257", // 商品房销售额同比增长
  "nbs_cn_realestate_564f77767bf15ef8f4", // 商品房销售额累计值
  "nbs_cn_realestate_65a3108d2d7d09617f", // 商品房销售额：住宅累计值
  "nbs_cn_realestate_7ad3dada50839fae51", // 商品房销售额：住宅同比增长
  "nbs_cn_realestate_7f47f35f551ca4f008", // 商品房销售面积累计值
  "nbs_cn_realestate_d24a466b3345ff3af4", // 商品房销售面积：住宅累计值
  "nbs_cn_realestate_f60baac774a3ae2174", // 商品房销售面积同比增长
  // 国家统计局 2019 年起不再按集体/合作企业分组发布工业增加值，停在 2018-12
  "nbs_cn_industrial_collective_cyoy",
  "nbs_cn_industrial_collective_yoy",
  "nbs_cn_industrial_cooperative_cyoy",
  "nbs_cn_industrial_cooperative_yoy",
];

type Resolved =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "key"; key: string; calc: MacroSeriesCalcConfig }
  | { kind: "derived"; calcKey: string; def: RetiredDerived };

const RESOLVED_BY_KEY = new Map<string, Resolved>(
  Object.entries({ ...RETIRED_INDICATOR_REPLACEMENTS, ...SUPERSEDED_KEEP_HISTORY_REPLACEMENTS }).map(
    ([code, repl]): [string, Resolved] => {
      const key = `mds:${code}`;
      if (!repl) return [key, { kind: "remove" }];
      if ("derived" in repl) return [key, { kind: "derived", calcKey: `calc:${repl.derived.id}`, def: repl.derived }];
      return [key, { kind: "key", key: repl.key, calc: repl.calc }];
    },
  ),
);

function resolve(key: string): Resolved {
  return RESOLVED_BY_KEY.get(key) ?? { kind: "keep" };
}

/** 旧键在「显示位」上的新键（已选列表/图位/样式）：键替换→新键，指标运算→calc 键，删除→null */
function displayKey(key: string): string | null {
  const r = resolve(key);
  if (r.kind === "keep") return key;
  if (r.kind === "remove") return null;
  return r.kind === "key" ? r.key : r.calcKey;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function remapDisplayList(list: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of list) {
    if (typeof item !== "string") {
      out.push(item);
      continue;
    }
    const k = displayKey(item);
    if (k === null || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function remapRecord(record: JsonObject, opts?: { keepDrawnSlot?: boolean }): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    const k = displayKey(key);
    if (k === null) continue;
    // 新键已有自己的配置时不被旧键覆盖
    if (k !== key && Object.prototype.hasOwnProperty.call(record, k)) continue;
    out[k] = value;
  }
  if (!opts?.keepDrawnSlot) return out;
  // 图位例外：新键已选但未画（null）、旧键画在某个图位时沿用旧图位，
  // 否则替换后那条线就从图上消失了
  for (const [key, value] of Object.entries(record)) {
    const k = displayKey(key);
    if (k === null || k === key || value == null) continue;
    if (out[k] == null) out[k] = value;
  }
  return out;
}

/**
 * 把模板/工作区 JSON 中的退役键替换为标准指标或指标运算（幂等）。
 * 覆盖 selectedKeys、selectedListItems、slotAssignment、seriesVisualMap、seriesCalcConfigMap、
 * indicatorIntroNotes、displayConfig.slotSeriesOrder、derivedCalcs。
 */
export function rewriteRetiredKeys(input: JsonObject): { value: JsonObject; changed: boolean } {
  const before = JSON.stringify(input);
  const hits = [...RESOLVED_BY_KEY.keys()].filter((key) => before.includes(`"${key}`));
  if (hits.length === 0) return { value: input, changed: false };

  const out = JSON.parse(before) as JsonObject;
  const newDerived: RetiredDerived[] = [];
  const keyCalcs = new Map<string, MacroSeriesCalcConfig>();
  for (const oldKey of hits) {
    const r = resolve(oldKey);
    if (r.kind === "derived") newDerived.push(r.def);
    if (r.kind === "key") keyCalcs.set(r.key, r.calc);
  }

  // 已选指标：calc 键不进 selectedKeys；指标运算的输入基础序列补入（不分配图位即不绘制）
  if (Array.isArray(out.selectedKeys)) {
    const remapped = out.selectedKeys.flatMap((item) => {
      if (typeof item !== "string") return [item];
      const r = resolve(item);
      if (r.kind === "remove") return [];
      if (r.kind === "key") return [r.key];
      if (r.kind === "derived") return [];
      return [item];
    });
    const set = new Set(remapped.filter((k): k is string => typeof k === "string"));
    for (const d of newDerived) {
      for (const input of [d.leftKey, d.rightKey]) {
        if (!input.startsWith("calc:") && !set.has(input)) {
          remapped.push(input);
          set.add(input);
        }
      }
    }
    out.selectedKeys = [...new Set(remapped)];
  }

  if (Array.isArray(out.selectedListItems)) {
    const seen = new Set<string>();
    out.selectedListItems = out.selectedListItems.flatMap((item) => {
      if (!isObject(item) || typeof item.key !== "string") return [item];
      const r = resolve(item.key);
      if (r.kind === "remove") return [];
      const next =
        r.kind === "derived"
          ? { type: "derived", key: r.calcKey }
          : r.kind === "key"
            ? { ...item, key: r.key }
            : item;
      const k = String(next.key);
      if (seen.has(k)) return [];
      seen.add(k);
      return [next];
    });
  }

  for (const field of ["slotAssignment", "seriesVisualMap", "seriesCalcConfigMap", "indicatorIntroNotes"]) {
    if (isObject(out[field])) {
      out[field] = remapRecord(out[field] as JsonObject, { keepDrawnSlot: field === "slotAssignment" });
    }
  }

  if (isObject(out.displayConfig) && isObject(out.displayConfig.slotSeriesOrder)) {
    const order = out.displayConfig.slotSeriesOrder as JsonObject;
    const next: JsonObject = {};
    for (const [slot, keys] of Object.entries(order)) {
      next[slot] = Array.isArray(keys) ? remapDisplayList(keys) : keys;
    }
    out.displayConfig = { ...out.displayConfig, slotSeriesOrder: next };
  }

  // 既有指标运算引用退役键：改指向替代键 / 新 calc；被删除则连带删除该运算
  const existingCalcs = Array.isArray(out.derivedCalcs) ? out.derivedCalcs : [];
  const rewrittenCalcs = existingCalcs.flatMap((calc) => {
    if (!isObject(calc)) return [calc];
    const left = typeof calc.leftKey === "string" ? displayKey(calc.leftKey) : calc.leftKey;
    const right = typeof calc.rightKey === "string" ? displayKey(calc.rightKey) : calc.rightKey;
    if (left === null || right === null) return [];
    return [{ ...calc, leftKey: left, rightKey: right }];
  });
  const existingIds = new Set(rewrittenCalcs.filter(isObject).map((c) => String(c.id)));
  // 新运算放在前面，保证后续引用它的运算能取到结果
  const prepended = newDerived.filter((d) => !existingIds.has(d.id)).map((d) => ({ ...d }));
  if (prepended.length > 0 || existingCalcs.length > 0) out.derivedCalcs = [...prepended, ...rewrittenCalcs];

  if (keyCalcs.size > 0) {
    const calcMap = isObject(out.seriesCalcConfigMap) ? { ...(out.seriesCalcConfigMap as JsonObject) } : {};
    for (const [key, calc] of keyCalcs) calcMap[key] = calc;
    out.seriesCalcConfigMap = calcMap;
  }
  // 指标运算默认画在旧键所在图位；旧键未分配图位时保持不绘制
  if (isObject(out.slotAssignment)) {
    const slots = out.slotAssignment as JsonObject;
    for (const d of newDerived) {
      if (!Object.prototype.hasOwnProperty.call(slots, `calc:${d.id}`)) slots[`calc:${d.id}`] = null;
    }
  }

  return { value: out, changed: JSON.stringify(out) !== before };
}
