/**
 * 统一宏观指标目录：
 * - 顶层按国家组织（主要经济体）；
 * - 国家下按主题分类；
 * - 指标键采用 `provider:...` 形式，便于后续接入更多数据源。
 */
import { InstrumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildCotCatalogCountry } from "@/lib/data/cot/cotCatalog";
import {
  consolidatePriceIndexCpi,
  mergeCatalogGroups,
  presentUsCpiAsYoy,
} from "@/lib/data/catalogTree";
import {
  applyCatalogLayout,
  loadMacroCatalogLayout,
} from "@/lib/data/catalogLayout";
import { resolveUsCatalogPlacement } from "@/lib/data/usCatalogTaxonomy";
import {
  ONBOARDING_STATUS_COMPLETE,
  ONBOARDING_STATUS_PENDING,
  fredCatalogKey,
  readOnboardingStatus,
} from "@/lib/data/indicatorOnboarding";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type UnifiedCatalogFrequency = "日" | "周" | "月" | "季度" | "年";
export type UnifiedCatalogProvider = "fred" | "wb" | "mds";

export type UnifiedCatalogItem = {
  key: string;
  label: string;
  frequency: UnifiedCatalogFrequency;
  provider: UnifiedCatalogProvider;
  countryCode: string;
  categoryName: string;
};

export type UnifiedCatalogSubgroup = {
  name: string;
  items: UnifiedCatalogItem[];
};

export type UnifiedCatalogGroup = {
  name: string;
  items: UnifiedCatalogItem[];
  /** 分类下子层，如 价格指数 → CPI */
  subgroups?: UnifiedCatalogSubgroup[];
};

export type UnifiedCatalogCountry = {
  code: string;
  name: string;
  categories: UnifiedCatalogGroup[];
};

type CountryDef = { code: string; name: string };

export const MACRO_MAJOR_COUNTRIES: readonly CountryDef[] = [
  { code: "US", name: "美国" },
  { code: "CN", name: "中国" },
  { code: "JP", name: "日本" },
  { code: "DE", name: "德国" },
  { code: "GB", name: "英国" },
  { code: "CH", name: "瑞士" },
  { code: "FR", name: "法国" },
  { code: "IN", name: "印度" },
  { code: "BR", name: "巴西" },
  { code: "KR", name: "韩国" },
  { code: "CA", name: "加拿大" },
  { code: "AU", name: "澳大利亚" },
  { code: "MX", name: "墨西哥" },
  { code: "ID", name: "印度尼西亚" },
  { code: "SA", name: "沙特阿拉伯" },
  { code: "ZA", name: "南非" },
] as const;

const COUNTRY_NAME_BY_CODE = new Map(MACRO_MAJOR_COUNTRIES.map((x) => [x.code, x.name]));

type FredDef = {
  id: string;
  label: string;
  category: string;
  frequency: UnifiedCatalogFrequency;
};

const FRED_US_ITEMS: readonly FredDef[] = [
  { id: "GDPC1", label: "实际 GDP（季调，十亿美元）", category: "国民经济核算", frequency: "季度" },
  { id: "GDP", label: "名义 GDP（季调，十亿美元）", category: "国民经济核算", frequency: "季度" },
  { id: "A191RL1Q225SBEA", label: "实际 GDP 环比年化（%）", category: "国民经济核算", frequency: "季度" },
  { id: "FINSLC1", label: "实际最终销售（十亿美元）", category: "国民经济核算", frequency: "季度" },
  { id: "RECPROUSM156N", label: "平滑衰退概率（Chauvet-Piger）", category: "领先与深度", frequency: "月" },
  { id: "SAHMREALTIME", label: "Sahm 规则实时值（pp）", category: "领先与深度", frequency: "月" },
  { id: "W875RX1", label: "实际个人收入(除转移支付,十亿美元)", category: "国内贸易与消费", frequency: "月" },
  { id: "CMRMTSPL", label: "实际制造与贸易销售（百万美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "DSPIC96", label: "实际可支配个人收入（十亿美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "INDPRO", label: "工业生产指数（2017=100）", category: "工业", frequency: "月" },
  { id: "IPMAN", label: "工业生产·制造业（NAICS）", category: "工业", frequency: "月" },
  { id: "DGORDER", label: "耐用品新订单（百万美元）", category: "工业", frequency: "月" },
  { id: "ADXTNO", label: "耐用品(除运输)新订单（百万美元）", category: "工业", frequency: "月" },
  { id: "NEWORDER", label: "非国防资本品(除飞机)新订单（百万美元）", category: "工业", frequency: "月" },
  { id: "AMDMUO", label: "耐用品未完成订单（百万美元）", category: "工业", frequency: "月" },
  { id: "AMTMTI", label: "制造业库存（百万美元）", category: "工业", frequency: "月" },
  { id: "MCUMFN", label: "制造业产能利用率（%）", category: "工业", frequency: "月" },
  { id: "BUSINV", label: "总商业库存（百万美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "ISRATIO", label: "总业务库销比", category: "国内贸易与消费", frequency: "月" },
  { id: "MNFCTRIRSA", label: "制造业库销比", category: "国内贸易与消费", frequency: "月" },
  { id: "CPIAUCSL", label: "CPI（全部城市消费者）", category: "CPI 综合", frequency: "月" },
  { id: "CPILFESL", label: "核心 CPI（剔除食物与能源）", category: "CPI 综合", frequency: "月" },
  { id: "CPIENGSL", label: "CPI 能源", category: "CPI 综合", frequency: "月" },
  { id: "CPIFABSL", label: "CPI 食品与饮料", category: "CPI 综合", frequency: "月" },
  { id: "CUSR0000SAH1", label: "CPI 住房（Shelter）", category: "CPI 住房", frequency: "月" },
  { id: "CUSR0000SEHA", label: "CPI 主要住所租金", category: "CPI 住房", frequency: "月" },
  { id: "CUSR0000SEHC", label: "CPI 业主等价租金（OER）", category: "CPI 住房", frequency: "月" },
  { id: "CUSR0000SACL1E", label: "CPI 核心商品（除食品能源）", category: "CPI 核心商品", frequency: "月" },
  { id: "CUSR0000SASLE", label: "CPI 核心服务（除能源服务）", category: "CPI 核心服务", frequency: "月" },
  { id: "CUSR0000SETA02", label: "CPI 二手车与卡车", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SETA01", label: "CPI 新车", category: "CPI 分项", frequency: "月" },
  { id: "CPIMEDSL", label: "CPI 医疗（聚合）", category: "CPI 分项", frequency: "月" },
  { id: "CPIUFDSL", label: "CPI 食品", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SAF11", label: "CPI 家庭食品", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SEFV", label: "CPI 外出就餐", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SACE", label: "CPI 能源商品", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SETB01", label: "CPI 汽油（全部类型）", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SEHE", label: "CPI 燃油及其他燃料", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SEHF", label: "CPI 能源服务", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SEHF01", label: "CPI 电力", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SEHF02", label: "CPI 管道燃气服务", category: "CPI 分项", frequency: "月" },
  { id: "CPIAPPSL", label: "CPI 服装", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SAM1", label: "CPI 医疗护理商品", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SAS4", label: "CPI 交通运输服务", category: "CPI 分项", frequency: "月" },
  { id: "CUSR0000SAM2", label: "CPI 医疗护理服务", category: "CPI 分项", frequency: "月" },
  { id: "PCEPI", label: "PCE 价格指数", category: "通胀驱动因子", frequency: "月" },
  { id: "PCEPILFE", label: "核心 PCE", category: "通胀驱动因子", frequency: "月" },
  { id: "PPIFIS", label: "PPI 最终需求", category: "通胀驱动因子", frequency: "月" },
  { id: "CES0500000003", label: "平均时薪（全体私营）", category: "就业与工资", frequency: "月" },
  { id: "T5YIE", label: "5Y 盈亏平衡通胀", category: "通胀驱动因子", frequency: "日" },
  { id: "T10YIE", label: "10Y 盈亏平衡通胀", category: "通胀驱动因子", frequency: "日" },
  { id: "DCOILWTICO", label: "WTI 原油现货", category: "通胀驱动因子", frequency: "日" },
  { id: "UNRATE", label: "失业率（U-3，季调）", category: "就业与工资", frequency: "月" },
  { id: "PAYEMS", label: "非农就业人数（千人）", category: "就业与工资", frequency: "月" },
  { id: "U6RATE", label: "U-6 广义失业率", category: "就业与工资", frequency: "月" },
  { id: "CIVPART", label: "劳动参与率", category: "就业与工资", frequency: "月" },
  { id: "LNS11300060", label: "25–54 岁劳动参与率", category: "就业与工资", frequency: "月" },
  { id: "AHETPI", label: "生产与非监督岗位平均时薪", category: "就业与工资", frequency: "月" },
  { id: "EMRATIO", label: "就业人口比", category: "就业与工资", frequency: "月" },
  { id: "UNEMPLOY", label: "失业人数（千人）", category: "就业与工资", frequency: "月" },
  { id: "UEMPMEAN", label: "平均失业周数", category: "领先与深度", frequency: "月" },
  { id: "AWHNONAG", label: "平均周工时（生产与非监督）", category: "就业与工资", frequency: "月" },
  { id: "JTSJOR", label: "岗位空缺率（非农）", category: "劳动力流动", frequency: "月" },
  { id: "JTSQUR", label: "离职率（非农）", category: "劳动力流动", frequency: "月" },
  { id: "JTSHIR", label: "雇佣率（非农）", category: "劳动力流动", frequency: "月" },
  { id: "JTSJOL", label: "岗位空缺人数（非农，千人）", category: "劳动力流动", frequency: "月" },
  { id: "ICSA", label: "初请失业金人数", category: "领先与深度", frequency: "周" },
  { id: "CCSA", label: "续请失业金人数", category: "领先与深度", frequency: "周" },
  { id: "USPRIV", label: "私营部门非农就业（千人）", category: "就业结构", frequency: "月" },
  { id: "USGOVT", label: "政府部门就业（千人）", category: "就业结构", frequency: "月" },
  { id: "MANEMP", label: "制造业就业（千人）", category: "就业结构", frequency: "月" },
  { id: "FEDFUNDS", label: "联邦基金有效利率（%）", category: "银行与货币", frequency: "月" },
  { id: "DFEDTARU", label: "联邦基金目标利率上限（%）", category: "银行与货币", frequency: "日" },
  { id: "M2SL", label: "M2 货币供应量（十亿美元）", category: "银行与货币", frequency: "月" },
  { id: "WALCL", label: "美联储总资产（百万美元）", category: "银行与货币", frequency: "周" },
  { id: "WRESBAL", label: "准备金余额（百万美元）", category: "银行与货币", frequency: "周" },
  { id: "TREAST", label: "持有国债（证券持有，百万美元）", category: "银行与货币", frequency: "周" },
  { id: "WLRRAL", label: "逆回购协议余额（百万美元）", category: "银行与货币", frequency: "周" },
  { id: "WTREGEN", label: "美国财政部一般账户 TGA（百万美元）", category: "银行与货币", frequency: "周" },
  { id: "SOFR", label: "担保隔夜融资利率 SOFR（%）", category: "利率与债券", frequency: "日" },
  { id: "IORB", label: "准备金利率 IORB（%）", category: "银行与货币", frequency: "日" },
  { id: "RRPONTSYAWARD", label: "ON RRP 利率（%）", category: "银行与货币", frequency: "日" },
  { id: "GS10", label: "10 年期美债收益率（%）", category: "利率与债券", frequency: "月" },
  { id: "GS2", label: "2 年期美债收益率（%）", category: "利率与债券", frequency: "月" },
  { id: "T10Y2Y", label: "10Y-2Y 国债期限利差（%）", category: "利率与债券", frequency: "日" },
  { id: "BAMLH0A0HYM2", label: "美国高收益债 OAS（%）", category: "利率与债券", frequency: "日" },
  { id: "DGS2", label: "2Y 国债收益率（日，%）", category: "利率与债券", frequency: "日" },
  { id: "DGS10", label: "10Y 国债收益率（日，%）", category: "利率与债券", frequency: "日" },
  { id: "DFII10", label: "10Y TIPS 实际收益率（%）", category: "利率与债券", frequency: "日" },
  { id: "T10Y3M", label: "10Y-3M 国债利差（%）", category: "利率与债券", frequency: "日" },
  { id: "BAMLC0A0CM", label: "投资级公司债 OAS（%）", category: "利率与债券", frequency: "日" },
  { id: "EFFR", label: "有效联邦基金利率（%）", category: "银行与货币", frequency: "日" },
  { id: "RRPONTSYD", label: "ON RRP 隔夜逆回购余额（十亿美元）", category: "银行与货币", frequency: "日" },
  { id: "NFCI", label: "Chicago Fed 全国金融条件指数", category: "银行与货币", frequency: "周" },
  { id: "DRTSCILM", label: "SLOOS 工商贷款收紧净比例（大中企业，%）", category: "银行与货币", frequency: "季度" },
  { id: "BUSLOANS", label: "工商业贷款存量（十亿美元）", category: "银行与货币", frequency: "月" },
  { id: "DRCCLACBS", label: "信用卡拖欠率（%）", category: "银行与货币", frequency: "季度" },
  { id: "DRBLACBS", label: "工商业贷款拖欠率（%）", category: "银行与货币", frequency: "季度" },
  { id: "DTWEXBGS", label: "美元名义广义指数", category: "对外贸易与汇率", frequency: "日" },
  { id: "DTWEXAFEGS", label: "AFE 美元指数", category: "对外贸易与汇率", frequency: "日" },
  { id: "DTWEXEMEGS", label: "EME 美元指数", category: "对外贸易与汇率", frequency: "日" },
  { id: "DEXUSEU", label: "美元/欧元汇率", category: "对外贸易与汇率", frequency: "日" },
  { id: "DEXJPUS", label: "日元/美元汇率", category: "对外贸易与汇率", frequency: "日" },
  { id: "BOPGSTB", label: "商品与服务贸易差额（百万美元）", category: "对外贸易与汇率", frequency: "月" },
  { id: "BOPTEXP", label: "出口（BOP，百万美元）", category: "对外贸易与汇率", frequency: "月" },
  { id: "BOPTIMP", label: "进口（BOP，百万美元）", category: "对外贸易与汇率", frequency: "月" },
  { id: "IEABC", label: "经常账户余额（百万美元）", category: "对外贸易与汇率", frequency: "季度" },
  { id: "IIPUSNETIQ", label: "净国际投资头寸（百万美元）", category: "对外贸易与汇率", frequency: "季度" },
  { id: "IQ", label: "出口价格指数", category: "对外贸易与汇率", frequency: "月" },
  { id: "IR", label: "进口价格指数", category: "对外贸易与汇率", frequency: "月" },
  { id: "W369RG3Q066SBEA", label: "贸易条件指数", category: "对外贸易与汇率", frequency: "季度" },
  { id: "RSAFS", label: "零售销售总额（百万美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "RSXFS", label: "零售销售（零售贸易，百万美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "PCEC96", label: "实际个人消费支出（十亿美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "PCEDGC96", label: "实际 PCE 耐用品（十亿美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "PCESC96", label: "实际 PCE 服务（十亿美元）", category: "国内贸易与消费", frequency: "月" },
  { id: "PSAVERT", label: "个人储蓄率（%）", category: "国内贸易与消费", frequency: "月" },
  { id: "TOTALSL", label: "总消费信贷（百万美元）", category: "银行与货币", frequency: "月" },
  { id: "REVOLSL", label: "循环消费信贷（百万美元）", category: "银行与货币", frequency: "月" },
  { id: "TNWBSHNO", label: "家庭净财富（百万美元）", category: "银行与货币", frequency: "季度" },
  { id: "TDSP", label: "家庭偿债比率（%）", category: "银行与货币", frequency: "季度" },
  { id: "CORCCACBS", label: "信用卡贷款核销率（%）", category: "银行与货币", frequency: "季度" },
  { id: "HOUST", label: "新屋开工（年化套数）", category: "固定资产与地产", frequency: "月" },
  { id: "PERMIT", label: "建筑许可（千套，SAAR）", category: "固定资产与地产", frequency: "月" },
  { id: "HOUST1F", label: "单户新屋开工（千套，SAAR）", category: "固定资产与地产", frequency: "月" },
  { id: "COMPUTSA", label: "住房完工（千套，SAAR）", category: "固定资产与地产", frequency: "月" },
  { id: "HSN1F", label: "新屋销售（千套，SAAR）", category: "固定资产与地产", frequency: "月" },
  { id: "MSACSR", label: "新屋可售月数", category: "固定资产与地产", frequency: "月" },
  { id: "EXHOSLUSM495S", label: "成屋销售（套，SAAR）", category: "固定资产与地产", frequency: "月" },
  { id: "MORTGAGE30US", label: "30Y 抵押利率（%）", category: "固定资产与地产", frequency: "周" },
  { id: "MORTGAGE15US", label: "15Y 抵押利率（%）", category: "固定资产与地产", frequency: "周" },
  { id: "RHORUSQ156N", label: "自有住房率（%）", category: "固定资产与地产", frequency: "季度" },
  { id: "DRSFRMACBS", label: "单户住宅抵押贷款拖欠率（%）", category: "固定资产与地产", frequency: "季度" },
  { id: "PNFIC1", label: "实际私人固定投资（十亿美元）", category: "固定资产投资", frequency: "季度" },
  { id: "PRFIC1", label: "实际住宅固定投资（十亿美元）", category: "固定资产投资", frequency: "季度" },
  { id: "EXPGSC1", label: "实际出口（十亿美元）", category: "对外贸易及投资", frequency: "季度" },
  { id: "IMPGSC1", label: "实际进口（十亿美元）", category: "对外贸易及投资", frequency: "季度" },
  { id: "GCEC1", label: "实际政府消费支出（十亿美元）", category: "财政", frequency: "季度" },
  { id: "FYFSGDA188S", label: "联邦赤字/GDP（%）", category: "财政", frequency: "季度" },
  { id: "GFDEGDQ188S", label: "联邦公共债务/GDP（%）", category: "财政", frequency: "季度" },
  { id: "GFDEBTN", label: "联邦债务总额（含政府内部持有，百万美元）", category: "财政", frequency: "季度" },
  { id: "FYGFDPUN", label: "公众持有联邦债务（百万美元）", category: "财政", frequency: "季度" },
  { id: "GFDGDPA188S", label: "联邦债务总额/GDP（%）", category: "财政", frequency: "年" },
  { id: "FYGFGDQ188S", label: "公众持有债务/GDP（%）", category: "财政", frequency: "季度" },
  { id: "FYFRGDA188S", label: "联邦收入/GDP（%）", category: "财政", frequency: "年" },
  { id: "FYONGDA188S", label: "联邦净支出/GDP（%）", category: "财政", frequency: "年" },
  { id: "FYOIGDA188S", label: "联邦利息支出/GDP（%）", category: "财政", frequency: "年" },
  { id: "A091RC1Q027SBEA", label: "联邦利息支出 NIPA（十亿美元，季调年化）", category: "财政", frequency: "季度" },
  { id: "CSUSHPINSA", label: "标普/Case-Shiller 房价指数", category: "固定资产与地产", frequency: "月" },
  { id: "UMCSENT", label: "密歇根大学消费者信心指数", category: "景气调查", frequency: "月" },
  { id: "CFNAI", label: "芝加哥联储全国活动指数", category: "景气调查", frequency: "月" },
  { id: "USREC", label: "NBER 衰退指标（0/1）", category: "综合", frequency: "月" },
  { id: "VIXCLS", label: "VIX 波动率指数", category: "证券市场", frequency: "日" },
] as const;

type WorldBankIndicatorDef = {
  id: string;
  label: string;
  category: string;
  frequency: UnifiedCatalogFrequency;
};

const WORLD_BANK_INDICATORS: readonly WorldBankIndicatorDef[] = [
  { id: "NY.GDP.MKTP.KD.ZG", label: "GDP 增速（年 %）", category: "国民经济核算", frequency: "年" },
  { id: "NY.GDP.PCAP.KD.ZG", label: "人均 GDP 增速（年 %）", category: "国民经济核算", frequency: "年" },
  { id: "NV.IND.TOTL.ZS", label: "工业增加值占 GDP（%）", category: "工业", frequency: "年" },
  { id: "FP.CPI.TOTL.ZG", label: "CPI 通胀（年 %）", category: "价格指数", frequency: "年" },
  { id: "SL.UEM.TOTL.ZS", label: "失业率（%）", category: "就业与工资", frequency: "年" },
  { id: "SL.TLF.CACT.ZS", label: "劳动参与率（%）", category: "就业与工资", frequency: "年" },
  { id: "FM.LBL.BMNY.GD.ZS", label: "广义货币占 GDP（%）", category: "银行与货币", frequency: "年" },
  { id: "FS.AST.DOMS.GD.ZS", label: "银行部门国内信贷占 GDP（%）", category: "银行与货币", frequency: "年" },
  { id: "FR.INR.RINR", label: "实际利率（%）", category: "利率与债券", frequency: "年" },
  { id: "CM.MKT.LCAP.GD.ZS", label: "股票市值占 GDP（%）", category: "证券市场", frequency: "年" },
  { id: "NE.TRD.GNFS.ZS", label: "贸易总额占 GDP（%）", category: "对外贸易及投资", frequency: "年" },
  { id: "BX.KLT.DINV.WD.GD.ZS", label: "FDI 净流入占 GDP（%）", category: "对外贸易及投资", frequency: "年" },
  { id: "NE.EXP.GNFS.ZS", label: "出口占 GDP（%）", category: "对外贸易及投资", frequency: "年" },
  { id: "NE.GDI.FTOT.ZS", label: "固定资本形成占 GDP（%）", category: "固定资产投资", frequency: "年" },
  { id: "GC.BAL.CASH.GD.ZS", label: "财政现金收支差额占 GDP（%）", category: "财政", frequency: "年" },
  { id: "GC.DOD.TOTL.GD.ZS", label: "政府债务占 GDP（%）", category: "财政", frequency: "年" },
  { id: "SP.POP.GROW", label: "人口增速（年 %）", category: "人口与资源", frequency: "年" },
  { id: "SP.DYN.LE00.IN", label: "预期寿命（岁）", category: "人口与资源", frequency: "年" },
] as const;

/** Phase 3：非美国家 × 18 世行指标（用于 bulk seed） */
export function listWorldBankSeedTargets(): {
  countryCode: string;
  indicatorId: string;
  label: string;
  category: string;
}[] {
  return MACRO_MAJOR_COUNTRIES.filter((c) => c.code !== "US").flatMap((c) =>
    WORLD_BANK_INDICATORS.map((ind) => ({
      countryCode: c.code,
      indicatorId: ind.id,
      label: ind.label,
      category: ind.category,
    })),
  );
}

const WORLD_BANK_LABEL_BY_ID = new Map(WORLD_BANK_INDICATORS.map((x) => [x.id, x.label]));
const FRED_LABEL_BY_ID = new Map(FRED_US_ITEMS.map((x) => [x.id, x.label]));

function buildCountryFromRows(
  country: CountryDef,
  rows: readonly (FredDef | WorldBankIndicatorDef)[],
  provider: UnifiedCatalogProvider,
): UnifiedCatalogCountry {
  const byCategory = new Map<string, UnifiedCatalogItem[]>();
  for (const row of rows) {
    const key =
      provider === "fred" ? `fred:${row.id}` : `wb:${country.code}:${row.id}`;
    let categoryName = row.category;
    if (country.code === "US" && provider === "fred") {
      const placement = resolveUsCatalogPlacement({
        key,
        label: row.label,
        legacyCategory: row.category,
        fredId: row.id,
      });
      if (placement.category !== "未分配") {
        categoryName = placement.category;
      }
    }
    const items = byCategory.get(categoryName) ?? [];
    items.push({
      key,
      label: row.label,
      frequency: row.frequency,
      provider,
      countryCode: country.code,
      categoryName,
    });
    byCategory.set(categoryName, items);
  }
  const categories = [...byCategory.entries()].map(([name, items]) => ({
    name,
    items: items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
  }));
  return {
    code: country.code,
    name: country.name,
    categories: categories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
  };
}

function buildCountries(): UnifiedCatalogCountry[] {
  return MACRO_MAJOR_COUNTRIES.map((country) => {
    if (country.code === "US") {
      return buildCountryFromRows(country, FRED_US_ITEMS, "fred");
    }
    return buildCountryFromRows(country, WORLD_BANK_INDICATORS, "wb");
  });
}

export function normalizeFrequency(v: string | null | undefined): UnifiedCatalogFrequency {
  const t = (v ?? "").trim();
  if (t === "日" || t === "周" || t === "月" || t === "季度" || t === "年") return t;
  if (/day/i.test(t)) return "日";
  if (/week/i.test(t)) return "周";
  if (/quarter/i.test(t)) return "季度";
  if (/year/i.test(t)) return "年";
  return "月";
}

async function loadMdsCatalog(): Promise<UnifiedCatalogCountry[]> {
  const rows = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      // 注意：不含 sched_fred_*。那些是调度器为 FRED 序列落库的本地副本（每条 metadata
      // 都带 catalogKey: fred:<ID>，且 fred:<ID> 默认 db-first 读取同一仪器），只作数据缓存，
      // 不应作为独立目录项——否则会与静态 FRED 目录的友好条目（fred:<ID>）重复。
      // FRED 序列若需在目录出现，请加入 FRED_US_ITEMS（带友好中文名），而非从这里放行。
      OR: [
        { code: { startsWith: "debtcap_" } },
        { code: { startsWith: "usov_" } },
        { code: { startsWith: "chov_" } },
        { code: { startsWith: "jpov_" } },
        { code: { startsWith: "goldov_" } },
        { code: { startsWith: "ism_" } },
        { code: { startsWith: "ism_svc_" } },
        { code: { startsWith: "treasury_" } },
        { code: { startsWith: "fiscal_" } },
        { code: { startsWith: "nyfed_" } },
        { metadata: { path: ["bootstrap"], equals: "excel" } },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      code: true,
      name: true,
      freqLabel: true,
      metadata: true,
    },
  });
  const byCountry = new Map<string, Map<string, UnifiedCatalogItem[]>>();
  for (const row of rows) {
    if (row.code.startsWith("cot_mm_")) continue;
    const md = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
    const countryCodeRaw = typeof md.countryCode === "string" ? md.countryCode : "";
    const countryCode = countryCodeRaw.trim().toUpperCase();
    if (!countryCode) continue;
    const legacyCategory =
      typeof md.catalogCategory === "string" && md.catalogCategory.trim()
        ? md.catalogCategory.trim()
        : "偿债能力";
    const label =
      typeof md.displayName === "string" && md.displayName.trim()
        ? md.displayName.trim()
        : row.name;
    const catalogKey =
      typeof md.catalogKey === "string" && md.catalogKey.trim() ? md.catalogKey.trim() : "";
    const fredIdFromMd = catalogKey.startsWith("fred:")
      ? catalogKey.slice(5).split("::")[0]?.trim()
      : undefined;
    let categoryName = legacyCategory;
    if (countryCode === "US") {
      const placement = resolveUsCatalogPlacement({
        key: `mds:${row.code}`,
        label,
        legacyCategory,
        fredId: fredIdFromMd,
      });
      if (placement.category !== "未分配") {
        categoryName = placement.category;
      }
    }
    const countryMap = byCountry.get(countryCode) ?? new Map<string, UnifiedCatalogItem[]>();
    const categoryItems = countryMap.get(categoryName) ?? [];
    categoryItems.push({
      key: `mds:${row.code}`,
      label,
      frequency: normalizeFrequency(row.freqLabel),
      provider: "mds",
      countryCode,
      categoryName,
    });
    countryMap.set(categoryName, categoryItems);
    byCountry.set(countryCode, countryMap);
  }

  const out: UnifiedCatalogCountry[] = [];
  for (const [countryCode, catMap] of byCountry.entries()) {
    out.push({
      code: countryCode,
      name: macroCountryName(countryCode),
      categories: [...catMap.entries()]
        .map(([name, items]) => ({
          name,
          items: items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

function mergeCountryCatalog(
  base: UnifiedCatalogCountry[],
  extra: UnifiedCatalogCountry[],
): UnifiedCatalogCountry[] {
  const map = new Map<string, UnifiedCatalogCountry>();
  for (const c of base) {
    map.set(c.code, {
      code: c.code,
      name: c.name,
      categories: c.categories.map((x) => ({
        name: x.name,
        items: [...x.items],
        subgroups: x.subgroups?.map((sg) => ({ name: sg.name, items: [...sg.items] })),
      })),
    });
  }
  for (const c of extra) {
    const exist = map.get(c.code);
    if (!exist) {
      map.set(c.code, c);
      continue;
    }
    const catMap = new Map<string, UnifiedCatalogGroup>(
      exist.categories.map((x) => [x.name, { name: x.name, items: [...x.items], subgroups: x.subgroups ? [...x.subgroups] : undefined }]),
    );
    for (const cat of c.categories) {
      const prev = catMap.get(cat.name);
      if (prev) {
        catMap.set(cat.name, mergeCatalogGroups(prev, cat));
      } else {
        catMap.set(cat.name, {
          name: cat.name,
          items: [...cat.items],
          subgroups: cat.subgroups ? [...cat.subgroups] : undefined,
        });
      }
    }
    exist.categories = [...catMap.values()]
      .map((g) => ({
        name: g.name,
        items: [...new Map(g.items.map((i) => [i.key, i])).values()].sort((a, b) =>
          a.label.localeCompare(b.label, "zh-CN"),
        ),
        subgroups: g.subgroups,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }
  return [...map.values()];
}

export const FRED_CATALOG_MACRO_MAX = 30;

type CatalogCache = {
  countries: UnifiedCatalogCountry[];
  groups: UnifiedCatalogGroup[];
  allowlist: Set<string>;
  /** 不在目录树中但仍需展示标签的键（待完善草稿等） */
  labelExtras: Record<string, string>;
  builtAt: number;
};

/** 用户搜索晋升完成的指标 → 注入正式目录树 */
async function loadPromotedSearchCatalog(): Promise<UnifiedCatalogCountry[]> {
  const rows = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      metadata: { path: ["onboardingStatus"], equals: ONBOARDING_STATUS_COMPLETE },
    },
    select: {
      code: true,
      name: true,
      freqLabel: true,
      fredSeriesId: true,
      metadata: true,
    },
  });

  const byCountry = new Map<string, Map<string, UnifiedCatalogItem[]>>();
  for (const row of rows) {
    const md =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const catalogKey =
      typeof md.catalogKey === "string" && md.catalogKey.trim()
        ? md.catalogKey.trim()
        : row.fredSeriesId
          ? fredCatalogKey(row.fredSeriesId)
          : `mds:${row.code}`;
    const countryCode = (
      typeof md.countryCode === "string" && md.countryCode.trim()
        ? md.countryCode
        : "US"
    )
      .trim()
      .toUpperCase();
    const categoryName =
      typeof md.catalogCategory === "string" && md.catalogCategory.trim()
        ? md.catalogCategory.trim()
        : "未分配";
    const label =
      typeof md.displayName === "string" && md.displayName.trim()
        ? md.displayName.trim()
        : row.name;
    const provider: UnifiedCatalogProvider = catalogKey.startsWith("fred:")
      ? "fred"
      : catalogKey.startsWith("wb:")
        ? "wb"
        : "mds";
    const countryMap = byCountry.get(countryCode) ?? new Map<string, UnifiedCatalogItem[]>();
    const items = countryMap.get(categoryName) ?? [];
    items.push({
      key: catalogKey,
      label,
      frequency: normalizeFrequency(row.freqLabel),
      provider,
      countryCode,
      categoryName,
    });
    countryMap.set(categoryName, items);
    byCountry.set(countryCode, countryMap);
  }

  const out: UnifiedCatalogCountry[] = [];
  for (const [code, catMap] of byCountry) {
    out.push({
      code,
      name: macroCountryName(code),
      categories: [...catMap.entries()]
        .map(([name, items]) => ({
          name,
          items: [...new Map(items.map((i) => [i.key, i])).values()].sort((a, b) =>
            a.label.localeCompare(b.label, "zh-CN"),
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    });
  }
  return out;
}

/** 待完善草稿：仅 allowlist + 标签，不进目录树 */
async function loadPendingSearchAllowlist(): Promise<{
  keys: string[];
  labels: Record<string, string>;
}> {
  const rows = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      metadata: { path: ["onboardingStatus"], equals: ONBOARDING_STATUS_PENDING },
    },
    select: {
      code: true,
      name: true,
      fredSeriesId: true,
      metadata: true,
    },
  });
  const keys: string[] = [];
  const labels: Record<string, string> = {};
  for (const row of rows) {
    if (readOnboardingStatus(row.metadata) !== ONBOARDING_STATUS_PENDING) continue;
    const md =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const catalogKey =
      typeof md.catalogKey === "string" && md.catalogKey.trim()
        ? md.catalogKey.trim()
        : row.fredSeriesId
          ? fredCatalogKey(row.fredSeriesId)
          : `mds:${row.code}`;
    const label =
      typeof md.displayName === "string" && md.displayName.trim()
        ? md.displayName.trim()
        : row.name;
    keys.push(catalogKey);
    labels[catalogKey] = label;
  }
  return { keys, labels };
}

let catalogCache: CatalogCache | null = null;

export function fredDisplayLabel(id: string): string {
  return FRED_LABEL_BY_ID.get(id.toUpperCase()) ?? id;
}

export function worldBankIndicatorLabel(indicatorId: string): string {
  return WORLD_BANK_LABEL_BY_ID.get(indicatorId) ?? indicatorId;
}

export function macroCountryName(countryCode: string): string {
  return COUNTRY_NAME_BY_CODE.get(countryCode.toUpperCase()) ?? countryCode.toUpperCase();
}

export async function buildBaseCatalogCountries(): Promise<UnifiedCatalogCountry[]> {
  const staticCountries = buildCountries();
  const mdsCountries = await loadMdsCatalog();
  const withMds = mergeCountryCatalog(staticCountries, mdsCountries);
  const withCot = mergeCountryCatalog(withMds, [buildCotCatalogCountry()]);
  const promoted = await loadPromotedSearchCatalog();
  const withPromoted = mergeCountryCatalog(withCot, promoted);
  return withPromoted.map((c) => consolidatePriceIndexCpi(c));
}

export async function getFredCatalogCached(): Promise<CatalogCache> {
  if (catalogCache && Date.now() - catalogCache.builtAt < CACHE_TTL_MS) return catalogCache;
  const baseCountries = await buildBaseCatalogCountries();
  const layout = await loadMacroCatalogLayout();
  const laidOut = layout ? applyCatalogLayout(baseCountries, layout) : baseCountries;
  // 收尾：美国 CPI 统一「同比」呈现 + 拆「CPI / CPI 分项」。必须在布局之后，
  // 否则存量布局按原始基键匹配不到 ::yoy 变体。
  const countries = presentUsCpiAsYoy(laidOut);
  const groups = countries.flatMap((country) =>
    country.categories.flatMap((category) => {
      const direct = {
        name: `${country.name} / ${category.name}`,
        items: category.items,
      };
      const sub = (category.subgroups ?? []).map((sg) => ({
        name: `${country.name} / ${category.name} / ${sg.name}`,
        items: sg.items,
      }));
      return [direct, ...sub].filter((g) => g.items.length > 0);
    }),
  );
  const allowlist = new Set<string>();
  const addToAllowlist = (key: string) => {
    allowlist.add(key);
    // 目录若以变体形态（如 fred:CPIAUCSL::yoy）呈现，仍要放行其原始基键
    // fred:CPIAUCSL，否则请求原始指数（分项环比表、模板 ::mom 等）会被拦截。
    const base = fredCatalogBaseKey(key);
    if (base !== key) allowlist.add(base);
  };
  for (const country of countries) {
    for (const category of country.categories) {
      for (const item of category.items) {
        addToAllowlist(item.key);
      }
      for (const sg of category.subgroups ?? []) {
        for (const item of sg.items) {
          addToAllowlist(item.key);
        }
      }
    }
  }
  const pending = await loadPendingSearchAllowlist();
  for (const key of pending.keys) addToAllowlist(key);
  catalogCache = {
    countries,
    groups,
    allowlist,
    labelExtras: pending.labels,
    builtAt: Date.now(),
  };
  return catalogCache;
}

export function clearFredCatalogCache(): void {
  catalogCache = null;
}

export function fredCatalogBaseKey(key: string): string {
  if (!key.startsWith("fred:")) return key;
  const rest = key.slice(5);
  const base = rest.split("::")[0]?.trim();
  return base ? `fred:${base}` : key;
}

/** `fred:CPIAUCSL` / `fred:CPIAUCSL::yoy` → `sched_fred_CPIAUCSL` */
export function fredInstrumentCodeFromKey(key: string): string | null {
  if (!key.startsWith("fred:")) return null;
  const rest = key.slice(5);
  const fredId = rest.split("::")[0]?.trim().toUpperCase();
  return fredId ? `sched_fred_${fredId}` : null;
}

export function unifiedKeyInAllowlist(key: string, allowlist: Set<string>): boolean {
  if (allowlist.has(key)) return true;
  if (key.startsWith("fred:")) return allowlist.has(fredCatalogBaseKey(key));
  return false;
}

export function parseUnifiedSeriesQueryWithAllowlist(
  raw: string | null,
  allowlist: Set<string>,
): string[] {
  const trimmed = raw?.trim() ?? "";
  const fallback = ["fred:GDPC1", "fred:CPIAUCSL", "fred:UNRATE"].filter((k) =>
    allowlist.has(k),
  );
  const defaultKeys =
    fallback.length > 0
      ? fallback
      : [...allowlist].slice(0, 3).sort((a, b) => a.localeCompare(b));

  if (!trimmed) return defaultKeys.length > 0 ? defaultKeys : ["fred:GDPC1"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of trimmed.split(",")) {
    const k = part.trim();
    if (!k || !unifiedKeyInAllowlist(k, allowlist) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= FRED_CATALOG_MACRO_MAX) break;
  }

  return out.length > 0 ? out : defaultKeys;
}

export function serializeUnifiedKeysForAllowlist(
  keys: Iterable<string>,
  allowlist: Set<string>,
): string {
  return [
    ...new Set(
      [...keys]
        .map((k) => k.trim())
        .filter((k) => unifiedKeyInAllowlist(k, allowlist) || k.startsWith("mds:")),
    ),
  ]
    .slice(0, FRED_CATALOG_MACRO_MAX)
    .join(",");
}
