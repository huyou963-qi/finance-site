/**
 * SEC EDGAR XBRL companyfacts → 三大报表标准化字段（免密钥）。
 * https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 *
 * 标准化策略：不同公司在 10-Q/10-K 中的报表科目名称各异，这里统一映射到
 * 固定的 US-GAAP XBRL tag 集（利润表/资产负债表/现金流量表各取若干核心科目），
 * 每个标准化字段配一组候选 tag 按优先级回退，跨公司口径一致。
 */

export type SecFundamentalSnapshot = {
  period: string;
  asOf: string;
  revenue: number | null;
  revenueYoY: number | null;
  eps: number | null;
  epsYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
};

export type SecFactPoint = {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  fp?: string;
  filed?: string;
  frame?: string;
  accn?: string;
  fy?: number;
};

type SecConcept = {
  units?: Record<string, SecFactPoint[]>;
};

// SEC 公平访问要求 UA 带真实域名联系邮箱。www.sec.gov/files/* 会拒绝 @localhost（403）；
// data.sec.gov/* 虽宽松，统一用合规 UA。可用 SEC_USER_AGENT 环境变量覆盖。
const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-fundamentals admin@hblook.com";

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function yoy(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return curr / prev - 1;
}

function pickUnitPoints(concept: SecConcept | undefined, unitKeys: string[]): SecFactPoint[] {
  if (!concept?.units) return [];
  for (const u of unitKeys) {
    const pts = concept.units[u];
    if (Array.isArray(pts) && pts.length) return pts;
  }
  // 任意单位兜底
  for (const pts of Object.values(concept.units)) {
    if (Array.isArray(pts) && pts.length) return pts;
  }
  return [];
}

function latestAnnual(points: SecFactPoint[]): SecFactPoint | null {
  const annual = points
    .filter((p) => p.form === "10-K" || p.fp === "FY")
    .filter((p) => typeof p.end === "string" && typeof p.val === "number")
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  return annual[0] ?? null;
}

function priorAnnual(points: SecFactPoint[], latestEnd: string): SecFactPoint | null {
  const annual = points
    .filter((p) => p.form === "10-K" || p.fp === "FY")
    .filter((p) => typeof p.end === "string" && typeof p.val === "number")
    .filter((p) => String(p.end) < latestEnd)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  return annual[0] ?? null;
}

function periodFromEnd(end: string): string {
  const y = end.slice(0, 4);
  return `${y}FY`;
}

function firstConcept(
  gaap: Record<string, SecConcept>,
  names: string[],
): SecConcept | undefined {
  for (const n of names) {
    if (gaap[n]) return gaap[n];
  }
  return undefined;
}

/**
 * companyfacts 单文件常有数 MB（大盘股 4–20MB），慢链路下 10s 不够；
 * 批量深历史回填走 `SEC_FETCH_TIMEOUT_MS`（或显式 timeoutMs）放宽，
 * 页面懒回补路径保持 10s 默认以免拖住渲染。
 */
export async function fetchSecCompanyFacts(
  cik: string,
  opts: { timeoutMs?: number } = {},
): Promise<unknown> {
  const timeoutMs =
    opts.timeoutMs ?? (Number(process.env.SEC_FETCH_TIMEOUT_MS) || 10_000);
  const padded = padCik(cik);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": SEC_UA,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`SEC companyfacts CIK${padded} HTTP ${res.status}`);
  }
  return res.json();
}

/** 从 companyfacts 提取最近两个财年，算 YoY 与利润率 */
export function extractAnnualFundamentals(facts: unknown): SecFundamentalSnapshot | null {
  if (!facts || typeof facts !== "object") return null;
  const gaap = (facts as { facts?: { "us-gaap"?: Record<string, SecConcept> } }).facts?.[
    "us-gaap"
  ];
  if (!gaap) return null;

  const revenueConcept = firstConcept(gaap, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ]);
  const epsConcept = firstConcept(gaap, ["EarningsPerShareDiluted", "EarningsPerShareBasic"]);
  const grossConcept = firstConcept(gaap, ["GrossProfit"]);
  const opConcept = firstConcept(gaap, ["OperatingIncomeLoss"]);

  const revenuePts = pickUnitPoints(revenueConcept, ["USD"]);
  const epsPts = pickUnitPoints(epsConcept, ["USD/shares", "pure"]);
  const grossPts = pickUnitPoints(grossConcept, ["USD"]);
  const opPts = pickUnitPoints(opConcept, ["USD"]);

  const revLatest = latestAnnual(revenuePts);
  if (!revLatest?.end || revLatest.val == null) return null;
  const revPrior = priorAnnual(revenuePts, revLatest.end);

  const epsLatest = latestAnnual(epsPts);
  const epsPrior = epsLatest?.end ? priorAnnual(epsPts, epsLatest.end) : null;

  const grossLatest = latestAnnual(grossPts);
  const opLatest = latestAnnual(opPts);

  const revenue = revLatest.val;
  const gross = grossLatest?.end === revLatest.end ? grossLatest.val ?? null : grossLatest?.val ?? null;
  const op = opLatest?.end === revLatest.end ? opLatest.val ?? null : opLatest?.val ?? null;

  return {
    period: periodFromEnd(revLatest.end),
    asOf: revLatest.end,
    revenue,
    revenueYoY: yoy(revenue, revPrior?.val ?? null),
    eps: epsLatest?.val ?? null,
    epsYoY: yoy(epsLatest?.val ?? null, epsPrior?.val ?? null),
    grossMargin: revenue && gross != null ? gross / revenue : null,
    opMargin: revenue && op != null ? op / revenue : null,
  };
}

// ---------------------------------------------------------------------------
// 季度三大报表标准化提取（Phase 2）
// ---------------------------------------------------------------------------

/** 标准化后的单季快照：利润表 + 资产负债表（季末时点）+ 现金流量表（单季流量） */
export type SecQuarterlyFundamentals = {
  /** 标准化标签：财报期末所在日历季度，如 "2025Q1"（跨公司对齐用） */
  period: string;
  /** 公司真实财季截止日 ISO（AAPL 的 FQ1 截止 12 月底 → period=前一年 Q4） */
  fiscalDate: string;
  /** 财季位置 1–4（由 10-K 年度期末锚定；无法确定时为 null） */
  fiscalQuarter: number | null;
  // 利润表
  revenue: number | null;
  revenueYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
  netIncome: number | null;
  eps: number | null;
  epsYoY: number | null;
  // 现金流量表（单季，YTD 已差分）
  ocf: number | null;
  capex: number | null;
  dividendsPaid: number | null;
  // 资产负债表（季末时点）
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  longTermDebt: number | null;
  cash: number | null;
  sharesOutstanding: number | null;
  /**
   * PIT：该季数据首次向市场披露日（ISO），= 各字段来源事实点首次 filed 的 max。
   * 差分派生季（如 Q4 = FY − YTD9）取参与各点首次 filed 的 max（即 10-K filed 日）。
   * 注意与去重语义分开：字段值取同期最新 filed（容纳重述），首披露日取最早 filed。
   */
  firstReportedAt: string | null;
};

/** 各标准化字段的候选 US-GAAP tag（按优先级回退，跨公司报表栏目标准化的核心映射表） */
const FLOW_CONCEPTS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "RevenuesNetOfInterestExpense",
  ],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  eps: ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
  ocf: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PaymentsForCapitalImprovements",
  ],
  dividendsPaid: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
} as const;

const INSTANT_CONCEPTS = {
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ],
  sharesOutstanding: ["CommonStockSharesOutstanding", "CommonStockSharesIssued"],
} as const;

const DAY_MS = 86_400_000;

function dateMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** 财报期末 → 日历季度标签；月初 1–3 日的期末（4-4-5 周历溢出）归入上一季度 */
export function calendarQuarterLabel(endIso: string): string {
  let y = Number(endIso.slice(0, 4));
  let m = Number(endIso.slice(5, 7));
  const d = Number(endIso.slice(8, 10));
  if (d <= 3 && (m === 1 || m === 4 || m === 7 || m === 10)) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return `${y}Q${Math.ceil(m / 3)}`;
}

function isSecPeriodicForm(form: string | undefined): boolean {
  return typeof form === "string" && (form.startsWith("10-Q") || form.startsWith("10-K"));
}

/** filed = 该季值的首次披露日 ISO（PIT），"" 表示源数据缺 filed */
type FlowQuarter = { start: string; end: string; val: number; derived: boolean; filed: string };

type DedupedDurPoint = {
  start: string;
  end: string;
  val: number;
  filed: string;
  firstFiled: string;
  days: number;
};

/** 取若干首披露日的 max（PIT：派生值要等所有参与点都披露后才可见）；"" 视为缺失不参与 */
function maxFiled(...dates: string[]): string {
  let out = "";
  for (const d of dates) if (d > out) out = d;
  return out;
}

/**
 * duration 事实点去重。两个语义分开：
 * 值取同 (start,end) 最新 filed（容纳重述）→ filed；
 * PIT 首披露日取同 (start,end) 最早 filed → firstFiled。
 */
function dedupeDurationPoints(points: SecFactPoint[]): DedupedDurPoint[] {
  const byKey = new Map<string, DedupedDurPoint>();
  for (const p of points) {
    const start = (p as { start?: string }).start;
    if (
      typeof start !== "string" ||
      typeof p.end !== "string" ||
      typeof p.val !== "number" ||
      !Number.isFinite(p.val) ||
      !isSecPeriodicForm(p.form)
    ) {
      continue;
    }
    const days = Math.round((dateMs(p.end) - dateMs(start)) / DAY_MS);
    if (days <= 0 || days > 400) continue;
    const key = `${start}|${p.end}`;
    const filed = p.filed ?? "";
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { start, end: p.end, val: p.val, filed, firstFiled: filed, days });
      continue;
    }
    if (filed > prev.filed) {
      prev.val = p.val;
      prev.filed = filed;
    }
    if (filed && (!prev.firstFiled || filed < prev.firstFiled)) {
      prev.firstFiled = filed;
    }
  }
  return [...byKey.values()];
}

function isQuarterSpan(days: number): boolean {
  return days >= 70 && days <= 100;
}

/**
 * duration 概念 → 单季流量序列。
 * 10-Q 现金流量表只披露 YTD 累计、财年错位公司的 Q4 只在 10-K 全年值里，
 * 因此除直接的 ~91 天点外，还要对累计点做差分：
 * cum(S,E) − prefix(S,E−~91d) → 推导出 (E−~91d, E] 的单季值。
 * prefix 优先取同起点原始点，缺失时用已知单季链求和兜底。
 */
export function quarterlyFlowSeries(points: SecFactPoint[]): FlowQuarter[] {
  const deduped = dedupeDurationPoints(points);
  const byEnd = new Map<string, FlowQuarter>();

  // 1) 直接单季点
  for (const p of deduped) {
    if (!isQuarterSpan(p.days)) continue;
    const prev = byEnd.get(p.end);
    if (!prev || prev.derived) {
      byEnd.set(p.end, {
        start: p.start,
        end: p.end,
        val: p.val,
        derived: false,
        filed: p.firstFiled,
      });
    }
  }

  // 2) 累计点差分（H1→Q2、YTD9→Q3、FY→Q4），按时长从短到长处理使推导链可级联
  const cums = deduped.filter((p) => p.days > 100).sort((a, b) => a.days - b.days);
  for (const c of cums) {
    const existing = byEnd.get(c.end);
    if (existing && !existing.derived) continue;

    // prefix：同起点、终点在 c.end 前 ~1 个季度的原始累计/单季点
    const cEndMs = dateMs(c.end);
    let prefix: DedupedDurPoint | null = null;
    for (const p of deduped) {
      if (p.start !== c.start || p.end >= c.end) continue;
      const gap = Math.round((cEndMs - dateMs(p.end)) / DAY_MS);
      if (!isQuarterSpan(gap)) continue;
      if (!prefix || p.filed > prefix.filed) prefix = p;
    }

    if (prefix) {
      byEnd.set(c.end, {
        start: prefix.end,
        end: c.end,
        val: c.val - prefix.val,
        derived: true,
        // 派生值要等参与差分的两个点都披露后市场才能算出
        filed: maxFiled(c.firstFiled, prefix.firstFiled),
      });
      continue;
    }

    // 兜底：用已知单季链从 c.start 铺到剩最后一个季度
    let cursorMs = dateMs(c.start);
    let sum = 0;
    let ok = true;
    let chainFiled = c.firstFiled;
    for (let i = 0; i < 4; i++) {
      const remain = Math.round((cEndMs - cursorMs) / DAY_MS);
      if (isQuarterSpan(remain + 1)) break; // 只剩最后一季
      let next: FlowQuarter | null = null;
      for (const q of byEnd.values()) {
        if (Math.abs(dateMs(q.start) - cursorMs) <= 7 * DAY_MS && dateMs(q.end) < cEndMs) {
          if (!next || q.end < next.end) next = q;
        }
      }
      if (!next) {
        ok = false;
        break;
      }
      sum += next.val;
      chainFiled = maxFiled(chainFiled, next.filed);
      cursorMs = dateMs(next.end);
    }
    const lastSpan = Math.round((cEndMs - cursorMs) / DAY_MS);
    if (ok && isQuarterSpan(lastSpan + 1)) {
      byEnd.set(c.end, {
        start: new Date(cursorMs).toISOString().slice(0, 10),
        end: c.end,
        val: c.val - sum,
        derived: true,
        filed: chainFiled,
      });
    }
  }

  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
}

/** 值 = 同 end 最新 filed（容纳重述）；firstFiled = 同 end 最早 filed（PIT 首披露日） */
type InstantPoint = { val: number; firstFiled: string };

/** instant 概念 → 季末时点值 */
function instantSeries(points: SecFactPoint[]): Map<string, InstantPoint> {
  const filedByEnd = new Map<string, string>();
  const out = new Map<string, InstantPoint>();
  for (const p of points) {
    if (
      typeof p.end !== "string" ||
      typeof p.val !== "number" ||
      !Number.isFinite(p.val) ||
      !isSecPeriodicForm(p.form)
    ) {
      continue;
    }
    const filed = p.filed ?? "";
    const prevFiled = filedByEnd.get(p.end);
    const prev = out.get(p.end);
    if (prevFiled == null || filed > prevFiled) {
      filedByEnd.set(p.end, filed);
      out.set(p.end, {
        val: p.val,
        firstFiled: prev && prev.firstFiled && (!filed || prev.firstFiled < filed)
          ? prev.firstFiled
          : filed,
      });
    } else if (prev && filed && (!prev.firstFiled || filed < prev.firstFiled)) {
      prev.firstFiled = filed;
    }
  }
  return out;
}

/**
 * flow 候选 tag 择优。两类陷阱：
 * 1. 公司会换 tag：JPM 的 Revenues 2014 后只剩零星年度点（现行 RevenuesNetOfInterestExpense）、
 *    AAPL 的 PaymentsOfDividendsCommonStock 2017 后停用（现行 PaymentsOfDividends）。
 *    因此以「推导出的季度序列能延伸到多近」为主评分，而非候选表顺序。
 * 2. 金融公司的 RevenueFromContractWithCustomer 只含手续费收入，总收入量级更大——
 *    营收字段开 magnitudeTieBreak，末端相近的候选取量级更大者；
 *    其他字段（如 EPS 稀释 vs 基本）末端相近时保持候选表优先级。
 */
function pickFlowQuarterSeries(
  gaap: Record<string, SecConcept>,
  names: readonly string[],
  unitKeys: string[],
  opts: { magnitudeTieBreak?: boolean; extraSeries?: FlowQuarter[][] } = {},
): FlowQuarter[] {
  type Cand = { series: FlowQuarter[]; lastEnd: string; magnitude: number };
  const cands: Cand[] = [];
  const addCand = (series: FlowQuarter[]) => {
    if (!series.length) return;
    const last4 = series.slice(-4);
    cands.push({
      series,
      lastEnd: series[series.length - 1]!.end,
      magnitude: last4.reduce((s, q) => s + Math.abs(q.val), 0),
    });
  };
  for (const name of names) addCand(quarterlyFlowSeries(pickUnitPoints(gaap[name], unitKeys)));
  // 合成候选（如「商品+服务」营收）排在具名 tag 之后：只作拼接来源，不抢主候选
  for (const s of opts.extraSeries ?? []) addCand(s);
  if (!cands.length) return [];

  const maxEndMs = Math.max(...cands.map((c) => dateMs(c.lastEnd)));
  const fresh = cands.filter((c) => (maxEndMs - dateMs(c.lastEnd)) / DAY_MS <= 100);
  let best = fresh[0]!;
  if (opts.magnitudeTieBreak) {
    for (const c of fresh.slice(1)) {
      if (c.magnitude > best.magnitude * 1.05) best = c;
    }
  }

  const merged = best.series.map((q) => ({ ...q }));

  // 换 tag 时代拼接（深历史的关键）：主候选只覆盖「现行 tag 时代」——AAPL 的
  // RevenueFromContractWithCustomer 只到 2017-09、MSFT 只到 2016-06，更早的营收在
  // SalesRevenueNet 下（2007/2009 起）。把口径一致的旧时代段接到前面，历史才能回到
  // 2010 以前；不接则整条链路（TTM/估值/成长）在换 tag 年份处硬截断。
  // 安全阀：只接重叠期一致（eraSegmentsAgree）的候选，可链式接多代（新 tag→SalesRevenueNet→Revenues）。
  const splicedFrom = new Set<(typeof cands)[number]>([best]);
  for (;;) {
    const earliest = merged[0]?.end;
    if (!earliest) break;
    let picked: { cand: (typeof cands)[number]; factor: number } | null = null;
    for (const c of cands) {
      if (splicedFrom.has(c) || !c.series.some((q) => q.end < earliest)) continue;
      const factor = eraSpliceFactor(merged, c.series);
      if (factor == null) continue;
      picked = { cand: c, factor };
      break;
    }
    if (!picked) break;
    splicedFrom.add(picked.cand);
    merged.unshift(
      ...picked.cand.series
        .filter((q) => q.end < earliest)
        .map((q) => ({ ...q, val: q.val * picked!.factor })),
    );
  }

  // PIT 首披露日跨候选合并：换 tag 公司（GOOGL 2025 起换营收 tag）在新 tag 下的
  // 旧季度事实来自后续财报对比列（firstFiled 晚一年），但市场当时在旧 tag 下已见到
  // 同一数值。同 (end) 且值接近（±2%）的其他候选若首披露更早，则采用其更早 filed；
  // 值差大的不合并（JPM 手续费收入 vs 总收入是不同口径，早披露不等于本口径可见）。
  for (const c of cands) {
    if (c === best) continue;
    const byEnd = new Map(c.series.map((q) => [q.end, q]));
    for (const q of merged) {
      const o = byEnd.get(q.end);
      if (!o?.filed) continue;
      const tol = 0.02 * Math.max(Math.abs(q.val), Math.abs(o.val));
      if (Math.abs(q.val - o.val) <= tol && (!q.filed || o.filed < q.filed)) {
        q.filed = o.filed;
      }
    }
  }
  return merged;
}

/** 换 tag 时代拼接的重叠门槛：至少 2 个重叠季 */
const ERA_SPLICE_MIN_OVERLAP = 2;
/**
 * 只取**接缝处那段连续重叠**估比值：从主序列最早端起，遇到第一个没有重叠的季就停。
 * 拼接要的是接缝处的水平连续性；离接缝远的零星重叠往往已是垃圾点
 * （ORCL 的 Revenues 2018 后只剩 FY 点，差分出的「季度」只有真值的 28%，
 * 把它们计进中位数会否掉这条在接缝处 99% 吻合的旧序列）。上限兜底 12 季。
 */
const ERA_SPLICE_MAX_SAMPLES = 12;
/**
 * 重叠期比值必须稳定：偏离中位数的**中位数** ≤2%。
 * 取中位数而非最大值——ASC606 过渡期常有个别季被重述（MSFT 7 个重叠季里 6 个完全一致、
 * 1 个差 9.8%），按最大值会把这类可靠拼接一并拒掉；而真正的异口径（KO 的
 * Revenues vs SalesRevenueGoodsNet 各季 ±5% 乱跳）中位偏离本身就超阈值，仍会被拒。
 */
const ERA_SPLICE_RATIO_STABILITY = 0.02;
/** 比值中位数须落在此带内：±15% 视为同口径的细微差（如「商品营收」漏掉少量服务收入），
 *  超出（如银行手续费 vs 总收入的 3 倍）是两回事，拒绝拼接 */
const ERA_SPLICE_RATIO_MIN = 0.85;
const ERA_SPLICE_RATIO_MAX = 1.18;

/**
 * 换 tag 时代拼接的链接系数：旧序列 × 系数 = 主序列刻度。
 * 返回 null = 不可拼接（重叠不足 / 比值不稳 / 量级差太大）。
 *
 * 为什么要系数而不是直接接上：ASC606 之前的营收 tag 常只覆盖「商品」部分，
 * 比总营收低几个点（KO 实测 5.2%）。直接接会在接缝处造出假的营收 YoY，
 * 并让旧时代的 salesYield 系统性偏低；按重叠期的稳定比值链接则两者都消掉。
 * 拒绝拼接时表现为「缺失」而非错值（沿用 Phase 1 三道守卫的口径）。
 */
function eraSpliceFactor(
  main: readonly { end: string; val: number }[],
  older: readonly { end: string; val: number }[],
): number | null {
  const olderByEnd = new Map(older.map((q) => [q.end, q.val]));
  const ratios: number[] = [];
  // main 已按期末升序 → 从最早（= 最靠近接缝）开始取那段**连续**重叠
  for (const q of main) {
    const o = olderByEnd.get(q.end);
    if (o == null || o === 0 || q.val === 0) {
      if (ratios.length) break; // 连续段结束
      continue; // 还没进入重叠段
    }
    ratios.push(q.val / o);
    if (ratios.length >= ERA_SPLICE_MAX_SAMPLES) break;
  }
  if (ratios.length < ERA_SPLICE_MIN_OVERLAP) return null;
  const sorted = [...ratios].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  if (!Number.isFinite(median) || median <= 0) return null;
  if (median < ERA_SPLICE_RATIO_MIN || median > ERA_SPLICE_RATIO_MAX) return null;
  const devs = ratios.map((r) => Math.abs(r / median - 1)).sort((x, y) => x - y);
  if (devs[Math.floor(devs.length / 2)]! > ERA_SPLICE_RATIO_STABILITY) return null;
  return median;
}

/** 两条单季序列按同期末求和（仅两侧都有值的季度），用于银行合成营收 */
function sumFlowSeries(a: FlowQuarter[], b: FlowQuarter[]): FlowQuarter[] {
  const bByEnd = new Map(b.map((q) => [q.end, q]));
  const out: FlowQuarter[] = [];
  for (const qa of a) {
    const qb = bByEnd.get(qa.end);
    if (!qb) continue;
    out.push({
      start: qa.start,
      end: qa.end,
      val: qa.val + qb.val,
      derived: qa.derived || qb.derived,
      filed: maxFiled(qa.filed, qb.filed),
    });
  }
  return out;
}

/** instant 候选 tag 择优：同样按时点序列末端新鲜度选，末端相近保持候选表优先级 */
function pickInstantSeries(
  gaap: Record<string, SecConcept>,
  names: readonly string[],
  unitKeys: string[],
): Map<string, InstantPoint> {
  type Cand = { series: Map<string, InstantPoint>; lastEnd: string };
  const cands: Cand[] = [];
  for (const name of names) {
    const series = instantSeries(pickUnitPoints(gaap[name], unitKeys));
    if (!series.size) continue;
    cands.push({ series, lastEnd: [...series.keys()].sort().at(-1)! });
  }
  if (!cands.length) return new Map();
  const maxEndMs = Math.max(...cands.map((c) => dateMs(c.lastEnd)));
  const fresh = cands.filter((c) => (maxEndMs - dateMs(c.lastEnd)) / DAY_MS <= 100);
  const best = fresh[0]!;

  // PIT 首披露日跨候选合并（同 pickFlowQuarterSeries）：同 end 值接近（±2%）的
  // 其他候选若首披露更早，采用其更早 firstFiled（换 tag 后旧期末只出现在对比列的场景）
  const merged = new Map([...best.series].map(([end, p]) => [end, { ...p }]));
  for (const c of cands) {
    if (c === best) continue;
    for (const [end, o] of c.series) {
      if (!o.firstFiled) continue;
      const m = merged.get(end);
      if (!m) continue;
      const tol = 0.02 * Math.max(Math.abs(m.val), Math.abs(o.val));
      if (Math.abs(m.val - o.val) <= tol && (!m.firstFiled || o.firstFiled < m.firstFiled)) {
        m.firstFiled = o.firstFiled;
      }
    }
  }
  return merged;
}

function yoyQuarter(series: FlowQuarter[], idx: number): number | null {
  const curr = series[idx]!;
  const currEndMs = dateMs(curr.end);
  for (let j = idx - 1; j >= 0; j--) {
    const gap = Math.round((currEndMs - dateMs(series[j]!.end)) / DAY_MS);
    if (gap >= 330 && gap <= 400) return yoy(curr.val, series[j]!.val);
    if (gap > 400) break;
  }
  return null;
}

/** 拆股/并股因子只会是简单整数比 */
const SPLIT_FACTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 100];

/**
 * 候选倍数 = 1 + 单次拆股 + **同向两次复合**（AAPL 2014 的 7:1 叠 2020 的 4:1 = 28，
 * 单因子表里没有 28，深历史里两次拆股会在一步内被跨过——只给单因子会误选 25/30）。
 * 只做同向复合、上限 200：混向乘积（5/4=1.25、4/3=1.33…）会落进自然漂移带，
 * 把大额回购/增发误判成拆股。
 */
const SPLIT_CANDIDATES = (() => {
  const up = new Set<number>(SPLIT_FACTORS);
  for (const a of SPLIT_FACTORS) {
    for (const b of SPLIT_FACTORS) {
      if (a * b <= 200) up.add(a * b);
    }
  }
  return [1, ...up, ...[...up].map((f) => 1 / f)];
})();

/** 自然漂移带（回购/增发）：相邻比值落此带内不认为发生拆股 */
const DRIFT_BAND_LOG = Math.log(1.33);
/**
 * 脏点门槛：与参考差 20 倍以上、又无法用任何拆股因子解释的点（如 AAPL 2014-03-29 的
 * CommonStockSharesOutstanding = 8.6e5，比真值小 4 个数量级）。这类点若被「接受为新参考」，
 * 会把它之前的全部历史钉死在错误刻度上（实测：AAPL 2008–2013 股本整段留在拆股前刻度，
 * PIT 市值差 28 倍）。故判为脏点：丢弃该点且不更新参考。
 */
const JUNK_RATIO = 20;

/**
 * 股本类序列的拆股口径归一（后向游走）。
 * 问题：XBRL 历史点是否按最新拆股口径重述，取决于「该期末最后一次被哪份财报披露」，
 * 因此拆股后（如 DECK 2024-09 的 6:1）序列会混杂拆前/拆后口径、甚至交替跳变。
 * 做法：从最新值往回走，相邻比值落在 [0.75,1.33] 视为自然漂移；否则尝试乘/除一个
 * 拆股倍数把它拉回参考带。
 *
 * 返回每行「换算到最新口径」的乘数；**null = 该点判为脏值，调用方应丢弃**。
 */
export function scaleFactorsBackward(values: (number | null)[]): (number | null)[] {
  const factors: (number | null)[] = new Array(values.length).fill(1);
  let ref: number | null = null;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    if (ref == null) {
      ref = v;
      continue;
    }
    // 容差带内可能有多个因子命中（如 ×5 与 ×6 都落带内），取对数偏差最小者
    let best = 1;
    let bestDev = Infinity;
    for (const f of SPLIT_CANDIDATES) {
      const dev = Math.abs(Math.log((v * f) / ref));
      if (dev < bestDev) {
        bestDev = dev;
        best = f;
      }
    }
    if (bestDev <= DRIFT_BAND_LOG) {
      factors[i] = best;
      ref = v * best;
    } else if (Math.max(v / ref, ref / v) > JUNK_RATIO) {
      factors[i] = null; // 脏点：丢弃，参考不动（否则毒化其之前的整段历史）
    } else {
      // 无法用拆股解释的跳变（大额增发/回购等）：接受为新参考，不做换算
      ref = v;
    }
  }
  return factors;
}

/** dei.EntityCommonStockSharesOutstanding：封面日期滞后于季末，取季末后 120 天内最近一点 */
function deiSharesNear(facts: unknown, endIso: string): InstantPoint | null {
  const dei = (facts as { facts?: { dei?: Record<string, SecConcept> } }).facts?.dei;
  const pts = pickUnitPoints(dei?.["EntityCommonStockSharesOutstanding"], ["shares"]);
  const endMs = dateMs(endIso);
  let best: { end: string; val: number; firstFiled: string } | null = null;
  for (const p of pts) {
    if (typeof p.end !== "string" || typeof p.val !== "number" || !Number.isFinite(p.val)) continue;
    const gap = (dateMs(p.end) - endMs) / DAY_MS;
    if (gap < 0 || gap > 120) continue;
    const filed = p.filed ?? "";
    if (!best || p.end < best.end) {
      best = { end: p.end, val: p.val, firstFiled: filed };
    } else if (p.end === best.end && filed && (!best.firstFiled || filed < best.firstFiled)) {
      best.firstFiled = filed;
    }
  }
  return best ? { val: best.val, firstFiled: best.firstFiled } : null;
}

/**
 * companyfacts → 标准化季度三表序列（升序）。
 * 以营收单季序列为骨架（营收缺失的季度丢弃），其余字段尽量对齐补充。
 */
export function extractQuarterlyFundamentals(
  facts: unknown,
  opts: { maxQuarters?: number } = {},
): SecQuarterlyFundamentals[] {
  const maxQuarters = opts.maxQuarters ?? 16;
  if (!facts || typeof facts !== "object") return [];
  const gaap = (facts as { facts?: { "us-gaap"?: Record<string, SecConcept> } }).facts?.["us-gaap"];
  if (!gaap) return [];

  const flowSeries = (names: readonly string[], unitKeys: string[]) =>
    pickFlowQuarterSeries(gaap, names, unitKeys);

  // 深历史拼接来源（都不进主候选表，只在时代拼接时按口径一致性择用）：
  // 1) ASC606（2018 生效）之前营收常拆成「商品 / 服务」两个 tag —— 现行 tag 最早只到 2017
  //    （10-K 重述的对比年），2010–2016 的营收几乎都挂在旧 tag 上。只取商品会比总营收低
  //    几个点（KO 实测 5.2%），故先合成总额；纯服务公司（CRM/ORCL）则走 services 单支。
  // 2) 银行没有单一总营收 tag：总营收 = 净利息收入 + 非利息收入（与 RevenuesNetOfInterestExpense
  //    同口径）。这条**不能只作「主候选为空」的兜底**——WFC/FITB/USB 这类主候选非空但只覆盖
  //    2018 起，深历史全在 NII/非息两支里（2008 起），必须作为常备拼接来源。
  const goodsQ = pickFlowQuarterSeries(gaap, ["SalesRevenueGoodsNet"], ["USD"]);
  const servicesQ = pickFlowQuarterSeries(gaap, ["SalesRevenueServicesNet"], ["USD"]);
  const preAsc606Total = goodsQ.length && servicesQ.length ? sumFlowSeries(goodsQ, servicesQ) : [];
  const nii = pickFlowQuarterSeries(gaap, ["InterestIncomeExpenseNet"], ["USD"]);
  const nonInterest = pickFlowQuarterSeries(gaap, ["NoninterestIncome"], ["USD"]);
  const bankTotal = nii.length && nonInterest.length ? sumFlowSeries(nii, nonInterest) : [];

  const revenueQ = pickFlowQuarterSeries(gaap, FLOW_CONCEPTS.revenue, ["USD"], {
    magnitudeTieBreak: true,
    extraSeries: [preAsc606Total, goodsQ, servicesQ, bankTotal],
  });
  if (!revenueQ.length) return [];

  const grossQ = flowSeries(FLOW_CONCEPTS.grossProfit, ["USD"]);
  const opQ = flowSeries(FLOW_CONCEPTS.operatingIncome, ["USD"]);
  const niQ = flowSeries(FLOW_CONCEPTS.netIncome, ["USD"]);
  const epsQ = flowSeries(FLOW_CONCEPTS.eps, ["USD/shares", "pure"]);
  const ocfQ = flowSeries(FLOW_CONCEPTS.ocf, ["USD"]);
  const capexQ = flowSeries(FLOW_CONCEPTS.capex, ["USD"]);
  const divQ = flowSeries(FLOW_CONCEPTS.dividendsPaid, ["USD"]);

  const assetsAt = pickInstantSeries(gaap, INSTANT_CONCEPTS.totalAssets, ["USD"]);
  const liabAt = pickInstantSeries(gaap, INSTANT_CONCEPTS.totalLiabilities, ["USD"]);
  const equityAt = pickInstantSeries(gaap, INSTANT_CONCEPTS.equity, ["USD"]);
  const ltDebtAt = pickInstantSeries(gaap, INSTANT_CONCEPTS.longTermDebt, ["USD"]);
  const cashAt = pickInstantSeries(gaap, INSTANT_CONCEPTS.cash, ["USD"]);
  const sharesAt = pickInstantSeries(gaap, INSTANT_CONCEPTS.sharesOutstanding, ["shares"]);

  const flowAt = (series: FlowQuarter[], end: string): FlowQuarter | null =>
    series.find((q) => q.end === end) ?? null;

  // 财年期末集合（10-K 年度 duration 点的 end），用于财季位置锚定
  const fiscalYearEnds = new Set<string>();
  for (const name of [...FLOW_CONCEPTS.revenue, ...FLOW_CONCEPTS.netIncome, ...FLOW_CONCEPTS.ocf]) {
    for (const p of dedupeDurationPoints(pickUnitPoints(gaap[name], ["USD"]))) {
      if (p.days >= 330) fiscalYearEnds.add(p.end);
    }
  }

  // 多取 4 季缓冲：拆股归一后重算 epsYoY 需要上年同季在窗口内
  const tail = revenueQ.slice(-(maxQuarters + 4));
  const out: SecQuarterlyFundamentals[] = [];
  const epsDerived: boolean[] = [];
  for (const q of tail) {
    const idx = revenueQ.findIndex((r) => r.end === q.end);
    const revenue = q.val;
    const grossHit = flowAt(grossQ, q.end);
    const opHit = flowAt(opQ, q.end);
    const niHit = flowAt(niQ, q.end);
    const ocfHit = flowAt(ocfQ, q.end);
    const capexHit = flowAt(capexQ, q.end);
    const divHit = flowAt(divQ, q.end);
    const epsIdx = epsQ.findIndex((r) => r.end === q.end);
    const epsHit = epsIdx >= 0 ? epsQ[epsIdx]! : null;
    epsDerived.push(epsHit?.derived ?? false);

    const assetsPt = assetsAt.get(q.end) ?? null;
    const equityPt = equityAt.get(q.end) ?? null;
    const liabPt = liabAt.get(q.end) ?? null;
    const ltDebtPt = ltDebtAt.get(q.end) ?? null;
    const cashPt = cashAt.get(q.end) ?? null;
    const sharesPt = sharesAt.get(q.end) ?? deiSharesNear(facts, q.end);

    const totalAssets = assetsPt?.val ?? null;
    const equity = equityPt?.val ?? null;
    let totalLiabilities = liabPt?.val ?? null;
    if (totalLiabilities == null && totalAssets != null && equity != null) {
      totalLiabilities = totalAssets - equity;
    }

    // PIT 行级首披露日：各非空字段来源点首次 filed 的 max（缺 filed 的点不参与）。
    // 上限保护：换 tag 公司的旧季度事实往往只出现在后续财报的对比列（首次 filed 晚
    // 一整年，如 GOOGL 2025 新 tag 覆盖 2024 各季），若照收会把整行拖后。晚于本期
    // 主报告（营收骨架 filed）45 天以上的字段来源不 gate 行级首披露日——代价是该
    // 字段的值在 firstReportedAt 时点严格说尚不可见，属已记录的近似。
    const capMs = q.filed ? dateMs(q.filed) + 45 * DAY_MS : Infinity;
    let firstReportedAt = q.filed;
    for (const c of [
      grossHit?.filed,
      opHit?.filed,
      niHit?.filed,
      epsHit?.filed,
      ocfHit?.filed,
      capexHit?.filed,
      divHit?.filed,
      assetsPt?.firstFiled,
      liabPt?.firstFiled,
      equityPt?.firstFiled,
      ltDebtPt?.firstFiled,
      cashPt?.firstFiled,
      sharesPt?.firstFiled,
    ]) {
      if (c && dateMs(c) <= capMs) firstReportedAt = maxFiled(firstReportedAt, c);
    }

    out.push({
      period: calendarQuarterLabel(q.end),
      fiscalDate: q.end,
      fiscalQuarter: null,
      revenue,
      revenueYoY: yoyQuarter(revenueQ, idx),
      grossMargin: revenue !== 0 && grossHit != null ? grossHit.val / revenue : null,
      opMargin: revenue !== 0 && opHit != null ? opHit.val / revenue : null,
      netIncome: niHit?.val ?? null,
      eps: epsHit?.val ?? null,
      epsYoY: epsIdx >= 0 ? yoyQuarter(epsQ, epsIdx) : null,
      ocf: ocfHit?.val ?? null,
      capex: capexHit?.val ?? null,
      dividendsPaid: divHit?.val ?? null,
      totalAssets,
      totalLiabilities,
      equity,
      longTermDebt: ltDebtPt?.val ?? null,
      cash: cashPt?.val ?? null,
      sharesOutstanding: sharesPt?.val ?? null,
      firstReportedAt: firstReportedAt || null,
    });
  }

  // 财季位置：命中财年期末 → FQ4，其余从最近的已知 FQ4 按索引距离推（假定季度连续）
  const q4Indices = out
    .map((r, i) => (fiscalYearEnds.has(r.fiscalDate) ? i : -1))
    .filter((i) => i >= 0);
  out.forEach((r, i) => {
    let nearest: number | null = null;
    for (const k of q4Indices) {
      if (nearest == null || Math.abs(i - k) < Math.abs(i - nearest)) nearest = k;
    }
    if (nearest == null) return;
    r.fiscalQuarter = ((((3 + (i - nearest)) % 4) + 4) % 4) + 1;
  });

  // ① 流通股本拆股归一（自身序列后向游走）；factor=null 是脏点，丢弃而非留错值
  const shareFactors = scaleFactorsBackward(out.map((r) => r.sharesOutstanding));
  out.forEach((r, i) => {
    if (r.sharesOutstanding == null) return;
    const f = shareFactors[i];
    if (f == null) r.sharesOutstanding = null;
    else if (f !== 1) r.sharesOutstanding = r.sharesOutstanding * f;
  });

  // ② 差分推导的 EPS 可能被「FY 与 YTD9 相对拆股的重述进度不同」污染（如 NVDA FY2023 Q4，
  // 相减产生任意垃圾值，且会毒化 ③ 的归一链）。先用 净利/归一后股本 交叉校验：
  // 偏差 >40%（稀释差异远小于此）则以后者替换——顺带把旧口径的推导值直接换算到最新口径。
  out.forEach((r, i) => {
    if (!epsDerived[i] || r.eps == null) return;
    if (r.netIncome == null || r.sharesOutstanding == null || r.sharesOutstanding <= 0) return;
    const expected = r.netIncome / r.sharesOutstanding;
    if (Math.abs(expected) < 1e-4) return;
    if (Math.abs(r.eps - expected) / Math.abs(expected) > 0.4) {
      r.eps = expected;
    }
  });

  // ③ 直取 EPS 的拆股归一：用隐含股本（|净利/EPS|，无季节性、跳变只能来自拆股）
  const impliedShares = out.map((r) =>
    r.netIncome != null && r.eps != null && Math.abs(r.eps) > 1e-6
      ? Math.abs(r.netIncome / r.eps)
      : null,
  );
  const epsFactors = scaleFactorsBackward(impliedShares);
  out.forEach((r, i) => {
    if (r.eps == null) return;
    const f = epsFactors[i];
    if (f == null) r.eps = null; // 隐含股本判脏 → EPS 刻度不可信，丢弃
    else if (f !== 1) r.eps = r.eps / f;
  });

  // ④ 归一后按统一口径重算 epsYoY（上年同一日历季度标签）
  const epsByPeriod = new Map(out.map((r) => [r.period, r.eps]));
  for (const r of out) {
    const qPos = r.period.indexOf("Q");
    const prevPeriod = `${Number(r.period.slice(0, qPos)) - 1}Q${r.period.slice(qPos + 1)}`;
    r.epsYoY = yoy(r.eps, epsByPeriod.get(prevPeriod) ?? null);
  }

  // 同一日历季度标签只保留财季截止日最新的一条（重述/双财季极端情况）
  const byPeriod = new Map<string, SecQuarterlyFundamentals>();
  for (const row of out) byPeriod.set(row.period, row);
  return [...byPeriod.values()]
    .sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate))
    .slice(-maxQuarters);
}

/** SEC 全市场 ticker → CIK（约 1 次请求，可缓存） */
export async function fetchSecTickerCikMap(): Promise<Map<string, string>> {
  const url = "https://www.sec.gov/files/company_tickers.json";
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SEC tickers HTTP ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    { cik_str?: number | string; ticker?: string }
  >;
  const map = new Map<string, string>();
  for (const row of Object.values(json)) {
    const ticker = row.ticker?.trim().toUpperCase();
    if (!ticker || row.cik_str == null) continue;
    map.set(ticker, padCik(String(row.cik_str)));
  }
  return map;
}

export async function fetchYahooLastClose(symbol: string): Promise<number | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=5d`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; finance-site/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const px = result?.meta?.regularMarketPrice;
    if (typeof px === "number" && Number.isFinite(px)) return px;
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c)) return c;
    }
    return null;
  } catch {
    return null;
  }
}
