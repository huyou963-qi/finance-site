/**
 * 宏观框架指标 id → 本地库 catalog key（fred: / mds:）。
 * 未入库的序列在页面上显示 N/A，指标卡片仍保留。
 */
export const FRAMEWORK_INDICATOR_CATALOG_KEYS: Record<string, string> = {
  // Corporate leading
  "ism-pmi": "mds:ism_us_ism_headline",
  "ism-orders": "mds:ism_us_ism_new_orders",
  "durables-ex-trans": "fred:ADXTNO",
  "nonres-construct": "fred:TLNONRES",
  "jobless-claims": "fred:IC4WSA",
  // Corporate coincident
  "ind-prod": "fred:INDPRO",
  "mfg-inventories": "fred:AMTMNO",
  "nf-output": "fred:OUTNFB",
  "corp-profits": "fred:CP",
  // Corporate lagging
  "unit-labor-cost": "fred:ULCNFB",
  "inv-sales": "fred:ISRATIO",
  "cap-util": "fred:TCU",
  // Financial
  sloos: "fred:DRTSCILM",
  "hy-oas": "fred:BAMLH0A0HYM2",
  "spread-2s10": "fred:T10Y2Y",
  nfci: "fred:NFCI",
  sp500: "fred:SP500",
  "ust-10y": "fred:DGS10",
  dxy: "fred:DTWEXBGS",
  gold: "fred:GOLDAMGBD228NLBM",
  "ci-loans": "fred:BUSLOANS",
  "m2-yoy": "fred:M2SL",
  "delinq-rate": "fred:DRALACBS",
  "charge-off": "fred:CORCACBS",
  "hh-net-worth": "fred:TNWBSHNO",
  // Household
  "michigan-sent": "fred:UMCSENT",
  "cb-expect": "fred:UMCSENT1",
  "bldg-permits": "fred:PERMIT",
  "existing-home": "fred:EXHOSLUSM495S",
  "private-investment": "fred:PNFI",
  "private-investment-stock": "fred:K1WT1ANBEA",
  pce: "fred:PCE",
  "retail-ex-auto": "fred:RSXFS",
  payrolls: "fred:PAYEMS",
  "avg-earnings": "fred:AHETPI",
  unemployment: "fred:UNRATE",
  lfpr: "fred:CIVPART",
  "real-dpi": "fred:DSPIC96",
  // Fiscal
  "fed-deficit-12m": "fred:FYFSD",
  "fed-contracts": "fred:FGEXPND",
  "fed-expend": "fred:FGEXPND",
  "sl-spending": "fred:SLEXPND",
  "fed-debt-gdp": "fred:GFDEGDQ188S",
  "primary-balance": "fred:FYFSGDA188S",
  "interest-rev": "fred:A091RC1Q027SBEA",
  // Monetary
  "ff-futures": "fred:FEDFUNDS",
  "breakeven-5y5y": "fred:T5YIFR",
  "ust-2y": "fred:DGS2",
  "eff-ffr": "fred:EFFR",
  "fed-bs": "fred:WALCL",
  "real-policy-rate": "fred:FEDFUNDS",
  "core-pce": "fred:PCEPILFE",
  "core-cpi": "fred:CPILFESL",
  "eci-yoy": "fred:ECIALLCIV",
  // External
  "ism-export": "fred:NETEXP",
  "usd-broad": "fred:DTWEXBGS",
  "goods-trade": "fred:BOPGSTB",
  // BOP 经常账户（IEABC）；NETFI 为 NIPA 口径，分析模板用 IEABC
  "current-acct": "fred:IEABC",
  niip: "fred:IIPUSNETIQ",
  // 原 TTEXG 无效；BEA 贸易条件指数
  "terms-trade": "fred:W369RG3Q066SBEA",
  // Inflation cross-cut
  supercore: "fred:CUSR0000SASLE",
  "sticky-cpi": "fred:STICKCPIM159SFRBATL",
  "flexible-cpi": "fred:FLEXCPIM159SFRBATL",
  "breakeven-5y": "fred:T5YIE",
  "breakeven-10y": "fred:T10YIE",
  "headline-cpi": "fred:CPIAUCSL",
  wti: "fred:DCOILWTICO",
};

export const FRAMEWORK_SPARKLINE_POINTS = 6;
