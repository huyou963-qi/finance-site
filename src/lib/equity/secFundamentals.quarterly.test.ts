import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarQuarterLabel,
  extractQuarterlyFundamentals,
  quarterlyFlowSeries,
  scaleFactorsBackward,
} from "./secFundamentals";
import { computeTtm, computeValuation, type QuarterFundamentalRow } from "./ttm";

function dur(start: string, end: string, val: number, form = "10-Q", filed = "2099-01-01") {
  return { start, end, val, form, filed };
}

function inst(end: string, val: number, form = "10-Q", filed = "2099-01-01") {
  return { end, val, form, filed };
}

test("calendarQuarterLabel：常规季末与 4-4-5 周历溢出", () => {
  assert.equal(calendarQuarterLabel("2025-03-31"), "2025Q1");
  assert.equal(calendarQuarterLabel("2024-12-28"), "2024Q4"); // AAPL FQ1
  assert.equal(calendarQuarterLabel("2025-01-02"), "2024Q4"); // 周历溢出归上季
  assert.equal(calendarQuarterLabel("2025-06-28"), "2025Q2");
  assert.equal(calendarQuarterLabel("2024-09-28"), "2024Q3"); // AAPL FY end
});

test("quarterlyFlowSeries：日历财年，直取 Q1–Q3 + 差分推导 Q4", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 100),
    dur("2024-01-01", "2024-06-30", 210), // YTD6
    dur("2024-04-01", "2024-06-30", 110),
    dur("2024-01-01", "2024-09-30", 330), // YTD9
    dur("2024-07-01", "2024-09-30", 120),
    dur("2024-01-01", "2024-12-31", 470, "10-K"), // FY
  ];
  const q = quarterlyFlowSeries(pts);
  assert.equal(q.length, 4);
  assert.deepEqual(
    q.map((x) => [x.end, x.val, x.derived]),
    [
      ["2024-03-31", 100, false],
      ["2024-06-30", 110, false],
      ["2024-09-30", 120, false],
      ["2024-12-31", 140, true], // 470 − 330
    ],
  );
});

test("quarterlyFlowSeries：现金流仅 YTD 累计披露时全部由差分推导", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 50),
    dur("2024-01-01", "2024-06-30", 120),
    dur("2024-01-01", "2024-09-30", 200),
    dur("2024-01-01", "2024-12-31", 300, "10-K"),
  ];
  const q = quarterlyFlowSeries(pts);
  assert.deepEqual(
    q.map((x) => [x.end, x.val]),
    [
      ["2024-03-31", 50],
      ["2024-06-30", 70],
      ["2024-09-30", 80],
      ["2024-12-31", 100],
    ],
  );
});

test("quarterlyFlowSeries：财年错位（AAPL 型，FY 止于 9 月底）", () => {
  const pts = [
    // FY2024：2023-10-01 → 2024-09-28
    dur("2023-10-01", "2023-12-30", 1195), // FQ1
    dur("2023-10-01", "2024-03-30", 2103), // YTD6
    dur("2023-12-31", "2024-03-30", 908), // FQ2
    dur("2023-10-01", "2024-06-29", 2960), // YTD9
    dur("2024-03-31", "2024-06-29", 857), // FQ3
    dur("2023-10-01", "2024-09-28", 3910, "10-K"), // FY
  ];
  const q = quarterlyFlowSeries(pts);
  const q4 = q.find((x) => x.end === "2024-09-28");
  assert.ok(q4);
  assert.equal(q4!.val, 950); // 3910 − 2960
  assert.equal(q4!.derived, true);
  assert.equal(calendarQuarterLabel(q4!.end), "2024Q3");
});

test("quarterlyFlowSeries：重述同期取最新 filed", () => {
  const pts = [
    dur("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01"),
    dur("2024-01-01", "2024-03-31", 105, "10-Q", "2024-08-01"), // 重述
  ];
  const q = quarterlyFlowSeries(pts);
  assert.equal(q.length, 1);
  assert.equal(q[0]!.val, 105);
});

function usd(points: object[]) {
  return { units: { USD: points } };
}

test("extractQuarterlyFundamentals：三表对齐 + 金融公司营收概念择优（JPM 型）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        // 手续费收入（部分口径）——不应被选中
        RevenueFromContractWithCustomerExcludingAssessedTax: usd([
          dur("2024-01-01", "2024-03-31", 20),
          dur("2024-04-01", "2024-06-30", 21),
          dur("2024-07-01", "2024-09-30", 22),
          dur("2024-01-01", "2024-12-31", 85, "10-K"),
        ]),
        // 总收入（金融公司口径）——年度值更大，应被选中
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 100),
          dur("2024-04-01", "2024-06-30", 110),
          dur("2024-07-01", "2024-09-30", 120),
          dur("2024-01-01", "2024-09-30", 330),
          dur("2024-01-01", "2024-12-31", 470, "10-K"),
        ]),
        NetIncomeLoss: usd([
          dur("2024-01-01", "2024-03-31", 30),
          dur("2024-04-01", "2024-06-30", 33),
          dur("2024-07-01", "2024-09-30", 36),
          dur("2024-01-01", "2024-09-30", 99),
          dur("2024-01-01", "2024-12-31", 140, "10-K"),
        ]),
        // 无 GrossProfit（银行不披露毛利）→ grossMargin 应为 null
        Assets: usd([
          inst("2024-03-31", 4000),
          inst("2024-06-30", 4100),
          inst("2024-09-30", 4200),
          inst("2024-12-31", 4300, "10-K"),
        ]),
        StockholdersEquity: usd([
          inst("2024-03-31", 300),
          inst("2024-06-30", 310),
          inst("2024-09-30", 320),
          inst("2024-12-31", 330, "10-K"),
        ]),
      },
    },
  };

  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows.length, 4);
  const q4 = rows[rows.length - 1]!;
  assert.equal(q4.period, "2024Q4");
  assert.equal(q4.revenue, 140); // 470 − 330（总收入口径，而非手续费）
  assert.equal(q4.netIncome, 41); // 140 − 99
  assert.equal(q4.grossMargin, null);
  assert.equal(q4.totalAssets, 4300);
  // Liabilities 概念缺失时由 Assets − Equity 推导
  assert.equal(q4.totalLiabilities, 4300 - 330);
});

test("extractQuarterlyFundamentals：换 tag 公司取序列末端更新的营收概念（JPM Revenues→RevenuesNetOfInterestExpense）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        // 老 tag：量级大但 2014 年后停用
        Revenues: usd([
          dur("2014-01-01", "2014-03-31", 250),
          dur("2014-04-01", "2014-06-30", 250),
          dur("2014-07-01", "2014-09-30", 250),
          dur("2014-01-01", "2014-09-30", 750),
          dur("2014-01-01", "2014-12-31", 1000, "10-K"),
        ]),
        // 现行 tag：一直更新
        RevenuesNetOfInterestExpense: usd([
          dur("2024-01-01", "2024-03-31", 200),
          dur("2024-04-01", "2024-06-30", 210),
          dur("2024-07-01", "2024-09-30", 220),
          dur("2024-01-01", "2024-09-30", 630),
          dur("2024-01-01", "2024-12-31", 860, "10-K"),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const last = rows[rows.length - 1]!;
  assert.equal(last.period, "2024Q4");
  assert.equal(last.revenue, 230); // 860 − 630，来自现行 tag
});

test("extractQuarterlyFundamentals：银行无总营收 tag 时合成 净利息收入+非利息收入（RF/TFC 型）", () => {
  const facts = {
    facts: {
      "us-gaap": {
        InterestIncomeExpenseNet: usd([
          dur("2024-01-01", "2024-03-31", 1200),
          dur("2024-04-01", "2024-06-30", 1250),
          dur("2024-07-01", "2024-09-30", 1300),
          dur("2024-01-01", "2024-12-31", 5100, "10-K"),
          dur("2024-01-01", "2024-09-30", 3750),
        ]),
        NoninterestIncome: usd([
          dur("2024-01-01", "2024-03-31", 500),
          dur("2024-04-01", "2024-06-30", 520),
          dur("2024-07-01", "2024-09-30", 540),
          dur("2024-01-01", "2024-12-31", 2120, "10-K"),
          dur("2024-01-01", "2024-09-30", 1560),
        ]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  assert.equal(rows.length, 4);
  assert.equal(rows[0]!.revenue, 1700); // 1200+500
  assert.equal(rows[3]!.revenue, 1910); // Q4：(5100−3750)+(2120−1560)
});

test("extractQuarterlyFundamentals：营收 YoY 按同比季度对齐", () => {
  const mk = (y: number, v1: number, v2: number, v3: number, fy: number) => [
    dur(`${y}-01-01`, `${y}-03-31`, v1),
    dur(`${y}-04-01`, `${y}-06-30`, v2),
    dur(`${y}-07-01`, `${y}-09-30`, v3),
    dur(`${y}-01-01`, `${y}-09-30`, v1 + v2 + v3),
    dur(`${y}-01-01`, `${y}-12-31`, fy, "10-K"),
  ];
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([...mk(2023, 100, 100, 100, 400), ...mk(2024, 110, 120, 130, 500)]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q1_2024 = rows.find((r) => r.period === "2024Q1");
  assert.ok(q1_2024);
  assert.ok(Math.abs(q1_2024!.revenueYoY! - 0.1) < 1e-9);
  const q4_2024 = rows.find((r) => r.period === "2024Q4");
  // Q4 推导值 140 vs 上年推导 100 → +40%
  assert.ok(Math.abs(q4_2024!.revenueYoY! - 0.4) < 1e-9);
});

test("scaleFactorsBackward：混杂拆前/拆后口径的股本序列归一（DECK 6:1 型）", () => {
  // 单位百万股；153.6 已重述为拆后口径，25.x 仍是拆前口径
  const raw = [26.1, 25.8, 25.6, 153.6, 25.4, 152.0, 151.8, 150.2, 148.5, 146.1, 142.3, 140.0];
  const factors = scaleFactorsBackward(raw);
  const norm = raw.map((v, i) => v * factors[i]!);
  for (let i = 0; i < norm.length - 1; i++) {
    const ratio = norm[i]! / norm[i + 1]!;
    assert.ok(ratio > 0.9 && ratio < 1.15, `index ${i} ratio=${ratio}`);
  }
  assert.equal(factors[0], 6);
  assert.equal(factors[3], 1); // 已重述的点不动
  assert.equal(factors[11], 1);
});

test("scaleFactorsBackward：并股（反向拆股 1:8 型）", () => {
  // 旧口径股本大 8 倍
  const raw = [8000, 8080, 1010, 1000];
  const factors = scaleFactorsBackward(raw);
  assert.equal(factors[0], 1 / 8);
  assert.equal(factors[1], 1 / 8);
  assert.equal(factors[2], 1);
});

test("extractQuarterlyFundamentals：拆股后 EPS 统一到最新口径并重算 YoY", () => {
  // 2024-09 发生 6:1 拆股；2024Q2 的 EPS/净利来自拆前财报（EPS 大 6 倍），
  // 2023 各季已被后续财报重述为拆后口径
  const mkYear = (y: number, epsArr: number[], niArr: number[]) => ({
    eps: [
      dur(`${y}-01-01`, `${y}-03-31`, epsArr[0]!),
      dur(`${y}-04-01`, `${y}-06-30`, epsArr[1]!),
      dur(`${y}-07-01`, `${y}-09-30`, epsArr[2]!),
      dur(`${y}-01-01`, `${y}-09-30`, epsArr[0]! + epsArr[1]! + epsArr[2]!),
      dur(`${y}-01-01`, `${y}-12-31`, epsArr[3]!, "10-K"),
    ],
    ni: [
      dur(`${y}-01-01`, `${y}-03-31`, niArr[0]!),
      dur(`${y}-04-01`, `${y}-06-30`, niArr[1]!),
      dur(`${y}-07-01`, `${y}-09-30`, niArr[2]!),
      dur(`${y}-01-01`, `${y}-09-30`, niArr[0]! + niArr[1]! + niArr[2]!),
      dur(`${y}-01-01`, `${y}-12-31`, niArr[3]!, "10-K"),
    ],
  });
  // 净利单位百万，股本 600（拆后口径）；拆后应有 EPS = NI/600。
  // 2023 各点已被后续财报重述为拆后口径
  const y2023 = mkYear(2023, [1.0, 1.1, 1.2, 4.8], [600, 660, 720, 2880]);
  // 2024：Q1、Q2 直取点来自拆前财报（股本 100 → EPS 大 6 倍）且未被重述；
  // Q3 的 10-Q 在拆股后发布 → Q3 直取点与 YTD9 均为拆后口径；FY 10-K 拆后。
  // 每个 XBRL 点内部口径一致（真实数据的形态）。
  const y2024 = {
    eps: [
      dur("2024-01-01", "2024-03-31", 6.6), // 拆前
      dur("2024-04-01", "2024-06-30", 7.2), // 拆前
      dur("2024-07-01", "2024-09-30", 1.3), // 拆后
      dur("2024-01-01", "2024-09-30", 3.6), // YTD9 拆后：1.1+1.2+1.3
      dur("2024-01-01", "2024-12-31", 5.5, "10-K"), // FY 拆后 → Q4 推导 1.9
    ],
    ni: [
      dur("2024-01-01", "2024-03-31", 660),
      dur("2024-04-01", "2024-06-30", 720),
      dur("2024-07-01", "2024-09-30", 780),
      dur("2024-01-01", "2024-09-30", 2160),
      dur("2024-01-01", "2024-12-31", 3300, "10-K"),
    ],
  };
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([...mkYear(2023, [0, 0, 0, 0], [0, 0, 0, 0]).ni.map((p, i) => ({ ...p, val: 1000 + i })), ...mkYear(2024, [0, 0, 0, 0], [0, 0, 0, 0]).ni.map((p, i) => ({ ...p, val: 1100 + i }))]),
        EarningsPerShareDiluted: { units: { "USD/shares": [...y2023.eps, ...y2024.eps] } },
        NetIncomeLoss: usd([...y2023.ni, ...y2024.ni]),
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q1 = rows.find((r) => r.period === "2024Q1");
  const q2 = rows.find((r) => r.period === "2024Q2");
  assert.ok(q1 && q2);
  assert.ok(Math.abs(q1!.eps! - 1.1) < 1e-9, `q1 eps=${q1!.eps}`); // 6.6/6
  assert.ok(Math.abs(q2!.eps! - 1.2) < 1e-9, `q2 eps=${q2!.eps}`); // 7.2/6
  // YoY 用归一后口径：1.1/1.0 − 1 = 10%
  assert.ok(Math.abs(q1!.epsYoY! - 0.1) < 1e-9, `q1 epsYoY=${q1!.epsYoY}`);
});

test("extractQuarterlyFundamentals：推导 EPS 被跨口径重述污染时用 净利/股本 交叉校验替换（NVDA FY2023Q4 型）", () => {
  const shares = (val: number) => [
    inst("2024-03-31", val),
    inst("2024-06-30", val),
    inst("2024-09-30", val),
    inst("2024-12-31", val, "10-K"),
  ];
  const facts = {
    facts: {
      "us-gaap": {
        Revenues: usd([
          dur("2024-01-01", "2024-03-31", 1000),
          dur("2024-04-01", "2024-06-30", 1000),
          dur("2024-07-01", "2024-09-30", 1000),
          dur("2024-01-01", "2024-09-30", 3000),
          dur("2024-01-01", "2024-12-31", 4000, "10-K"),
        ]),
        NetIncomeLoss: usd([
          dur("2024-01-01", "2024-03-31", 600),
          dur("2024-04-01", "2024-06-30", 660),
          dur("2024-07-01", "2024-09-30", 720),
          dur("2024-01-01", "2024-09-30", 1980),
          dur("2024-01-01", "2024-12-31", 2880, "10-K"),
        ]),
        EarningsPerShareDiluted: {
          units: {
            "USD/shares": [
              dur("2024-01-01", "2024-03-31", 1.0),
              dur("2024-04-01", "2024-06-30", 1.1),
              dur("2024-07-01", "2024-09-30", 1.2),
              dur("2024-01-01", "2024-09-30", 3.3), // YTD9 旧口径
              dur("2024-01-01", "2024-12-31", 0.46, "10-K"), // FY 被重述成新口径 → 推导 Q4 = −2.84 垃圾
            ],
          },
        },
        CommonStockSharesOutstanding: { units: { shares: shares(600) } },
      },
    },
  };
  const rows = extractQuarterlyFundamentals(facts);
  const q4 = rows.find((r) => r.period === "2024Q4")!;
  // 交叉校验后 EPS = Q4 净利 900 / 股本 600 = 1.5（而非 0.46 − 3.3 = −2.84）
  assert.ok(Math.abs(q4.eps! - 1.5) < 1e-9, `q4 eps=${q4.eps}`);
  // 未被污染的直取季不动
  assert.equal(rows.find((r) => r.period === "2024Q1")!.eps, 1.0);
});

function qRow(partial: Partial<QuarterFundamentalRow> & { period: string; fiscalDate: string }): QuarterFundamentalRow {
  return {
    revenue: null,
    netIncome: null,
    eps: null,
    ocf: null,
    capex: null,
    dividendsPaid: null,
    totalAssets: null,
    totalLiabilities: null,
    equity: null,
    longTermDebt: null,
    cash: null,
    sharesOutstanding: null,
    ...partial,
  };
}

test("computeTtm：连续 4 季求和；断档返回 null", () => {
  const quarters = [
    qRow({ period: "2024Q1", fiscalDate: "2024-03-31", revenue: 100, netIncome: 10, ocf: 20, capex: 5 }),
    qRow({ period: "2024Q2", fiscalDate: "2024-06-30", revenue: 110, netIncome: 11, ocf: 21, capex: 5 }),
    qRow({ period: "2024Q3", fiscalDate: "2024-09-30", revenue: 120, netIncome: 12, ocf: 22, capex: 5 }),
    qRow({ period: "2024Q4", fiscalDate: "2024-12-31", revenue: 130, netIncome: 13, ocf: 23, capex: 5 }),
  ];
  const ttm = computeTtm(quarters);
  assert.ok(ttm);
  assert.equal(ttm!.revenue, 460);
  assert.equal(ttm!.netIncome, 46);
  assert.equal(ttm!.fcf, 86 - 20);

  // 缺 2024Q2 → 首尾跨度超限 → null
  const gappy = quarters.filter((q) => q.period !== "2024Q2");
  gappy.unshift(qRow({ period: "2023Q3", fiscalDate: "2023-09-30", revenue: 90 }));
  assert.equal(computeTtm(gappy), null);
});

test("computeValuation：现价×股本 → 市值与倍数；股本缺失退回主档市值", () => {
  const latest = qRow({
    period: "2024Q4",
    fiscalDate: "2024-12-31",
    equity: 500,
    longTermDebt: 200,
    cash: 100,
    sharesOutstanding: 10,
  });
  const ttm = computeTtm([
    qRow({ period: "2024Q1", fiscalDate: "2024-03-31", revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 }),
    qRow({ period: "2024Q2", fiscalDate: "2024-06-30", revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 }),
    qRow({ period: "2024Q3", fiscalDate: "2024-09-30", revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 }),
    { ...latest, revenue: 100, netIncome: 10, ocf: 20, capex: 5, dividendsPaid: 2 },
  ]);
  const v = computeValuation(ttm, latest, 100);
  assert.equal(v.marketCap, 1000);
  assert.equal(v.marketCapSource, "shares");
  assert.equal(v.peTtm, 1000 / 40);
  assert.equal(v.pb, 2);
  assert.equal(v.psTtm, 2.5);
  assert.equal(v.ev, 1000 + 200 - 100);
  assert.ok(Math.abs(v.fcfYield! - 60 / 1000) < 1e-9);
  assert.ok(Math.abs(v.dividendYield! - 8 / 1000) < 1e-9);

  const noShares = { ...latest, sharesOutstanding: null };
  const v2 = computeValuation(ttm, noShares, 100, 888);
  assert.equal(v2.marketCap, 888);
  assert.equal(v2.marketCapSource, "profile");
});
