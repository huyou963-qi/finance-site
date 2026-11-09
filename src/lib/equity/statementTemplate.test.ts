import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateStatementLines, detectStatementProfile, orderStatementLines, readStatementLines, STATEMENT_LINES, EXTRA_LINE_CODES } from "./statementTemplate";
import { STATEMENT_LINE_TAGS } from "./statementLineTags";
import { extractQuarterlyFundamentals, type SecQuarterlyFundamentals as Quarter } from "./secFundamentals";
import { planQuarterlyWrite } from "./quarterlyWritePlan";

test("template codes are unique and every stored line has tag candidates", () => {
  const codes = STATEMENT_LINES.map(l => l.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of EXTRA_LINE_CODES) assert.ok(STATEMENT_LINE_TAGS[code]?.length, `${code} 缺少取数标签`);
  for (const code of Object.keys(STATEMENT_LINE_TAGS)) assert.ok(EXTRA_LINE_CODES.includes(code), `${code} 不在模板内`);
});

test("stored JSON keeps only template codes with finite numbers", () => {
  assert.deepEqual(readStatementLines({ goodwill: 5, unknownTag: 1, inventory: "7", deposits: Number.NaN }), { goodwill: 5 });
  assert.deepEqual(readStatementLines(null), {});
  assert.deepEqual(readStatementLines([1, 2]), {});
});

test("fiscal year: flows sum four quarters, balances take the year end, weighted shares average, gaps stay empty", () => {
  const q = (i: number) => ({ costOfRevenue: 10 * i, goodwill: 100 + i, sharesBasic: 1000 + i, epsBasic: 0.5 });
  const fy = aggregateStatementLines([q(1), q(2), q(3), q(4)]);
  assert.equal(fy.costOfRevenue, 100);
  assert.equal(fy.goodwill, 104);
  assert.equal(fy.sharesBasic, 1002.5);
  assert.equal(fy.epsBasic, 2);
  const missing = aggregateStatementLines([q(1), { goodwill: 1 }, q(3), q(4)]);
  assert.equal(missing.costOfRevenue, undefined);
  assert.equal(missing.goodwill, 104);
  assert.deepEqual(aggregateStatementLines([q(1), q(2), q(3)]), {});
});

const dur = (start: string, end: string, val: number, form = "10-Q") => ({ start, end, val, form, filed: `${end.slice(0, 4)}-12-20` });
const inst = (end: string, val: number) => ({ end, val, form: "10-Q", filed: `${end.slice(0, 4)}-12-20` });

test("bank interest expense moves to the operating line; weighted shares are never derived from year-to-date totals", () => {
  const facts = { cik: 1, facts: { "us-gaap": {
    Revenues: { units: { USD: [dur("2025-01-01", "2025-03-31", 100), dur("2025-04-01", "2025-06-30", 110), dur("2025-07-01", "2025-09-30", 120),
      dur("2025-01-01", "2025-12-31", 460, "10-K")] } },
    InterestIncomeExpenseNet: { units: { USD: [dur("2025-01-01", "2025-03-31", 60), dur("2025-04-01", "2025-06-30", 61)] } },
    InterestExpense: { units: { USD: [dur("2025-01-01", "2025-03-31", 30), dur("2025-04-01", "2025-06-30", 31)] } },
    InvestmentIncomeInterest: { units: { USD: [dur("2025-01-01", "2025-03-31", 12)] } },
    WeightedAverageNumberOfSharesOutstandingBasic: { units: { shares: [dur("2025-01-01", "2025-03-31", 1000), dur("2025-04-01", "2025-06-30", 1000),
      dur("2025-07-01", "2025-09-30", 1000), dur("2025-01-01", "2025-09-30", 1000), dur("2025-01-01", "2025-12-31", 990, "10-K")] } },
    Goodwill: { units: { USD: [inst("2025-03-31", 500), inst("2025-12-31", 520)] } },
  } } };
  const rows = Object.fromEntries(extractQuarterlyFundamentals(facts, { maxQuarters: 8 }).map(r => [r.period, r.lines ?? {}]));
  assert.equal(rows["2025Q1"]!.interestExpenseOperating, 30);
  assert.equal(rows["2025Q1"]!.interestExpense, undefined);
  // 同时有经营性利息支出标签且金额相同：不重复列示
  const both = { cik: 1, facts: { "us-gaap": { ...facts.facts["us-gaap"],
    InterestExpenseOperating: { units: { USD: [dur("2025-01-01", "2025-03-31", 30)] } } } } };
  const q1 = extractQuarterlyFundamentals(both, { maxQuarters: 8 }).find(r => r.period === "2025Q1")!.lines!;
  assert.equal(q1.interestExpenseOperating, 30);
  assert.equal(q1.interestExpense, undefined);
  assert.equal(rows["2025Q1"]!.interestIncomeNonoperating, undefined);
  assert.equal(rows["2025Q1"]!.sharesBasic, 1000);
  // Q4 = FY − 九个月 对加权平均股数没有意义（990 − 1000 = −10），必须留空
  assert.equal(rows["2025Q4"]!.sharesBasic, undefined);
  assert.equal(rows["2025Q4"]!.goodwill, 520);
});

function quarter(lines?: Record<string, number>): Quarter {
  return { period: "2025Q1", fiscalDate: "2025-03-31", fiscalQuarter: 1, revenue: 100, revenueYoY: null, grossMargin: null, opMargin: null,
    netIncome: 10, eps: null, epsYoY: null, ocf: 20, capex: 5, dividendsPaid: null, buybackPaid: null, totalAssets: null,
    totalLiabilities: null, equity: null, longTermDebt: null, cash: null, sharesOutstanding: null, firstReportedAt: "2025-05-01", lines };
}

test("statement lines: a normal write replaces the quarter's lines, fill-missing only adds", () => {
  const stored = { ...quarter(), lines: { goodwill: 1, inventory: 2 } };
  // 一次完整提取不再产出 inventory（如口径规则调整）：不得残留旧值
  const normal = planQuarterlyWrite([quarter({ goodwill: 9, deposits: 3 })], [stored]);
  assert.deepEqual(normal.rows[0]!.lines, { goodwill: 9, deposits: 3 });
  const fill = planQuarterlyWrite([quarter({ goodwill: 9, deposits: 3 })], [stored], true);
  assert.deepEqual(fill.rows[0]!.lines, { goodwill: 1, inventory: 2, deposits: 3 });
  // 旧调用方不提供 lines：不改动、也不因此触发重写
  assert.equal(planQuarterlyWrite([quarter()], [stored]).rows.length, 0);
  // 只有科目明细变化也要写回
  assert.equal(planQuarterlyWrite([quarter({ goodwill: 1, inventory: 2, deposits: 3 })], [stored]).rows.length, 1);
});

test("statement profile comes from the company's own reported lines, insurer before bank before broker", () => {
  const rows = (lines: Record<string, number>) => [{ lines: {} }, { lines }];
  assert.equal(detectStatementProfile(rows({ deposits: 1, loansNet: 1 })), "bank");
  assert.equal(detectStatementProfile(rows({ deposits: 1 })), "general");
  assert.equal(detectStatementProfile(rows({ premiumsEarned: 1, deposits: 1, loansNet: 1 })), "insurer");
  assert.equal(detectStatementProfile(rows({ segregatedCash: 1, commissionRevenue: 1 })), "broker");
  assert.equal(detectStatementProfile(rows({ deposits: 1, netInterestIncome: 1, segregatedCash: 1 })), "bank");
  assert.equal(detectStatementProfile(rows({ realEstateNet: 1 })), "reit");
  assert.equal(detectStatementProfile(rows({ goodwill: 1 })), "general");
  // 只看最近 8 期：多年前出售的银行子公司不再决定格式
  assert.equal(detectStatementProfile([{ lines: { deposits: 1, loansNet: 1 } }, ...Array.from({ length: 8 }, () => ({ lines: { goodwill: 1 } }))]), "general");
});

test("bank income statement reads interest first and net revenue after; balance sheet order never changes", () => {
  const bankIs = orderStatementLines(STATEMENT_LINES, "bank").filter(l => l.statement === "IS" && l.group === "收入").map(l => l.code);
  assert.ok(bankIs.indexOf("interestIncome") < bankIs.indexOf("revenue"));
  assert.ok(bankIs.indexOf("netInterestIncome") < bankIs.indexOf("revenue"));
  assert.ok(bankIs.indexOf("revenue") < bankIs.indexOf("premiumsEarned"));
  const generalIs = orderStatementLines(STATEMENT_LINES, "general").filter(l => l.statement === "IS").map(l => l.code);
  assert.equal(generalIs[0], "revenue");
  const bs = (p: Parameters<typeof orderStatementLines>[1]) => orderStatementLines(STATEMENT_LINES, p).filter(l => l.statement === "BS").map(l => l.code);
  assert.deepEqual(bs("bank"), bs("general"));
  // 分组不被打乱：每个分组仍连续出现
  const groups = orderStatementLines(STATEMENT_LINES, "insurer").map(l => `${l.statement}/${l.group}`);
  assert.equal(new Set(groups).size, groups.filter((g, i) => g !== groups[i - 1]).length);
});
