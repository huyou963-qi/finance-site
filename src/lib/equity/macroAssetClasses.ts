/**
 * 历史阶段复盘的「大类资产」研究口径。
 *
 * 为什么需要：30 个阶段原本只对比 SPY 与 11 个行业，读到的全部是**股票内部**的相对强弱。
 * 但阶段边界本身是宏观事件（NBER 拐点、FOMC 切换、信用事件），其一阶影响先落在利率、
 * 信用、实物与汇率上，再传导到行业。把大类资产放在 SPY 之上，阶段卡才同时回答
 * 「这段时间该不该拿股票」和「股票内部该拿谁」。
 *
 * 选择依据（实证见 docs/research/US_SECTOR_STAGE_ASSET_CLASSES.md）：跨 30 阶段与 SPY 的
 * 收益相关性把候选资产分成三簇——高度共线簇（小盘 1.00、发达/新兴股 0.99/0.98、REITs 0.97、
 * 高收益债 0.98）、对冲簇（中/长债 −0.70/−0.68、美元 −0.60、短债 −0.59）与近正交的黄金（+0.30，
 * 不显著）。本表只保留能给出**独立信息**的九条：与股票反向的久期与美元、拆出信用维度的
 * 投级/高收益利差、以及通胀与供给冲击维度的黄金/原油/商品/TIPS。纯粹的股票 beta 变体
 * （小盘、发达/新兴市场、REITs、铜、比特币）不入表，它们的信息已被 SPY 与 11 个行业覆盖。
 *
 * 代理口径：一律走既有的 `mds.equity_daily_bar` + Yahoo 回补（`equityPriceStore`），**不新增
 * adapter 或事实表**。债券与 TIPS 用 Vanguard 指数基金而非 iShares ETF，因为基金净值序列
 * 回溯到 1980–2000 年，能覆盖全部 30 个阶段；ETF（TLT/IEF/LQD/HYG/TIP）2002–2007 才上市，
 * 前 4–9 个阶段会整段缺失。基金与 ETF 的前复权净值都是含分红总收益口径，可直接比较。
 *
 * 三条只能从 2000 年代起步的代理（黄金、原油、TIPS）在更早阶段显示 `—`，不用别的品种拼接。
 */

export type MacroAssetGroupId = "rates" | "credit" | "real" | "currency";

export type MacroAssetGroupDef = {
  id: MacroAssetGroupId;
  nameZh: string;
};

export const MACRO_ASSET_GROUPS: readonly MacroAssetGroupDef[] = [
  { id: "rates", nameZh: "利率" },
  { id: "credit", nameZh: "信用" },
  { id: "real", nameZh: "实物" },
  { id: "currency", nameZh: "货币" },
];

export type MacroAssetClassDef = {
  id: string;
  nameZh: string;
  /** Yahoo 代码；与美股共用 equityPriceStore 的 db-first 日线 */
  symbol: string;
  group: MacroAssetGroupId;
  /** 代理说明（表头 tooltip 与文档用） */
  proxyZh: string;
  /** 该资产在阶段研究里回答什么问题 */
  readsZh: string;
};

/**
 * 表内固定顺序（利率 → 信用 → 实物 → 货币），**不按收益排序**：
 * 顺序稳定才能横跨 30 张阶段卡对比同一行。
 */
export const MACRO_ASSET_CLASSES: readonly MacroAssetClassDef[] = [
  {
    id: "long-treasury",
    nameZh: "长期美债",
    symbol: "VUSTX",
    group: "rates",
    proxyZh: "Vanguard 长期国债基金总收益（1986 起）",
    readsZh: "久期：增长与政策预期下行时的主要正收益来源",
  },
  {
    id: "short-treasury",
    nameZh: "短债/类现金",
    symbol: "VFISX",
    group: "rates",
    proxyZh: "Vanguard 短期国债基金总收益（1991 起）",
    readsZh: "无风险 carry：判断风险资产是否值得承担波动的基准线",
  },
  {
    id: "tips",
    nameZh: "通胀挂钩债",
    symbol: "VIPSX",
    group: "rates",
    proxyZh: "Vanguard TIPS 基金总收益（2000-06 起）",
    readsZh: "实际利率：与名义国债之差即市场定价的通胀补偿",
  },
  {
    id: "ig-credit",
    nameZh: "投资级信用债",
    symbol: "VWESX",
    group: "credit",
    proxyZh: "Vanguard 长期投资级债基金总收益（1980 起）",
    readsZh: "久期 + 信用：与长期美债之差即投资级利差方向",
  },
  {
    id: "hy-credit",
    nameZh: "高收益债",
    symbol: "VWEHX",
    group: "credit",
    proxyZh: "Vanguard 高收益公司债基金总收益（1980 起）",
    readsZh: "信用风险偏好：常在股票之前反映融资条件断裂",
  },
  {
    id: "gold",
    nameZh: "黄金",
    symbol: "GC=F",
    group: "real",
    proxyZh: "COMEX 黄金连续合约（2000-08 起）",
    readsZh: "实际利率与信用/货币尾部风险的对冲",
  },
  {
    id: "crude-oil",
    nameZh: "WTI 原油",
    symbol: "CL=F",
    group: "real",
    proxyZh: "NYMEX WTI 连续合约（2000-08 起）",
    readsZh: "供给冲击与终端需求：能源行业盈利的直接输入",
  },
  {
    id: "commodities",
    nameZh: "商品综合",
    symbol: "^SPGSCI",
    group: "real",
    proxyZh: "S&P GSCI 商品指数（1984 起）",
    readsZh: "通胀的商品侧总量读数，覆盖原油缺失的早期阶段",
  },
  {
    id: "dollar",
    nameZh: "美元指数",
    symbol: "DX-Y.NYB",
    group: "currency",
    proxyZh: "ICE 美元指数（1971 起，价格口径不含利差）",
    readsZh: "全球美元流动性：走强通常同时压制商品与非美资产",
  },
];

export const MACRO_ASSET_SYMBOLS: readonly string[] = MACRO_ASSET_CLASSES.map(
  (asset) => asset.symbol,
);

export function macroAssetGroupNameZh(group: MacroAssetGroupId): string {
  return MACRO_ASSET_GROUPS.find((item) => item.id === group)?.nameZh ?? group;
}

/** 表内该资产是否为所属分组的第一行（用于只在组首显示分组名） */
export function isMacroAssetGroupHead(index: number): boolean {
  if (index <= 0) return index === 0;
  return MACRO_ASSET_CLASSES[index]!.group !== MACRO_ASSET_CLASSES[index - 1]!.group;
}
