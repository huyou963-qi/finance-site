/** 国家统计局固定资产投资：月度累计同比、年度名义值/同比；环比仅官方发布总项。 */
export const NBS_FAI_API_BASE = "https://data.stats.gov.cn/dg/website/publicrelease/web/external";
export const NBS_FAI_DATA_URL = "https://data.stats.gov.cn/dg/website/page.html#/pc/national/monthData";
export const NBS_FAI_RELEASE_INDEX_URL = "https://www.stats.gov.cn/sj/zxfb/";
export const NBS_FAI_RELEASE_URL = "https://www.stats.gov.cn/sj/zxfb/202607/t20260715_1964124.html";
export const NBS_FAI_SYNC_SCRIPT = "scripts/data-worker/sync-nbs-fai.ts";
export const NBS_FAI_MONTHLY_ROOT_ID = "fc982599aa684be7969d7b90b1bd0e84";
export const NBS_FAI_ANNUAL_ROOT_ID = "884c062607104a91967b22742537f44f";

export type FaiFrequency = "monthly" | "annual";
export type FaiCatalog = { cid: string; frequency: FaiFrequency; group: string };

// 当前口径分项；2018 年起的行业分类与国家数据的历史目录由此保留其原始发布时间范围。
export const NBS_FAI_CATALOGS: readonly FaiCatalog[] = [
  { cid: "5129067b149d4ddfbec1ffc478d35bfb", frequency: "monthly", group: "概况与产业" },
  { cid: "aac38c7aa152478ebea254ac412aa0a1", frequency: "monthly", group: "建设性质与构成" },
  { cid: "9002859582574437a91914e0fd50166b", frequency: "monthly", group: "行业" },
  { cid: "a3136f1cd88442efa209740d78bba410", frequency: "monthly", group: "民间投资行业" },
  { cid: "88077f9647ef499bac2e2e3350e3bab1", frequency: "monthly", group: "资金来源" },
  { cid: "6158d027f4804bfd9b19e36ce4cb5eda", frequency: "monthly", group: "登记注册类型" },
  { cid: "2bf47029b8f84dacaddb8f0e5b93583c", frequency: "monthly", group: "项目计划总投资" },
  { cid: "607a7cd4b50e4553894472475d1f4273", frequency: "annual", group: "总量" },
  { cid: "975bf8699a3a433b8d1d5e42e89525ca", frequency: "annual", group: "民间投资" },
  { cid: "8dc8aa74807c48588a2f266122fb4957", frequency: "annual", group: "三次产业" },
  { cid: "d3a73a7e6c3c4db185b05aaac3c899e1", frequency: "annual", group: "重点领域" },
  { cid: "52a262e321624716af66bd823e156297", frequency: "annual", group: "资金来源" },
  { cid: "7b7fa2000b63457a810199cf6c5e9dfa", frequency: "annual", group: "建设性质与构成" },
  { cid: "91fb952fc32d44d498e9bd4ffdbac9de", frequency: "annual", group: "控股情况" },
  { cid: "8501f430c9264d5784b7e67e1c48a4e8", frequency: "annual", group: "行业" },
];

export const NBS_FAI_SOURCE = { id: "nbs-fai", agencyId: "cn-nbs", name: "国家统计局中国固定资产投资", baseUrl: NBS_FAI_DATA_URL, termsUrl: "https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html" } as const;
export function nbsFaiCode(frequency: FaiFrequency, cid: string, indicatorId: string) { return `nbs_cn_fai_${frequency === "monthly" ? "m" : "a"}_${cid.slice(0, 8)}_${indicatorId.slice(0, 8)}`; }
export const NBS_FAI_MOM_CODE = "nbs_cn_fai_m_headline_mom";
