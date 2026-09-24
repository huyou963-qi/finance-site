/**
 * 发布包 → FRED release id 映射（单一真源）。
 *
 * 为什么用 FRED 自己的发布日历而不是 TradingEconomics：
 * - 这些包的成员本来就是 `sched_fred_*`，数据从 FRED 读，日历也该用 FRED 的，
 *   两者天然对齐；TE 是 HTML 抓取，投递不稳定且时刻依赖 cookie 时区。
 * - `/fred/release/dates` 同时返回**过去与未来**的发布日，因此可以判断
 *   「上一期发布日过去了但我们没抓」，做补抓；TE 只给未来日期，做不到。
 * - BLS / Census 官网日程从香港机房访问是 403，FRED 恰好代理了它们
 *   （BLS CPI → release 10，Census MTIS → release 25）。
 *
 * 生成方式：对每个发布包的全部 FRED 成员调用 `/fred/series/release`，取并集。
 * 只有 2 个包跨多个 release（us.fed.fomc、us.treasury.debt_levels），所以这里
 * 是 `number[]`——「任一成员 release 发布即到期」比强行归一到单个 release 正确。
 *
 * 新增/调整发布包后用 `npm run data:verify-fred-release-map` 重新核对。
 */

export const FRED_RELEASE_IDS_BY_PACKAGE: Readonly<Record<string, readonly number[]>> = {
  /** Gross Domestic Product (release:53:2) */
  "us.bea.corporate_profits": [53],
  /** Gross Domestic Product (release:53:6) */
  "us.bea.gdp": [53],
  /** U.S. International Investment Position (release:359:4) */
  "us.bea.iip": [359],
  /** U.S. International Transactions (release:49:108) */
  "us.bea.international_transactions": [49],
  /** Personal Income and Outlays (release:54:2) */
  "us.bea.pce": [54],
  /** Personal Income and Outlays (release:54:5) */
  "us.bea.personal_income": [54],
  /** Consumer Price Index (release:10:24) */
  "us.bls.cpi": [10],
  /** Employment Situation (release:50:14) */
  "us.bls.employment_situation": [50],
  /** New Residential Construction (release:27:4) */
  "us.bls.housing_starts": [27],
  /** U.S. Import and Export Price Indexes (release:188:2) */
  "us.bls.import_export_prices": [188],
  /** G.17 Industrial Production and Capacity Utilization (release:13:2) */
  "us.bls.industrial_production": [13],
  /** Job Openings and Labor Turnover Survey (release:192:4) */
  "us.bls.jolts": [192],
  /** Producer Price Index (release:46:20) */
  "us.bls.ppi": [46],
  /** Advance Monthly Sales for Retail and Food Services (release:9:20) */
  "us.bls.retail_sales": [9],
  /** S&P Cotality Case-Shiller Home Price Indices (release:199:1) */
  "us.case_shiller": [199],
  /** Cass Freight Index Report (release:280:2) */
  "us.cass.freight_index": [280],
  /** CBOE Market Statistics (release:200:2) */
  "us.cboe.market_statistics": [200],
  /** Housing Vacancies and Homeownership (release:296:1) */
  "us.census.homeownership": [296],
  /** U.S. International Trade in Goods and Services (release:51:3) */
  "us.census.international_trade": [51],
  /** Manufacturer's Shipments, Inventories, and Orders (M3) Survey (release:95:5) */
  "us.census.m3": [95],
  /** Supplemental Estimates, Underlying Detail Tables, Spliced Series (release:282:1) */
  "us.census.mfg_trade_sales": [282],
  /** Manufacturing and Trade Inventories and Sales (release:25:3) */
  "us.census.mtis": [25],
  /** New Residential Sales (release:97:2) */
  "us.census.new_home_sales": [97],
  /** Chicago Fed National Activity Index (release:219:1) */
  "us.chicagofed.cfnai": [219],
  /** Chicago Fed National Financial Conditions Index (release:221:2) */
  "us.chicagofed.nfci": [221],
  /** Texas Manufacturing Outlook Survey (release:374:1) */
  "us.dallasfed.tmos": [374],
  /** Unemployment Insurance Weekly Claims Report (release:180:1) */
  "us.dol.continuing_claims": [180],
  /** Unemployment Insurance Weekly Claims Report (release:180:1) */
  "us.dol.weekly_claims": [180],
  /** Gasoline and Diesel Fuel Update (release:183) */
  "us.eia.gasoline_diesel": [183],
  /** Natural Gas Spot and Futures Prices (NYMEX) (release:342) */
  "us.eia.natural_gas_spot": [342],
  /** Spot Prices (release:212:3) */
  "us.eia.spot_prices": [212],
  /** H.15 Selected Interest Rates + FOMC Press Release (release:18:1, 101:1) */
  "us.fed.fomc": [18, 101],
  /** H.4.1 Factors Affecting Reserve Balances (release:20:5) */
  "us.fed.h41": [20],
  /** Interest Rate on Reserve Balances (release:185:1) */
  "us.fed.iorb": [185],
  /** H.6 Money Stock Measures (release:21:1) */
  "us.fed.m2": [21],
  /** Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks (release:231:4) */
  "us.frb.chargeoff_delinquency": [231],
  /** G.17 Industrial Production and Capacity Utilization (release:13:1) */
  "us.frb.g17_capacity": [13],
  /** G.19 Consumer Credit (release:14:2) */
  "us.frb.g19_consumer_credit": [14],
  /** H.10 Foreign Exchange Rates (release:17:4) */
  "us.frb.h10_fx": [17],
  /** H.15 Selected Interest Rates (release:18:2) */
  "us.frb.h15_rates": [18],
  /** H.8 Assets and Liabilities of Commercial Banks in the United States (release:22:1) */
  "us.frb.h8_bank_assets": [22],
  /** Household Debt Service Ratios (release:89:1) */
  "us.frb.household_dsr": [89],
  /** Interest Rate Spreads (release:304:4) */
  "us.frb.interest_rate_spreads": [304],
  /** Senior Loan Officer Opinion Survey on Bank Lending Practices (release:191:1) */
  "us.frb.sloos": [191],
  /** Z.1 Financial Accounts of the United States (release:52:2) */
  "us.frb.z1_corporate_bonds": [52],
  /** Z.1 Financial Accounts of the United States (release:52:1) */
  "us.frb.z1_household": [52],
  /** Weekly Economic Index (Lewis-Mertens-Stock) (release:465:1) */
  "us.fred.weekly_economic_index": [465],
  /** Primary Mortgage Market Survey (release:190:2) */
  "us.freddiemac.pmms": [190],
  /** ICE BofA Indices (release:209:2) */
  "us.ice.bofa_indices": [209],
  /** Existing Home Sales (release:291:1) */
  "us.nar.existing_home_sales": [291],
  /** Recession Indicators Series (release:242:1) */
  "us.nber.recession": [242],
  /** Federal Funds Data (release:378:1) */
  "us.nyfed.effr": [378],
  /** Empire State Manufacturing Survey (release:321:1) */
  "us.nyfed.empire_state": [321],
  /** Temporary Open Market Operations (release:379:8) */
  "us.nyfed.rrp": [379],
  /** Secured Overnight Financing Rate Data (release:445:1) */
  "us.nyfed.sofr": [445],
  /** Debt to Gross Domestic Product Ratios (release:263:6) */
  "us.omb.fiscal_ratios": [263],
  /** Manufacturing Business Outlook Survey (release:351:1) */
  "us.philadelphiafed.mbos": [351],
  /** St. Louis Fed Financial Stress Index (release:187:1) */
  "us.stlouisfed.financial_stress_index": [187],
  /** U.S. Recession Probabilities (release:261:1) */
  "us.stlouisfed.recession_prob": [261],
  /** Sahm Rule Recession Indicator (release:456:1) */
  "us.stlouisfed.sahm": [456],
  /** Treasury Bulletin + Debt to Gross Domestic Product Ratios (release:80:2, 263:1) */
  "us.treasury.debt_levels": [80, 263],
  /** Surveys of Consumers (release:91:1) */
  "us.umich.sentiment": [91],
};

/** 仅用于日志/审计可读性，不参与匹配。 */
export const FRED_RELEASE_NAMES: Readonly<Record<number, string>> = {
  9: "Advance Monthly Sales for Retail and Food Services",
  10: "Consumer Price Index",
  13: "G.17 Industrial Production and Capacity Utilization",
  14: "G.19 Consumer Credit",
  17: "H.10 Foreign Exchange Rates",
  18: "H.15 Selected Interest Rates",
  20: "H.4.1 Factors Affecting Reserve Balances",
  21: "H.6 Money Stock Measures",
  22: "H.8 Assets and Liabilities of Commercial Banks in the United States",
  25: "Manufacturing and Trade Inventories and Sales",
  27: "New Residential Construction",
  46: "Producer Price Index",
  49: "U.S. International Transactions",
  50: "Employment Situation",
  51: "U.S. International Trade in Goods and Services",
  52: "Z.1 Financial Accounts of the United States",
  53: "Gross Domestic Product",
  54: "Personal Income and Outlays",
  80: "Treasury Bulletin",
  89: "Household Debt Service Ratios",
  91: "Surveys of Consumers",
  95: "Manufacturer's Shipments, Inventories, and Orders (M3) Survey",
  97: "New Residential Sales",
  101: "FOMC Press Release",
  180: "Unemployment Insurance Weekly Claims Report",
  183: "Gasoline and Diesel Fuel Update",
  185: "Interest Rate on Reserve Balances",
  187: "St. Louis Fed Financial Stress Index",
  188: "U.S. Import and Export Price Indexes",
  190: "Primary Mortgage Market Survey",
  191: "Senior Loan Officer Opinion Survey on Bank Lending Practices",
  192: "Job Openings and Labor Turnover Survey",
  199: "S&P Cotality Case-Shiller Home Price Indices",
  200: "CBOE Market Statistics",
  209: "ICE BofA Indices",
  212: "Spot Prices",
  219: "Chicago Fed National Activity Index",
  221: "Chicago Fed National Financial Conditions Index",
  231: "Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks",
  242: "Recession Indicators Series",
  261: "U.S. Recession Probabilities",
  263: "Debt to Gross Domestic Product Ratios",
  280: "Cass Freight Index Report",
  282: "Supplemental Estimates, Underlying Detail Tables, Spliced Series",
  291: "Existing Home Sales",
  296: "Housing Vacancies and Homeownership",
  304: "Interest Rate Spreads",
  321: "Empire State Manufacturing Survey",
  342: "Natural Gas Spot and Futures Prices (NYMEX)",
  351: "Manufacturing Business Outlook Survey",
  359: "U.S. International Investment Position",
  374: "Texas Manufacturing Outlook Survey",
  378: "Federal Funds Data",
  379: "Temporary Open Market Operations",
  445: "Secured Overnight Financing Rate Data",
  456: "Sahm Rule Recession Indicator",
  465: "Weekly Economic Index (Lewis-Mertens-Stock)",
};

export function fredReleaseIdsForPackage(packageId: string): readonly number[] | null {
  const ids = FRED_RELEASE_IDS_BY_PACKAGE[packageId];
  return ids && ids.length > 0 ? ids : null;
}

/** 该发布包是否应改用 FRED 发布日历（而非 TE）。 */
export function packageUsesFredReleaseCalendar(packageId: string): boolean {
  return fredReleaseIdsForPackage(packageId) != null;
}

/** 注册表里出现过的全部 release id（去重、升序），用于一次性批量拉日历。 */
export function allRegisteredFredReleaseIds(): number[] {
  const set = new Set<number>();
  for (const ids of Object.values(FRED_RELEASE_IDS_BY_PACKAGE)) {
    for (const id of ids) set.add(id);
  }
  return [...set].sort((a, b) => a - b);
}
