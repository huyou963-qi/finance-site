/**
 * 个股事件时间线聚合（Phase 3 / P10-A3）：
 * 三源归并 —— sec_filing（10-Q/10-K/8-K）+ equity_split（拆股）+ 季度快照（业绩 metrics 内嵌）。
 * 库内无 filing 时懒回补一次 SEC submissions（同基本面懒回补模式，脚本 sync-sec 仍是主路径）。
 */

import { prisma } from "@/lib/prisma";

export type StockEventType = "earnings" | "annual" | "8k" | "split";
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
  /** ISO 日期（filedAt / 拆股 exDate） */
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
  /** 披露次交易日涨跌幅（业绩类事件，adjClose 口径现算不落库） */
  reaction: number | null;
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
  const lookbackDays = opts.lookbackDays ?? 750;
  const cutoff = Date.now() - lookbackDays * 86_400_000;
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  const forms = new Set(["8-K", "10-Q", "10-K", "8-K/A", "10-Q/A", "10-K/A"]);

  const res = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, {
    headers: {
      "User-Agent":
        process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-fundamentals admin@hblook.com",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SEC submissions HTTP ${res.status}`);
  const data = (await res.json()) as {
    filings?: {
      recent?: {
        accessionNumber?: string[];
        form?: string[];
        filingDate?: string[];
        items?: string[];
        primaryDocument?: string[];
        primaryDocDescription?: string[];
      };
    };
  };
  const recent = data.filings?.recent;
  const accessions = recent?.accessionNumber ?? [];
  const formArr = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const itemsArr = recent?.items ?? [];
  const primaryDocs = recent?.primaryDocument ?? [];
  const primaryDescs = recent?.primaryDocDescription ?? [];
  const n = Math.min(accessions.length, formArr.length, dates.length);

  let upserted = 0;
  for (let i = 0; i < n; i++) {
    const form = formArr[i]!;
    if (!forms.has(form)) continue;
    const filed = dates[i]!;
    const filedMs = Date.parse(`${filed}T00:00:00Z`);
    if (!Number.isFinite(filedMs) || filedMs < cutoff) continue;
    const accession = accessions[i]!;
    const primaryDocument = primaryDocs[i]?.trim().slice(0, 256) || null;
    const noDash = accession.replace(/-/g, "");
    const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${noDash}`;
    const url = primaryDocument ? `${base}/${primaryDocument}` : `${base}/${accession}-index.htm`;
    await prisma.secFiling.upsert({
      where: { cik_accession: { cik: padded, accession } },
      create: {
        cik: padded,
        symbol,
        accession,
        form,
        filedAt: new Date(`${filed}T00:00:00.000Z`),
        url,
        items: itemsArr[i]?.trim().slice(0, 64) || null,
        primaryDocument,
        primaryDocDescription: primaryDescs[i]?.trim().slice(0, 256) || null,
      },
      update: {
        symbol,
        form,
        filedAt: new Date(`${filed}T00:00:00.000Z`),
        url,
        items: itemsArr[i]?.trim().slice(0, 64) || null,
        primaryDocument,
        primaryDocDescription: primaryDescs[i]?.trim().slice(0, 256) || null,
      },
    });
    upserted += 1;
  }
  return upserted;
}

/**
 * 事件聚合主入口。filings 为空且给了 cik 时懒回补一次（失败静默，UI 空态兜底）。
 */
export async function loadStockEvents(
  symbol: string,
  opts: { cik?: string | null; types?: StockEventType[] | null; limit?: number } = {},
): Promise<StockEvent[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 80));

  let filings = await prisma.secFiling.findMany({
    where: { symbol },
    orderBy: { filedAt: "desc" },
    take: 300,
  });
  if (!filings.length && opts.cik) {
    try {
      await ingestSecFilingsForSymbol(symbol, opts.cik);
      filings = await prisma.secFiling.findMany({
        where: { symbol },
        orderBy: { filedAt: "desc" },
        take: 300,
      });
    } catch {
      // SEC 不可达时保持空，脚本路径兜底
    }
  }

  const [splits, quarters, dailyBars] = await Promise.all([
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
    // T+1 反应用 adjClose（跨拆股/分红不失真）；只读库，价格由个股页/脚本回补
    prisma.equityDailyBar.findMany({
      where: { symbol },
      orderBy: { date: "asc" },
      select: { date: true, adjClose: true },
    }),
  ]);

  // 披露次交易日涨跌幅：prev = 披露日当日或之前最近一根，next = 其后第一根
  const barDates = dailyBars.map((b) => b.date.toISOString().slice(0, 10));
  const computeReaction = (dateIso: string): number | null => {
    if (!barDates.length) return null;
    // 二分找第一个 > dateIso 的位置
    let lo = 0;
    let hi = barDates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (barDates[mid]! <= dateIso) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0 || lo >= dailyBars.length) return null;
    const prev = dailyBars[lo - 1]!.adjClose;
    const next = dailyBars[lo]!.adjClose;
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0) return null;
    return next / prev - 1;
  };

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

  for (const f of filings) {
    const dateIso = f.filedAt.toISOString().slice(0, 10);
    const baseForm = f.form.replace("/A", "");
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
        reaction: computeReaction(dateIso),
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
        reaction: isEarnings8k ? computeReaction(dateIso) : null,
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
  return events
    .filter((e) => !typeFilter || typeFilter.has(e.type))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}
