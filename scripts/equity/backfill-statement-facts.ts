/** 离线 SEC 官方报表补充。默认只审计；显式 --apply 写入。每批最多20家公司，逐公司串行。
 * --facts-dir=<companyfacts> --supplement-dir=<validated JSON> --symbols=A,B
 * --from=2015Q1 --through=2025Q4 --audit=<new jsonl> [--apply]
 * 生产运行须持有每日财报任务的同一 flock，NODE_OPTIONS=--max-old-space-size=384。
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import { calendarQuarterLabel, continuingCashForAudit, extractQuarterlyFundamentals, legacyPartialCapexForAudit, legacyPartialRevenueForAudit } from "../../src/lib/equity/secFundamentals";
import { annualStatementSnapshots, STATEMENT_CAPEX_ROLES } from "../../src/lib/equity/secStatementSupplement";
import { upsertQuarterlyFundamentals } from "../../src/lib/equity/equityFundamentalsStore";
import { fiscalDateAliasProof } from "../../src/lib/equity/fiscalDateAlias";
import { planAnnualWrite } from "../../src/lib/equity/annualWritePlan";
import { planQuarterlyWrite, quarterlyWriteWindow } from "../../src/lib/equity/quarterlyWritePlan";

const arg = (key: string) => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const apply = process.argv.includes("--apply");
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-10;
const read = (file: string, max: number) => {
  if (fs.statSync(file).size > max) throw Error(`输入文件超过预算: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
};
async function main() {
  const symbols = [...new Set((arg("symbols") ?? "").split(",").filter(Boolean))];
  const from = arg("from") ?? "2015Q1", through = arg("through") ?? "2025Q4";
  const factDir = arg("facts-dir"), supplementDir = arg("supplement-dir"), audit = arg("audit");
  if (!symbols.length || symbols.length > 20 || symbols.some(s => !/^[A-Z0-9.-]{1,20}$/.test(s))
    || !factDir || !supplementDir || !audit || !/^20\d{2}Q[1-4]$/.test(from) || !/^20\d{2}Q[1-4]$/.test(through)
    || from > through || Number(through.slice(0, 4)) - Number(from.slice(0, 4)) > 12) throw Error("缺少或超出有界参数");
  fs.writeFileSync(audit, "", { flag: "wx" });
  const log = (value: unknown) => fs.appendFileSync(audit, `${JSON.stringify(value)}\n`);
  const stats = { companies: 0, quarterlyWrites: 0, capexCorrections: 0, ocfCorrections: 0, revenueCorrections: 0, annualWrites: 0, annualCandidates: 0, fiscalDateRepairs: 0, unresolvedPartialCapex: 0 };
  for (const symbol of symbols) {
    const merged = path.join(factDir, `${symbol}-merged.json`);
    const facts = read(fs.existsSync(merged) ? merged : path.join(factDir, `${symbol}.json`), 40 * 1024 * 1024);
    const security = await prisma.equitySecurity.findUnique({ where: { symbol }, select: { cik: true } });
    if (!security?.cik || Number(security.cik) !== Number(facts.cik)) throw Error(`证券主体不符 ${symbol}`);
    const supplement = path.join(supplementDir, `${symbol}.json`);
    facts.statementSupplement = fs.existsSync(supplement) ? read(supplement, 5 * 1024 * 1024) : [];
    const incoming = extractQuarterlyFundamentals(facts, { maxQuarters: 80 }).filter(r => r.period >= from && r.period <= through);
    const annual = annualStatementSnapshots(facts).filter(r => calendarQuarterLabel(r.fiscalDate) >= from && calendarQuarterLabel(r.fiscalDate) <= through);
    const existing = await prisma.equityFundamentalSnapshot.findMany({ where: { symbol, periodType: "Q", period: incoming.length ? quarterlyWriteWindow(incoming) : { gte: from, lte: through } }, take: 61 });
    if (existing.length > 60 || annual.length > 14) throw Error("公司历史超出预算");
    const originalExisting = existing.map(r => ({ ...r }));
    const dateRepairs = [];
    for (const old of existing) {
      const next = incoming.find(r => r.period === old.period);
      const proof = next ? fiscalDateAliasProof(facts, old, next) : null;
      if (!proof) continue;
      dateRepairs.push({ period: old.period, updatedAt: old.updatedAt, ...proof });
      old.fiscalDate = new Date(`${proof.to}T00:00:00Z`);
    }
    const plan = incoming.length ? planQuarterlyWrite(incoming, existing, true) : null;
    const legacy = legacyPartialCapexForAudit(facts);
    const corrections: { field: "capex" | "ocf" | "revenue"; period: string; fiscalDate: Date; before: number; after: number | null; updatedAt: Date }[] = [];
    if (process.argv.includes("--repair-issuer-revenue")) {
      const partial = legacyPartialRevenueForAudit(facts);
      for (const old of existing) {
        if (old.revenue == null || !old.fiscalDate) continue;
        const date = old.fiscalDate.toISOString().slice(0, 10);
        if (calendarQuarterLabel(date) < from || calendarQuarterLabel(date) > through) continue;
        const next = incoming.find(r => r.fiscalDate === date);
        if (next?.revenue != null && next.revenue > old.revenue && partial.some(p => p.end === date && close(p.val, old.revenue!)))
          corrections.push({ field: "revenue", period: old.period, fiscalDate: old.fiscalDate, before: old.revenue, after: next.revenue, updatedAt: old.updatedAt });
      }
    }
    if ((STATEMENT_CAPEX_ROLES[Number(facts.cik)]?.length ?? 0) > 1) for (const old of existing) {
      if (old.capex == null || !old.fiscalDate) continue;
      const date = old.fiscalDate.toISOString().slice(0, 10);
      if (calendarQuarterLabel(date) < from || calendarQuarterLabel(date) > through) continue;
      const candidate = incoming.find(r => r.fiscalDate === date);
      const partial = legacy.find(r => r.end === date && close(r.val, old.capex!));
      if (!partial || !close(partial.val, old.capex)) continue;
      if (candidate?.capex != null && close(candidate.capex, old.capex)) continue;
      // 仅旧通用单项完全匹配时，才允许替换为完整同报表组成；缺完整组成则撤销误标。
      corrections.push({ field: "capex", period: old.period, fiscalDate: old.fiscalDate, before: old.capex, after: candidate?.capex ?? null, updatedAt: old.updatedAt });
    }
    const cash = continuingCashForAudit(facts);
    for (const old of existing) {
      if (old.ocf == null || !old.fiscalDate) continue;
      const date = old.fiscalDate.toISOString().slice(0, 10);
      if (calendarQuarterLabel(date) < from || calendarQuarterLabel(date) > through) continue;
      const next = incoming.find(r => r.fiscalDate === date);
      const continued = cash.continuing.find(p => p.end === date && close(p.val, old.ocf!));
      const stopped = cash.discontinued.find(p => p.end === date && p.val !== 0);
      if (continued && stopped && next?.ocf != null && !close(old.ocf, next.ocf) && close(next.ocf, continued.val + stopped.val))
        corrections.push({ field: "ocf", period: old.period, fiscalDate: old.fiscalDate, before: old.ocf, after: next.ocf, updatedAt: old.updatedAt });
    }
    const beforeAnnual = await prisma.equityFundamentalSnapshot.findMany({ where: { symbol, periodType: "FY12", period: { in: annual.map(r => `FY${r.fiscalDate}`) } }, take: 15 });
    if (beforeAnnual.length > 14) throw Error("年报记录超出预算");
    const annualPlanned = annual.filter(row => planAnnualWrite(row, beforeAnnual.find(r => r.period === `FY${row.fiscalDate}`) ?? null));
    log({ symbol, apply, at: new Date().toISOString(), before: originalExisting, beforeAnnual, proposed: plan, dateRepairs, corrections, annual, annualPlanned });
    if (apply) {
      for (const repair of dateRepairs) {
        const changed = await prisma.equityFundamentalSnapshot.updateMany({ where: { symbol, period: repair.period, periodType: "Q", fiscalDate: new Date(`${repair.from}T00:00:00Z`), updatedAt: repair.updatedAt },
          data: { fiscalDate: new Date(`${repair.to}T00:00:00Z`), asOf: new Date(`${repair.to}T00:00:00Z`) } });
        if (changed.count !== 1) throw Error(`财季日期并发修改 ${symbol}/${repair.period}`);
      }
      // 先纠正旧单项；普通补空逻辑随后保留纠正后的完整数值。
      for (const period of new Set(corrections.map(r => r.period))) {
        const group = corrections.filter(r => r.period === period), first = group[0]!;
        const beforeValues = Object.fromEntries(group.map(r => [r.field, r.before]));
        const afterValues = Object.fromEntries(group.map(r => [r.field, r.after]));
        const revenueDerived = group.some(r => r.field === "revenue") ? { revenueYoY: null, grossMargin: null, opMargin: null } : {};
        const changed = await prisma.equityFundamentalSnapshot.updateMany({ where: { symbol, period, periodType: "Q", fiscalDate: first.fiscalDate, updatedAt: first.updatedAt, ...beforeValues }, data: { ...afterValues, ...revenueDerived } });
        if (changed.count !== 1) throw Error(`并发修改，停止 ${symbol}/${period}`);
      }
      if (incoming.length) stats.quarterlyWrites += await upsertQuarterlyFundamentals(symbol, incoming, { fillMissing: true });
      for (const row of annualPlanned) await prisma.$transaction(async tx => {
        const period = `FY${row.fiscalDate}`, fiscalDate = new Date(`${row.fiscalDate}T00:00:00Z`);
        const old = await tx.equityFundamentalSnapshot.findUnique({ where: { symbol_period: { symbol, period } } });
        const planned = planAnnualWrite(row, old);
        if (!planned) return;
        const values = { revenue: planned.revenue, netIncome: planned.netIncome, ocf: planned.ocf, capex: planned.capex };
        await tx.equityFundamentalSnapshot.upsert({ where: { symbol_period: { symbol, period } },
          create: { symbol, period, periodType: "FY12", fiscalDate, asOf: fiscalDate, ...values },
          update: { periodType: "FY12", fiscalDate, asOf: fiscalDate, ...values },
        });
      }, { timeout: 10000, isolationLevel: "Serializable" });
    } else stats.quarterlyWrites += plan?.rows.length ?? 0;
    stats.companies++; stats.fiscalDateRepairs += dateRepairs.length; stats.capexCorrections += corrections.filter(r => r.field === "capex").length; stats.ocfCorrections += corrections.filter(r => r.field === "ocf").length; stats.annualWrites += annualPlanned.length; stats.annualCandidates += annual.length;
    stats.unresolvedPartialCapex += corrections.filter(r => r.field === "capex" && r.after == null).length;
    stats.revenueCorrections += corrections.filter(r => r.field === "revenue").length;
    console.log(JSON.stringify({ symbol, ...stats, apply }));
  }
  log({ totals: stats, apply });
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
