/** 元数据「来源」机构名 → 官网（用于管理页与探测提示） */
export const AGENCY_OFFICIAL_URLS: Record<string, string> = {
  国家统计局: "https://www.stats.gov.cn/",
  中国人民银行: "http://www.pbc.gov.cn/",
  日本央行: "https://www.boj.or.jp/",
  日本内阁府: "https://www.esri.cao.go.jp/",
  日本财务省: "https://www.mof.go.jp/",
  日本统计局: "https://www.stat.go.jp/",
  日本总务省统计局: "https://www.stat.go.jp/",
  美联储: "https://www.federalreserve.gov/",
  美国劳工部: "https://www.bls.gov/",
  美国财政部: "https://home.treasury.gov/",
  美国经济分析局: "https://www.bea.gov/",
  国际清算银行: "https://www.bis.org/statistics/",
  国际货币基金组织: "https://www.imf.org/en/Data",
  Wind: "https://www.wind.com.cn/",
  根据新闻整理: "",
  标准普尔: "https://www.spglobal.com/",
  中证指数公司: "https://www.csindex.com.cn/",
  道琼斯公司: "https://www.spglobal.com/spdji/",
  纳斯达克交易所: "https://www.nasdaq.com/",
  东京证券交易所: "https://www.jpx.co.jp/",
  国家能源局: "https://www.nea.gov.cn/",
  COMEX: "https://www.cmegroup.com/",
  ICE: "https://www.ice.com/",
};

export const US_AGENCIES_FOR_FRED = new Set([
  "美联储",
  "美国劳工部",
  "美国财政部",
  "美国经济分析局",
]);

export const XLSX_IMPORT_BY_SOURCE_TAG: Record<
  string,
  { script: string; defaultPath: string }
> = {
  "japan-overview-xlsx": {
    script: "npm run db:import-japan-overview-xlsx",
    defaultPath: "C:/Users/Administrator/Desktop/模板/Japan_Overview.xlsx",
  },
  "china-overview-xlsx": {
    script: "npm run db:import-china-overview-xlsx",
    defaultPath: "C:/Users/Administrator/Desktop/模板/China_Overview.xlsx",
  },
  "us-overview-xlsx": {
    script: "npm run db:import-us-overview-xlsx",
    defaultPath: "C:/Users/Administrator/Desktop/模板/US_Overview.xlsx",
  },
  "debt-capacity-xlsx": {
    script: "npm run db:import-debt-capacity-xlsx",
    defaultPath: "C:/Users/Administrator/Desktop/国家偿债能力.xlsx",
  },
};

export function officialUrlForAgency(agency: string): string | undefined {
  const t = agency.trim();
  return AGENCY_OFFICIAL_URLS[t] || undefined;
}
