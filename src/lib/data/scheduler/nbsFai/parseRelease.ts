import type { ObservationPoint } from "../types";

export type FaiInfrastructureDefinition =
  | "excludes_utilities"
  | "includes_utilities"
  | "unspecified";

export type FaiInfrastructureRelease = {
  point: ObservationPoint;
  definition: FaiInfrastructureDefinition;
};

/** Audited annual supplement, for a published fact absent from the UUID API.
 * This is a source parser, not a hard-coded observation or a monthly-to-annual
 * conversion. Other industries must not inherit this rate. */
export function parseFaiAnnualInternetRelease(html: string, year: number): ObservationPoint {
  const page = compact(html);
  if (!new RegExp(`${year}年[，,]`).test(page) || !/全年完成固定资产投资（不含农户）/.test(page)) throw new Error("年度固投补充公告年份/定义不匹配");
  const match = /互联网和相关服务业投资(?:比上年)?(增长|下降)(\d+(?:\.\d+)?)\s*%/.exec(page);
  if (!match) throw new Error("年度固投补充公告缺少互联网行业官方同比");
  const occurrences = [...page.matchAll(/互联网和相关服务业投资(?:比上年)?(?:增长|下降)\d+(?:\.\d+)?\s*%/g)];
  if (occurrences.length !== 1) throw new Error("年度固投补充公告行业值不唯一");
  return { obsDate: new Date(Date.UTC(year, 0, 1)), value: Number(match[2]) * (match[1] === "下降" ? -1 : 1) };
}

function compact(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function observationMonth(text: string): Date | null {
  const range = /(20\d{2})年\s*1\s*[—–-]\s*(\d{1,2})月(?:份)?全国固定资产投资/.exec(text);
  if (range) return new Date(Date.UTC(Number(range[1]), Number(range[2]) - 1, 1));
  const month = /(20\d{2})年\s*(\d{1,2})月(?:份)?全国固定资产投资/.exec(text);
  if (month) return new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1));
  const annual = /(20\d{2})年全国固定资产投资/.exec(text);
  return annual ? new Date(Date.UTC(Number(annual[1]), 11, 1)) : null;
}

/** Parse the directly published aggregate infrastructure-investment growth rate. */
export function parseFaiInfrastructureRelease(html: string): FaiInfrastructureRelease {
  const page = compact(html);
  const obsDate = observationMonth(page);
  if (!obsDate) throw new Error("国家统计局固投发布稿：无法识别基础设施投资观测期");

  const match = /基础设施投资(?:（[^）]{0,80}）)?[^。；]{0,80}?(?:(?:同比|比上年)(增长|下降)|(增长|下降))([0-9.]+)\s*%/.exec(page);
  if (!match) throw new Error("国家统计局固投发布稿：未找到基础设施投资累计同比");

  const definition: FaiInfrastructureDefinition = /基础设施投资（不含电力、热力、燃气及水生产和供应业）/.test(page)
    ? "excludes_utilities"
    : /基础设施投资[^。；]{0,160}(?:包括|包含)[^。；]{0,80}电力、热力、燃气及水生产和供应业/.test(page)
      || /基础设施投资包括水利管理业、生态保护和环境治理业、公共设施管理业、道路运输业、铁路运输业、航空运输业、管道运输业、多式联运和运输代理业、装卸搬运业、邮政业、电信广播电视和卫星传输服务业、互联网和相关服务业、水上运输业以及电力、热力、燃气及水生产和供应业/.test(page)
      ? "includes_utilities"
      : "unspecified";

  return {
    point: {
      obsDate,
      value: ((match[1] ?? match[2]) === "下降" ? -1 : 1) * Number(match[3]),
    },
    definition,
  };
}

/** Same annual reference period as UUID annual series; monthly YTD is rejected. */
export function parseFaiReviewedAnnualRelease(html: string, year: number, kind: "state_controlled" | "real_estate"): ObservationPoint {
  const text = compact(html).replace(/\s+/g, "");
  const title = kind === "state_controlled" ? "全国固定资产投资基本情况" : "全国房地产开发和销售情况";
  if (!text.includes(`${year}年${title}`)) throw new Error("年度固投原稿年份/范围不匹配");
  const re = kind === "state_controlled" ? /国有控股(-?\d+(?:\.\d+)?)(?=其中|按构成|分|注|%|$)/g
    : /全国房地产开发投资\d+(?:\.\d+)?亿元[，,]比上年(增长|下降)(\d+(?:\.\d+)?)%/g;
  const values = [...text.matchAll(re)].map(m => kind === "state_controlled" ? Number(m[1]) : Number(m[2]) * (m[1] === "下降" ? -1 : 1));
  const unique = [...new Set(values)];
  if (unique.length !== 1 || !Number.isFinite(unique[0])) throw new Error("年度固投原稿缺少唯一同口径同比");
  return { obsDate: new Date(Date.UTC(year, 0, 1)), value: unique[0]! };
}
