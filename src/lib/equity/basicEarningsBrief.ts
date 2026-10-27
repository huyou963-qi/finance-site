import type { SecReleaseAttachment } from "./secEdgar";

export type EarningsFactVersion = {
  accession: string; fiscalDate: string; filedAt: string; sourceUrl: string;
  revenue: number | null; revenueYoY: number | null; eps: number | null; epsYoY: number | null;
  netIncome: number | null; opMargin: number | null;
};
export type BriefEvidence = { text: string; url: string; evidence: string; kind: "xbrl" | "quote" };
export type BasicEarningsBrief = {
  method: "rules-v1"; periodEnd: string | null;
  financial: BriefEvidence[]; business: BriefEvidence[]; guidance: BriefEvidence[];
  businessExcerpt: BriefEvidence | null; guidanceExcerpt: BriefEvidence | null;
  financialFiledAt: string | null;
};

const valid = (value: number | null): value is number => value != null && Number.isFinite(value);
const dollars = (value: number) => `${(value / 1e8).toFixed(2)} 亿美元`;
const percent = (value: number) => `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const METRICS: [RegExp, string][] = [
  [/energy\s+storage\s+deployments?/i, "储能部署量"], [/vehicle\s+deliveries|deliveries/i, "交付量"],
  [/data\s+cent(?:er|re)\s+revenue/i, "数据中心业务营收"], [/services?\s+revenue/i, "服务业务营收"],
  [/paid\s+(?:memberships|subscribers)/i, "付费订阅数"], [/operating\s+income/i, "经营利润"],
  [/free\s+cash\s+flow/i, "自由现金流"], [/capital\s+expenditures|capex/i, "资本开支"],
  [/\brevenue\b/i, "营收"], [/\bproduction\b/i, "产量"],
];
function sentences(attachments: SecReleaseAttachment[]) {
  return attachments.flatMap(attachment => attachment.text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map(text => text.trim()).filter(text => text.length >= 20 && text.length <= 700)
    .map(text => ({ text, url: attachment.url })));
}

/** Transparent rules only. Unknown translation/measurement bases stay in the source excerpt. */
export function buildBasicEarningsBrief(periodEnd: string | null, attachments: SecReleaseAttachment[], version?: EarningsFactVersion): BasicEarningsBrief {
  const brief: BasicEarningsBrief = { method: "rules-v1", periodEnd, financial: [], business: [], guidance: [],
    businessExcerpt: null, guidanceExcerpt: null, financialFiledAt: null };
  if (version && version.fiscalDate === periodEnd) {
    brief.financialFiledAt = version.filedAt;
    const financial = (text: string, evidence: string) => brief.financial.push({ text, evidence, url: version.sourceUrl, kind: "xbrl" });
    if (valid(version.revenue)) financial(`营收 ${dollars(version.revenue)}${valid(version.revenueYoY) ? `，同比 ${percent(version.revenueYoY)}` : ""}。`,
      `SEC XBRL: revenue(USD)=${version.revenue}; revenueYoY=${version.revenueYoY}; accession=${version.accession}`);
    if (valid(version.eps)) financial(`GAAP 口径每股收益（标准化）${version.eps.toFixed(2)} 美元${valid(version.epsYoY) ? `，同比变动 ${percent(version.epsYoY)}` : ""}。`,
      `SEC XBRL: EPS(USD/share)=${version.eps}; EPSYoY=${version.epsYoY}; accession=${version.accession}`);
    if (valid(version.netIncome)) financial(`GAAP 净利润 ${dollars(version.netIncome)}${valid(version.opMargin) ? `，经营利润率 ${(version.opMargin * 100).toFixed(1)}%` : ""}。`,
      `SEC XBRL: netIncome(USD)=${version.netIncome}; operatingMargin=${version.opMargin}; accession=${version.accession}`);
  }
  for (const source of sentences(attachments)) {
    if (/forward[- ]looking statements|safe harbor|risks and uncertainties/i.test(source.text)) continue;
    const metric = METRICS.find(([pattern]) => pattern.test(source.text));
    const forward = /\b(?:expect|expects|anticipate|anticipates|forecast|guidance|outlook|target)\b/i.test(source.text);
    const evidence = (text: string): BriefEvidence => ({ text, url: source.url, evidence: source.text.slice(0, 260), kind: "quote" });
    if (metric && !forward) {
      brief.businessExcerpt ??= evidence("经营原文摘录（未自动解读）");
      const hit = source.text.match(metric[0])!;
      const after = source.text.slice((hit.index ?? 0) + hit[0].length);
      const change = after.match(/^\s*(?:was\s+|were\s+)?(increased|grew|rose|decreased|declined|fell)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/i);
      if (change && brief.business.length < 2) {
        const direction = /increased|grew|rose/i.test(change[1]) ? "增长" : "下降";
        const suffix = after.slice(change[0].length);
        const basis = /^\s*(?:year[- ]over[- ]year|yoy)\b/i.test(suffix) ? "同比" : /^\s*(?:quarter[- ]over[- ]quarter|qoq)\b/i.test(suffix) ? "环比" : "";
        const adjusted = /(?:non[- ]GAAP|adjusted)\s*$/i.test(source.text.slice(0, hit.index)) ? "调整后" : "公司披露的";
        brief.business.push(evidence(`${adjusted}${metric[1]}${basis}${direction} ${change[2]}%${basis ? "" : "（比较口径见原文）"}。`));
      }
    }
    if (forward) {
      brief.guidanceExcerpt ??= evidence("管理层展望原文摘录（未自动解读）");
      if (metric && /\b(?:we|company)\b.{0,30}\b(?:expect|expects|anticipate|anticipates)\b/i.test(source.text) && brief.guidance.length < 2) {
        const hit = source.text.match(metric[0])!;
        const after = source.text.slice((hit.index ?? 0) + hit[0].length);
        const forecast = after.match(/^\s*(?:to\s+|will\s+)?(exceed|above|over|at least|approximately|around|of|to be)\s+(\$\s*\d[\d,.]*(?:\s*(?:billion|million|[BM]))?)/i);
        if (forecast) {
          const qualifier = /exceed|above|over/i.test(forecast[1]) ? "超过" : /at least/i.test(forecast[1]) ? "至少为" : /approximately|around/i.test(forecast[1]) ? "约为" : "为";
          const years = new Set([...source.text.matchAll(/\bin\s+(20\d{2})\b/g)].map(match => match[1]));
          const year = years.size === 1 ? [...years][0] : null;
          brief.guidance.push(evidence(`公司预计${year ? `${year} 年` : ""}${metric[1]}${qualifier} ${forecast[2]}（保留原文单位）。`));
        }
      }
    }
    const adjustedEps = source.text.match(/non[- ]GAAP\s+(?:diluted\s+)?(?:EPS|earnings per share)\s+(?:of\s+|was\s+|were\s+)?(\$\s*\d+(?:\.\d+)?)/i);
    if (!forward && adjustedEps && !/\b(?:prior|previous|last year|last quarter|compared|versus)\b/i.test(source.text) && brief.business.length < 2) brief.business.push(evidence(`调整后每股收益 ${adjustedEps[1]}，与 GAAP 口径分开展示。`));
  }
  return brief;
}
