/**
 * 个股事件时间线聚合（Phase 3 / P10-A3）：
 * 三源归并 —— sec_filing（10-Q/10-K/8-K）+ equity_split（拆股）+ 季度快照（业绩 metrics 内嵌）。
 * 库内无 filing 时懒回补一次 SEC submissions（同基本面懒回补模式，脚本 sync-sec 仍是主路径）。
 */

import { prisma } from "@/lib/prisma";
import { syncSecFilings } from "./secFilingSync";
import { loadOwnershipPlanDisclosures } from "./ownershipMonitor";
import { readReleaseAttachments } from "./stockDisclosures";
import type { Prisma } from "@prisma/client";
import type { SecReleaseAttachment } from "./secEdgar";
import { releasePeriodEnd } from "./stockEventGroups";
import { disclosureSession, easternParts, eventReaction, type EventReaction } from "./disclosureTiming";
import { getDailyCloseRowsDbOnly } from "./equityPriceStore";
import { buildBasicEarningsBrief, type BasicEarningsBrief, type EarningsFactVersion } from "./basicEarningsBrief";

export type StockEventType = "earnings" | "annual" | "8k" | "split" | "insider-plan";
export type StockEventImportance = "high" | "medium" | "low";

export type StockEventMetrics = {
  period: string;
  fiscalQuarter: number | null;
  revenue: number | null;
  revenueYoY: number | null;
  eps: number | null;
  epsYoY: number | null;
};

export type StockEvent = {
  type: StockEventType;
  /** 展示日：公司有据发布日期 / SEC 核验接收日 / 申报日；精度与来源见 timing。 */
  date: string;
  titleZh: string;
  form: string | null;
  /** 8-K item 编号（去掉伴随项 9.01） */
  items: string[];
  importance: StockEventImportance;
  url: string | null;
  /** 10-Q/10-K：关联最近一季快照 */
  metrics: StockEventMetrics | null;
  /** 拆股："10:1" */
  splitRatio: string | null;
  /** 明确时点之后的完整交易日收益；缺精确时间/价格时为 null，口径见 reactionDetails。 */
  reaction: number | null;
  reactionDetails?: EventReaction;
  timing?: {
    filedDate: string; acceptedAt: string | null; acceptedAtSource: string | null;
    publishedAt: string | null; publishedOn: string | null; publicationSource: string | null;
    session: ReturnType<typeof disclosureSession>; acceptedSession: ReturnType<typeof disclosureSession>;
    displayBasis: "company-publication" | "sec-acceptance" | "filing-date";
  };
  brief?: BasicEarningsBrief | null;
  /** 仅事件分页按需返回；行情标记不携带附件正文。 */
  disclosure?: {
    accession: string;
    periodEnd: string | null;
    collectedAt: string;
    status: string | null;
    processedAt: string | null;
    attachments: SecReleaseAttachment[];
  };
};

/** 8-K item → 中文标签（时间线摘要用） */
const ITEM_LABEL_ZH: Record<string, string> = {
  "1.01": "重大协议",
  "1.02": "协议终止",
  "1.03": "破产/接管",
  "2.01": "收购或资产交易完成",
  "2.02": "业绩发布",
  "2.03": "新增债务义务",
  "2.05": "重组计划",
  "2.06": "资产减值",
  "3.01": "退市/合规通知",
  "4.01": "会计师变更",
  "4.02": "已发布财报不可依赖",
  "5.02": "高管/董事变动",
  "5.03": "章程或细则修订",
  "5.07": "股东大会结果",
  "7.01": "FD 公平披露",
  "8.01": "其他重要事项",
};

const HIGH_ITEMS = new Set(["1.01", "1.02", "1.03", "2.01", "2.02", "2.05", "2.06", "4.02", "5.02"]);
const MEDIUM_ITEMS = new Set(["2.03", "3.01", "4.01", "5.03", "5.07"]);

function parse8kItems(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "9.01"); // 9.01 附件为伴随项，不单独展示
}

function importanceOf8k(items: string[]): StockEventImportance {
  if (items.some((i) => HIGH_ITEMS.has(i))) return "high";
  if (items.some((i) => MEDIUM_ITEMS.has(i))) return "medium";
  return "low";
}

function title8k(items: string[]): string {
  const labels = items.map((i) => ITEM_LABEL_ZH[i]).filter(Boolean);
  if (!labels.length) return "8-K 公告";
  return labels.slice(0, 3).join(" · ");
}

/** 懒回补：现场拉一次 SEC submissions 并落库（与 scripts/equity/sync-sec.ts 同构） */
export async function ingestSecFilingsForSymbol(
  symbol: string,
  cik: string,
  opts: { lookbackDays?: number } = {},
): Promise<number> {
  void cik;
  const result = await syncSecFilings({ symbols: [symbol], lookbackDays: opts.lookbackDays ?? 750 });
  if (result.failed) throw new Error("SEC 同步失败");
  return result.upserted;
}

/**
 * 事件聚合主入口。filings 为空且给了 cik 时懒回补一次（失败静默，UI 空态兜底）。
 * from/to（YYYY-MM-DD）用于收窄 SEC 与日线读取，避免 chart-markers 拖全历史进内存。
 */
export async function loadStockEvents(
  symbol: string,
  opts: {
    cik?: string | null;
    types?: StockEventType[] | null;
    limit?: number;
    from?: string;
    to?: string;
    includeDisclosure?: boolean;
  } = {},
): Promise<StockEvent[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 80));
  const fromDay = opts.from?.slice(0, 10);
  const toDay = opts.to?.slice(0, 10);

  const filingWhere: Prisma.SecFilingWhereInput = {
    ...(opts.cik ? { cik: opts.cik.replace(/\D/g, "").padStart(10, "0") } : { symbol }),
    form: { in: ["8-K", "8-K/A", "10-Q", "10-K", "10-Q/A", "10-K/A"] },
  };
  if (fromDay || toDay) {
    filingWhere.filedAt = {
      ...(fromDay ? { gte: new Date(`${fromDay}T00:00:00.000Z`) } : {}),
      ...(toDay ? { lte: new Date(`${toDay}T23:59:59.999Z`) } : {}),
    };
  }

  const filingSelect = {
    accession: true, reportPeriodEnd: true, form: true, filedAt: true, url: true, items: true,
    createdAt: true, dailyStatus: true, dailyProcessedAt: true,
    acceptedAt: true, acceptedAtSource: true, publishedAt: true, publishedOn: true, publicationSource: true,
    earningsRelease: Boolean(opts.includeDisclosure),
  } satisfies Prisma.SecFilingSelect;

  let filings = await prisma.secFiling.findMany({
    where: filingWhere,
    orderBy: { filedAt: "desc" },
    take: 300,
    select: filingSelect,
  });
  if (!filings.length && opts.cik && !opts.includeDisclosure) {
    try {
      await ingestSecFilingsForSymbol(symbol, opts.cik);
      filings = await prisma.secFiling.findMany({
        where: filingWhere,
        orderBy: { filedAt: "desc" },
        take: 300,
        select: filingSelect,
      });
    } catch {
      // SEC 不可达时保持空，脚本路径兜底
    }
  }

  const [splits, quarters] = await Promise.all([
    prisma.equitySplit.findMany({ where: { symbol }, orderBy: { exDate: "desc" }, take: 20 }),
    prisma.equityFundamentalSnapshot.findMany({
      where: { symbol, periodType: "Q" },
      orderBy: { asOf: "desc" },
      take: 24,
      select: {
        period: true,
        fiscalDate: true,
        fiscalQuarter: true,
        asOf: true,
        revenue: true,
        revenueYoY: true,
        eps: true,
        epsYoY: true,
      },
    }),
  ]);

  // T+1 反应用 adjClose：只取事件日期邻域，不拉全历史
  const dateCandidates: number[] = [];
  for (const f of filings) {
    dateCandidates.push(f.filedAt.getTime());
    if (f.publishedAt) dateCandidates.push(f.publishedAt.getTime());
    if (f.publishedOn) dateCandidates.push(f.publishedOn.getTime());
    if (f.acceptedAt) dateCandidates.push(f.acceptedAt.getTime());
  }
  for (const s of splits) {
    const t = s.exDate.getTime();
    if (fromDay && s.exDate.toISOString().slice(0, 10) < fromDay) continue;
    if (toDay && s.exDate.toISOString().slice(0, 10) > toDay) continue;
    dateCandidates.push(t);
  }

  let dailyBars: { date: Date; adjClose: number }[] = [];
  if (dateCandidates.length > 0) {
    const minMs = Math.min(...dateCandidates) - 14 * 86_400_000;
    const maxMs = Math.max(...dateCandidates) + 21 * 86_400_000;
    dailyBars = await getDailyCloseRowsDbOnly({ symbols: [symbol], from: new Date(minMs), to: new Date(maxMs) });
  }

  const reactionBars = dailyBars.map(bar => ({ date: bar.date.toISOString().slice(0, 10), close: bar.adjClose }));

  // 财报 filing → 最近一季快照：fiscalDate ∈ [filedAt−maxLagDays, filedAt]。
  // 10-Q/10-K 用 100d（披露滞后財季末最多一季+缓冲）；8-K 2.02 业绩稿用 45d——
  // 它先于 10-Q 落地，宽窗口会在新季 XBRL 未入库时错挂上一季数据。
  const findMetrics = (filedAt: Date, maxLagDays: number): StockEventMetrics | null => {
    const filedMs = filedAt.getTime();
    let best: (typeof quarters)[number] | null = null;
    for (const q of quarters) {
      const fd = (q.fiscalDate ?? q.asOf).getTime();
      if (fd > filedMs || fd < filedMs - maxLagDays * 86_400_000) continue;
      const bestFd = best ? (best.fiscalDate ?? best.asOf).getTime() : -Infinity;
      if (fd > bestFd) best = q;
    }
    return best
      ? {
          period: best.period,
          fiscalQuarter: best.fiscalQuarter,
          revenue: best.revenue,
          revenueYoY: best.revenueYoY,
          eps: best.eps,
          epsYoY: best.epsYoY,
        }
      : null;
  };

  const events: StockEvent[] = [];
  const references = filings.filter(filing => filing.form === "10-Q" || filing.form === "10-K")
    .flatMap(filing => filing.reportPeriodEnd ? [{
      periodEnd: filing.reportPeriodEnd.toISOString().slice(0, 10),
      fiscalQuarter: quarters.find(quarter => quarter.fiscalDate?.getTime() === filing.reportPeriodEnd!.getTime())?.fiscalQuarter ?? null,
    }] : []);
  const versions = opts.includeDisclosure ? await prisma.equityFundamentalVintage.findMany({
    where: { symbol, accession: { in: filings.map(filing => filing.accession) }, periodType: "Q",
      fiscalDate: { in: filings.flatMap(filing => filing.reportPeriodEnd ? [filing.reportPeriodEnd] : []) } },
    select: { accession: true, fiscalDate: true, filedAt: true, revenue: true, revenueYoY: true, eps: true,
      epsYoY: true, netIncome: true, opMargin: true },
    orderBy: { filedAt: "desc" },
  }) : [];
  const findVersion = (accession: string, periodEnd: string | null): EarningsFactVersion | undefined => {
    const row = versions.find(version => version.accession === accession && version.fiscalDate?.toISOString().slice(0, 10) === periodEnd);
    const filing = filings.find(item => item.accession === accession);
    return row && filing && row.fiscalDate ? { ...row, fiscalDate: row.fiscalDate.toISOString().slice(0, 10),
      filedAt: row.filedAt.toISOString().slice(0, 10), sourceUrl: filing.url } : undefined;
  };

  for (const f of filings) {
    const filedDate = f.filedAt.toISOString().slice(0, 10);
    const isEarningsRelease = f.form.startsWith("8-K") && parse8kItems(f.items).includes("2.02");
    const publicationDay = f.publishedAt ? easternParts(f.publishedAt).date : f.publishedOn?.toISOString().slice(0, 10) ?? null;
    const dateIso = isEarningsRelease && publicationDay ? publicationDay : f.acceptedAt ? easternParts(f.acceptedAt).date : filedDate;
    const timing: NonNullable<StockEvent["timing"]> = {
      filedDate, acceptedAt: f.acceptedAt?.toISOString() ?? null, acceptedAtSource: f.acceptedAtSource,
      publishedAt: f.publishedAt?.toISOString() ?? null, publishedOn: f.publishedOn?.toISOString().slice(0, 10) ?? null,
      publicationSource: f.publicationSource, session: disclosureSession(f.publishedAt), acceptedSession: disclosureSession(f.acceptedAt),
      displayBasis: isEarningsRelease && publicationDay ? "company-publication" : f.acceptedAt ? "sec-acceptance" : "filing-date",
    };
    const baseForm = f.form.replace("/A", "");
    const attachments = opts.includeDisclosure ? readReleaseAttachments(f.earningsRelease) : [];
    const periodEnd = baseForm === "10-Q" || baseForm === "10-K"
      ? f.reportPeriodEnd?.toISOString().slice(0, 10) ?? null
      : f.items?.split(",").some(item => item.trim() === "2.02")
        ? releasePeriodEnd(attachments.map(attachment => attachment.text).join("\n"), filedDate, references) : null;
    const sourceReport = isEarningsRelease ? filings.find(filing => (filing.form === "10-Q" || filing.form === "10-K") && filing.reportPeriodEnd?.toISOString().slice(0, 10) === periodEnd) : f;
    const version = sourceReport ? findVersion(sourceReport.accession, periodEnd) : undefined;
    const brief = opts.includeDisclosure && (isEarningsRelease || baseForm === "10-Q" || baseForm === "10-K")
      ? buildBasicEarningsBrief(periodEnd, attachments, version) : undefined;
    const disclosure = opts.includeDisclosure ? {
      accession: f.accession, periodEnd,
      collectedAt: f.createdAt.toISOString(),
      status: f.dailyStatus,
      processedAt: f.dailyProcessedAt?.toISOString() ?? null,
      attachments,
    } : undefined;
    if (baseForm === "10-Q" || baseForm === "10-K") {
      // 修订件（/A）滞后原财季数月，100 天窗口会错配到下一季 → 不内嵌 metrics
      const isAmendment = f.form.endsWith("/A");
      const metrics = isAmendment ? null : findMetrics(f.filedAt, 100);
      const isAnnual = baseForm === "10-K";
      events.push({
        type: isAnnual ? "annual" : "earnings",
        date: dateIso,
        titleZh:
          (isAnnual ? "年报" : "季报") +
          (metrics ? ` ${metrics.period}` : "") +
          (f.form.endsWith("/A") ? "（修订）" : ""),
        form: f.form,
        items: [],
        importance: "high",
        url: f.url,
        metrics,
        splitRatio: null,
        reaction: eventReaction(f.acceptedAt, "sec-accepted", reactionBars).value,
        reactionDetails: eventReaction(f.acceptedAt, "sec-accepted", reactionBars), timing,
        ...(brief ? { brief } : {}),
        ...(disclosure ? { disclosure } : {}),
      });
    } else {
      const items = parse8kItems(f.items);
      const isEarnings8k = items.includes("2.02");
      events.push({
        type: "8k",
        date: dateIso,
        titleZh: title8k(items) + (f.form.endsWith("/A") ? "（修订）" : ""),
        form: f.form,
        items,
        importance: importanceOf8k(items),
        url: f.url,
        metrics: isEarnings8k ? findMetrics(f.filedAt, 45) : null,
        splitRatio: null,
        reaction: isEarnings8k ? eventReaction(f.publishedAt, "company-release", reactionBars).value : null,
        ...(isEarnings8k ? { reactionDetails: eventReaction(f.publishedAt, "company-release", reactionBars) } : {}), timing,
        ...(brief ? { brief } : {}),
        ...(disclosure ? { disclosure } : {}),
      });
    }
  }

  for (const s of splits) {
    const num = Number.isInteger(s.numerator) ? s.numerator : s.numerator.toFixed(2);
    const den = Number.isInteger(s.denominator) ? s.denominator : s.denominator.toFixed(2);
    events.push({
      type: "split",
      date: s.exDate.toISOString().slice(0, 10),
      titleZh: `拆股 ${num}:${den}`,
      form: null,
      items: [],
      importance: "high",
      url: null,
      metrics: null,
      splitRatio: `${num}:${den}`,
      reaction: null,
    });
  }

  const typeFilter = opts.types?.length ? new Set(opts.types) : null;
  if(!typeFilter || typeFilter.has("insider-plan")) {
    const today=new Date().toISOString().slice(0,10);
    const asOf=toDay&&toDay<today?toDay:today;
    const plans=await loadOwnershipPlanDisclosures(symbol,asOf);
    for(const plan of plans.filter(p=>p.verified)) {
      const maximum=plan.maxShares==null?"上限未核实":`最多 ${plan.maxShares.toLocaleString("en-US")} 股`;
      const dates=[{date:plan.filedAt,title:`${plan.ownerName} · 10b5-1 ${plan.status==="terminated"?"计划终止披露":"计划披露"} · ${maximum}`}];
      if(plan.start && plan.start>=asOf && (!plan.terminated || plan.terminated>asOf) && (!plan.end || plan.end>=asOf)) dates.push({date:plan.start,title:`${plan.ownerName} · 10b5-1 条件性执行窗口开始 · ${maximum}`});
      for(const event of dates) if((!fromDay||event.date>=fromDay)&&(!toDay||event.date<=toDay)) events.push({type:"insider-plan",date:event.date,titleZh:event.title,form:null,items:[],importance:"medium",url:plan.sourceUrl,metrics:null,splitRatio:null,reaction:null});
    }
  }
  return events
    .filter((e) => !typeFilter || typeFilter.has(e.type))
    .filter(e => (!fromDay || e.date >= fromDay) && (!toDay || e.date <= toDay))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}
