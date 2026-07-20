/**
 * 美国宏观指标目录 — 权威分类（大类 + 子类）
 * 用于 fredCatalog、MDS metadata、MacroCatalogLayout 重建。
 */
export const US_CATALOG_TOP_LEVEL = [
  "国民经济",
  "通胀与价格",
  "劳动力市场",
  "货币政策与流动性",
  "利率与信用市场",
  "金融条件与银行",
  "财政与公共债务",
  "地产与建筑",
  "对外与汇率",
] as const;

export type UsCatalogTopLevel = (typeof US_CATALOG_TOP_LEVEL)[number];

export type UsCatalogPlacement = {
  category: UsCatalogTopLevel | "未分配";
  subgroup: string | null;
};

/** 各大类下的子类顺序（布局重建用） */
export const US_CATALOG_SUBGROUPS: Record<UsCatalogTopLevel, readonly string[]> = {
  国民经济: ["核算", "工业", "消费与国内需求", "景气综合"],
  通胀与价格: ["CPI", "PCE与PPI", "通胀预期与能源"],
  劳动力市场: ["失业率与参与", "就业与工资", "JOLTS", "周度申领", "就业结构"],
  货币政策与流动性: ["政策利率", "联储资产负债表", "财政部账户与货币市场"],
  利率与信用市场: ["国债收益率", "利差与期限结构", "TIPS", "信用利差", "市场情绪"],
  金融条件与银行: ["金融条件指数", "银行信贷", "资产质量"],
  财政与公共债务: [
    "MTS现金流量",
    "融资与现金",
    "债务存量",
    "可持续性比率",
    "结构占比",
    "政府支出核算",
  ],
  地产与建筑: ["开工与销售", "抵押利率", "房价与可负担性", "住房拖欠"],
  对外与汇率: ["贸易", "汇率", "商品期货持仓"],
};

const FRED_CPI = new Set(
  [
    "CPIAUCSL",
    "CPILFESL",
    "CPIENGSL",
    "CPIFABSL",
    "CUSR0000SAH1",
    "CUSR0000SEHA",
    "CUSR0000SEHC",
    "CUSR0000SACL1E",
    "CUSR0000SASLE",
    "CUSR0000SETA01",
    "CUSR0000SETA02",
    "CPIMEDSL",
  ].map((x) => x.toUpperCase()),
);

const FRED_PCE_PPI = new Set(["PCEPI", "PCEPILFE", "PPIFIS"]);
const FRED_INFLATION_EXPECT_ENERGY = new Set(["T5YIE", "T10YIE", "DCOILWTICO"]);

const FRED_NATIONAL_ACCOUNTS = new Set([
  "GDPC1",
  "GDP",
  "A191RL1Q225SBEA",
  "PNFIC1",
  "PRFIC1",
]);
const FRED_INDUSTRIAL = new Set([
  "INDPRO",
  "IPMAN",
  "DGORDER",
  "ADXTNO",
  "NEWORDER",
  "AMDMUO",
  "AMTMTI",
  "MCUMFN",
]);
const FRED_CONSUMPTION = new Set(["RSAFS", "PCEC96", "BUSINV", "ISRATIO", "MNFCTRIRSA"]);
const FRED_SENTIMENT = new Set(["UMCSENT", "CFNAI", "USREC"]);

const FRED_LABOR_UNEMP = new Set([
  "UNRATE",
  "U6RATE",
  "CIVPART",
  "LNS11300060",
  "EMRATIO",
  "UNEMPLOY",
  "UEMPMEAN",
]);
const FRED_LABOR_PAYROLL = new Set([
  "PAYEMS",
  "CES0500000003",
  "AHETPI",
  "AWHNONAG",
]);
const FRED_LABOR_JOLTS = new Set(["JTSJOR", "JTSQUR", "JTSHIR", "JTSJOL"]);
const FRED_LABOR_CLAIMS = new Set(["ICSA", "CCSA"]);
const FRED_LABOR_STRUCTURE = new Set(["USPRIV", "USGOVT", "MANEMP"]);

const FRED_POLICY_RATES = new Set([
  "EFFR",
  "FEDFUNDS",
  "DFEDTARU",
  "SOFR",
  "IORB",
  "RRPONTSYAWARD",
]);
const FRED_FED_BS = new Set(["WALCL", "WRESBAL", "TREAST", "WLRRAL", "M2SL"]);
const FRED_MONEY_MARKET = new Set(["WTREGEN", "RRPONTSYD"]);

const FRED_TREASURY_YIELDS = new Set(["GS2", "GS10", "DGS2", "DGS10"]);
const FRED_SPREADS = new Set(["T10Y2Y", "T10Y3M"]);
const FRED_TIPS = new Set(["DFII10"]);
const FRED_CREDIT_SPREADS = new Set(["BAMLH0A0HYM2", "BAMLC0A0CM"]);
const FRED_MARKET_SENTIMENT = new Set(["VIXCLS"]);

const FRED_FINANCIAL_CONDITIONS = new Set(["NFCI"]);
const FRED_BANK_CREDIT = new Set(["BUSLOANS", "DRTSCILM"]);
const FRED_ASSET_QUALITY = new Set(["DRCCLACBS", "DRBLACBS"]);

const FRED_FISCAL_MTS_PROXY = new Set(["FYFSGDA188S"]);
const FRED_DEBT_STOCK = new Set(["GFDEBTN", "FYGFDPUN", "GFDEGDQ188S"]);
const FRED_FISCAL_RATIOS = new Set([
  "GFDGDPA188S",
  "FYGFGDQ188S",
  "FYFRGDA188S",
  "FYONGDA188S",
  "FYOIGDA188S",
]);
const FRED_GOV_SPENDING = new Set(["GCEC1", "FGCEC1", "A091RC1Q027SBEA"]);

const FRED_HOUSING_SUPPLY = new Set([
  "HOUST",
  "PERMIT",
  "HOUST1F",
  "COMPUTSA",
  "HSN1F",
  "MSACSR",
  "EXHOSLUSM495S",
]);
const FRED_HOUSING_MORTGAGE = new Set(["MORTGAGE30US", "MORTGAGE15US"]);
const FRED_HOUSING_PRICE = new Set(["CSUSHPINSA", "RHORUSQ156N"]);

const FRED_TRADE = new Set([
  "EXPGSC1",
  "IMPGSC1",
  "BOPGSTB",
  "BOPTEXP",
  "BOPTIMP",
  "IEABC",
  "IIPUSNETIQ",
  "IQ",
  "IR",
  "W369RG3Q066SBEA",
]);
const FRED_FX = new Set([
  "DTWEXBGS",
  "DTWEXAFEGS",
  "DTWEXEMEGS",
  "DEXUSEU",
  "DEXJPUS",
]);

function p(category: UsCatalogTopLevel, subgroup: string | null): UsCatalogPlacement {
  return { category, subgroup };
}

export function fredIdFromCatalogKey(key: string): string | null {
  if (key.startsWith("fred:")) {
    const id = key.slice(5).split("::")[0]?.trim().toUpperCase();
    return id || null;
  }
  if (key.startsWith("mds:sched_fred_")) {
    return key.slice("mds:sched_fred_".length).toUpperCase();
  }
  return null;
}

export function mdsCodeFromCatalogKey(key: string): string | null {
  if (!key.startsWith("mds:")) return null;
  return key.slice(4);
}

function placementFromFredId(fredId: string): UsCatalogPlacement | null {
  const id = fredId.toUpperCase();
  if (FRED_CPI.has(id)) return p("通胀与价格", "CPI");
  if (id.startsWith("CUSR0000") || id.startsWith("CPIL")) return p("通胀与价格", "CPI");
  if (FRED_PCE_PPI.has(id)) return p("通胀与价格", "PCE与PPI");
  if (FRED_INFLATION_EXPECT_ENERGY.has(id)) return p("通胀与价格", "通胀预期与能源");
  if (FRED_NATIONAL_ACCOUNTS.has(id)) return p("国民经济", "核算");
  if (FRED_INDUSTRIAL.has(id)) return p("国民经济", "工业");
  if (FRED_CONSUMPTION.has(id)) return p("国民经济", "消费与国内需求");
  if (FRED_SENTIMENT.has(id)) return p("国民经济", "景气综合");
  if (FRED_LABOR_UNEMP.has(id)) return p("劳动力市场", "失业率与参与");
  if (FRED_LABOR_PAYROLL.has(id)) return p("劳动力市场", "就业与工资");
  if (FRED_LABOR_JOLTS.has(id)) return p("劳动力市场", "JOLTS");
  if (FRED_LABOR_CLAIMS.has(id)) return p("劳动力市场", "周度申领");
  if (FRED_LABOR_STRUCTURE.has(id)) return p("劳动力市场", "就业结构");
  if (FRED_POLICY_RATES.has(id)) return p("货币政策与流动性", "政策利率");
  if (FRED_FED_BS.has(id)) return p("货币政策与流动性", "联储资产负债表");
  if (FRED_MONEY_MARKET.has(id)) return p("货币政策与流动性", "财政部账户与货币市场");
  if (FRED_TREASURY_YIELDS.has(id)) return p("利率与信用市场", "国债收益率");
  if (FRED_SPREADS.has(id)) return p("利率与信用市场", "利差与期限结构");
  if (FRED_TIPS.has(id)) return p("利率与信用市场", "TIPS");
  if (FRED_CREDIT_SPREADS.has(id)) return p("利率与信用市场", "信用利差");
  if (FRED_MARKET_SENTIMENT.has(id)) return p("利率与信用市场", "市场情绪");
  if (FRED_FINANCIAL_CONDITIONS.has(id)) return p("金融条件与银行", "金融条件指数");
  if (FRED_BANK_CREDIT.has(id)) return p("金融条件与银行", "银行信贷");
  if (FRED_ASSET_QUALITY.has(id)) return p("金融条件与银行", "资产质量");
  if (FRED_FISCAL_MTS_PROXY.has(id)) return p("财政与公共债务", "可持续性比率");
  if (FRED_DEBT_STOCK.has(id)) return p("财政与公共债务", "债务存量");
  if (FRED_FISCAL_RATIOS.has(id)) return p("财政与公共债务", "可持续性比率");
  if (FRED_GOV_SPENDING.has(id)) return p("财政与公共债务", "政府支出核算");
  if (id === "FGRECPT" || id === "FGEXPND") return p("财政与公共债务", "政府支出核算");
  if (id === "GPDIC1") return p("国民经济", "核算");
  if (FRED_HOUSING_SUPPLY.has(id)) return p("地产与建筑", "开工与销售");
  if (FRED_HOUSING_MORTGAGE.has(id)) return p("地产与建筑", "抵押利率");
  if (FRED_HOUSING_PRICE.has(id)) return p("地产与建筑", "房价与可负担性");
  if (id === "DRSFRMACBS") return p("地产与建筑", "住房拖欠");
  if (FRED_TRADE.has(id)) return p("对外与汇率", "贸易");
  if (FRED_FX.has(id)) return p("对外与汇率", "汇率");
  return null;
}

function placementFromMdsCode(code: string): UsCatalogPlacement | null {
  if (code.startsWith("treasury_mts_")) return p("财政与公共债务", "MTS现金流量");
  if (code.startsWith("treasury_dts_") || code.startsWith("treasury_debt_")) {
    return p("财政与公共债务", "融资与现金");
  }
  if (code.startsWith("fiscal_")) {
    if (
      code.includes("share") ||
      code === "fiscal_primary_deficit_gdp" ||
      code.endsWith("_yoy")
    ) {
      return p("财政与公共债务", "结构占比");
    }
    return p("财政与公共债务", "可持续性比率");
  }
  if (code.startsWith("ism_") || code.startsWith("ism_svc_")) {
    return p("国民经济", "景气综合");
  }
  if (code.startsWith("goldov_")) {
    return p("利率与信用市场", "市场情绪");
  }
  if (code.startsWith("cot_mm_")) {
    return p("对外与汇率", "商品期货持仓");
  }
  if (code.startsWith("usov_")) {
    return p("利率与信用市场", "市场情绪");
  }
  if (code.startsWith("debtcap_")) {
    return p("财政与公共债务", "债务存量");
  }
  if (code.includes("recession") || code.includes("nyfed")) {
    return p("国民经济", "景气综合");
  }
  return null;
}

const LEGACY_CATEGORY_MAP: Record<string, UsCatalogPlacement> = {
  国民经济核算: p("国民经济", "核算"),
  工业: p("国民经济", "工业"),
  国内贸易与消费: p("国民经济", "消费与国内需求"),
  景气调查: p("国民经济", "景气综合"),
  综合: p("国民经济", "景气综合"),
  价格指数: p("通胀与价格", "CPI"),
  "CPI 综合": p("通胀与价格", "CPI"),
  "CPI 住房": p("通胀与价格", "CPI"),
  "CPI 核心商品": p("通胀与价格", "CPI"),
  "CPI 核心服务": p("通胀与价格", "CPI"),
  "CPI 分项": p("通胀与价格", "CPI"),
  通胀驱动因子: p("通胀与价格", "PCE与PPI"),
  就业与工资: p("劳动力市场", "就业与工资"),
  劳动力流动: p("劳动力市场", "JOLTS"),
  就业结构: p("劳动力市场", "就业结构"),
  领先与深度: p("劳动力市场", "周度申领"),
  银行与货币: p("货币政策与流动性", "联储资产负债表"),
  利率与债券: p("利率与信用市场", "国债收益率"),
  流动性: p("货币政策与流动性", "联储资产负债表"),
  货币政策: p("货币政策与流动性", "政策利率"),
  金融条件: p("金融条件与银行", "金融条件指数"),
  财政: p("财政与公共债务", "可持续性比率"),
  固定资产与地产: p("地产与建筑", "开工与销售"),
  固定资产投资: p("国民经济", "核算"),
  对外贸易与汇率: p("对外与汇率", "汇率"),
  对外贸易及投资: p("对外与汇率", "贸易"),
  CFTC数据: p("对外与汇率", "商品期货持仓"),
  证券市场: p("利率与信用市场", "市场情绪"),
  采购经理人指数: p("国民经济", "景气综合"),
  偿债能力: p("财政与公共债务", "债务存量"),
};

export function resolveUsCatalogPlacement(input: {
  key: string;
  label?: string;
  legacyCategory?: string;
  fredId?: string | null;
}): UsCatalogPlacement {
  const fredId =
    input.fredId?.trim().toUpperCase() ??
    fredIdFromCatalogKey(input.key) ??
    undefined;
  if (fredId) {
    const hit = placementFromFredId(fredId);
    if (hit) return hit;
  }

  const mdsCode = mdsCodeFromCatalogKey(input.key);
  if (mdsCode) {
    const hit = placementFromMdsCode(mdsCode);
    if (hit) return hit;
  }

  const legacy = input.legacyCategory?.trim();
  if (legacy && LEGACY_CATEGORY_MAP[legacy]) {
    return LEGACY_CATEGORY_MAP[legacy];
  }

  return { category: "未分配", subgroup: null };
}

/** Instrument.metadata.catalogCategory — 仅顶层大类 */
export function usMetadataCatalogCategory(input: {
  code?: string;
  fredId?: string | null;
  key?: string;
  label?: string;
  legacyCategory?: string;
}): string {
  const key =
    input.key ??
    (input.code ? `mds:${input.code}` : input.fredId ? `fred:${input.fredId}` : "");
  return resolveUsCatalogPlacement({
    key,
    label: input.label,
    legacyCategory: input.legacyCategory,
    fredId: input.fredId,
  }).category;
}
