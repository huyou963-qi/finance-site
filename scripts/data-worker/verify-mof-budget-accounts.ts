import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { MOF_BUDGET_ACCOUNTS_SERIES } from "../../src/lib/data/scheduler/mofBudgetAccounts/catalog";
import { fetchMofBudgetAccountsHistory } from "../../src/lib/data/scheduler/mofBudgetAccounts/client";
import { parseReleaseRule } from "../../src/lib/data/scheduler/releaseRule";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const codes = new Set(MOF_BUDGET_ACCOUNTS_SERIES.map((s) => s.code));
  assert.equal(codes.size, MOF_BUDGET_ACCOUNTS_SERIES.length);
  assert([...codes].every((code) => code.length <= 64));
  if (!process.argv.includes("--db")) return console.log("[verify-mof-budget-accounts] catalog 通过");
  const history = process.argv.includes("--live") ? await fetchMofBudgetAccountsHistory() : null;
  const items = await prisma.instrument.findMany({ where: { code: { startsWith: "mof_cn_budget_" } }, include: { dataSubscription: { include: { releasePackage: true } }, macroPoints: { orderBy: { obsDate: "asc" } } } });
  assert(items.length > 0, "年度决算尚未入库");
  for (const item of items) {
    assert(codes.has(item.code), `未知年度决算代码 ${item.code}`);
    const meta = item.metadata as Record<string, unknown>;
    assert.equal(meta.countryCode, "CN");
    assert.equal(meta.budgetStatus, "final_accounts");
    assert.equal(readFetchAcquisition(meta)?.status, "known");
    assert.equal(item.unit, "亿元"); assert.equal(item.freqLabel, "年");
    assert(item.macroPoints.length > 0, `${item.code} 空数据`);
    assert(item.macroPoints.every((p) => p.obsDate.getUTCMonth() === 0 && p.obsDate.getUTCDate() === 1 && Number.isFinite(p.value)), `${item.code} 日期/金额异常`);
    const sub = item.dataSubscription;
    assert(sub && sub.sourceId === "mof-budget-accounts", `${item.code} 无订阅`);
    assert.equal(sub.releasePackageId, "cn.mof.budget_accounts_final");
    assert.equal(sub.releasePackage?.enabled, true);
    const rule = parseReleaseRule(sub.releaseRule);
    assert(rule.type === "probe_interval" && rule.intervalHours === 168, `${item.code} 更新规则错误`);
    if (sub.enabled) assert(sub.nextRunAt, `${item.code} 无下一次更新`);
    if (process.argv.includes("--scheduler") && sub.enabled) {
      assert(sub.lastSuccessAt && !sub.lastError, `${item.code} 未通过更新链路`);
      const run = await prisma.fetchRun.findFirst({ where: { subscriptionId: sub.id }, orderBy: { startedAt: "desc" } });
      assert(run && ["SUCCESS", "SKIPPED"].includes(run.status), `${item.code} 最新拉取失败`);
    }
    if (history) {
      const key = MOF_BUDGET_ACCOUNTS_SERIES.find((s) => s.code === item.code)!.key;
      const points = history.get(key);
      assert(points?.length, `${item.code} 官方历史不再可读取`);
      const stored = new Map(item.macroPoints.map((p) => [p.obsDate.getTime(), p.value]));
      for (const point of points) assert.equal(stored.get(point.obsDate.getTime()), point.value, `${item.code} ${point.obsDate.getUTCFullYear()} 与官方决算不符`);
    }
  }
  // Reconcile published totals, including official financing/redistribution.
  // The 2025 central balance excludes pooling, which is separately disclosed.
  for (const scope of ["national", "central", "local"]) {
    const lookup = (suffix: string) => items.find((i) => i.code === `mof_cn_budget_${scope}_social_${suffix}`)?.macroPoints ?? [];
    const revenue = new Map(lookup("revenue").map((p) => [p.obsDate.getTime(), p.value]));
    const expenditure = new Map(lookup("expenditure").map((p) => [p.obsDate.getTime(), p.value]));
    const revenueTotal = new Map(lookup("revenue_total").map((p) => [p.obsDate.getTime(), p.value]));
    const expenditureTotal = new Map(lookup("expenditure_total").map((p) => [p.obsDate.getTime(), p.value]));
    for (const balance of lookup("balance")) {
      const date = balance.obsDate.getTime();
      const baseOnly = scope === "central" && balance.obsDate.getUTCFullYear() >= 2025;
      const r = (!baseOnly ? revenueTotal.get(date) : undefined) ?? revenue.get(date);
      const e = (!baseOnly ? expenditureTotal.get(date) : undefined) ?? expenditure.get(date);
      assert(r != null && e != null, `${scope} ${balance.obsDate.getUTCFullYear()} 缺少对应收支`);
      assert(Math.abs(r - e - balance.value) <= 0.031, `${scope} ${balance.obsDate.getUTCFullYear()} 社保收支不平`);
    }
  }
  console.log(`[verify-mof-budget-accounts] 序列=${items.length}，启用=${items.filter((i) => i.dataSubscription?.enabled).length}，观测=${items.reduce((n, i) => n + i.macroPoints.length, 0)}，live=${Boolean(history)}，通过`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
