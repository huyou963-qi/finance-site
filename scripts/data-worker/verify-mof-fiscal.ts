import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { MOF_FISCAL_CODES, MOF_FISCAL_COMPONENTS } from "../../src/lib/data/scheduler/mofFiscal/catalog";
import { fetchMofFiscalHistory } from "../../src/lib/data/scheduler/mofFiscal/client";
loadEnvConfig(process.cwd());
const BROAD_FISCAL_INPUTS = ["mof_cn_fiscal_general_expenditure_amount", "mof_cn_fiscal_fund_expenditure_amount"] as const;
async function main() {
  if (new Set(MOF_FISCAL_CODES).size !== 88 || MOF_FISCAL_COMPONENTS.length !== 44) throw new Error("财政部目录重复或分项数量异常");
  if (!process.argv.includes("--db")) return console.log("[verify-mof-fiscal] catalog 通过（88 条）");
  const prisma = new PrismaClient();
  let errors = 0;
  const fail = (message: string) => { console.error(`异常 ${message}`); errors++; };
  try {
    const live = process.argv.includes("--live") ? await fetchMofFiscalHistory(new Date().getUTCFullYear()) : null;
    const items = await prisma.instrument.findMany({ where: { code: { in: MOF_FISCAL_CODES } }, include: { dataSubscription: { include: { releasePackage: true } } } });
    for (const code of MOF_FISCAL_CODES) if (!items.some(item => item.code === code)) fail(`缺少已登记指标 ${code}`);
    const pointsByCode = new Map<string, Array<{ obsDate: Date; value: number }>>();
    for (const item of items) {
      const raw = await prisma.macroObservation.findMany({ where: { instrumentId: item.id }, orderBy: { obsDate: "asc" }, select: { obsDate: true, value: true } });
      const points = raw.map(point => ({ obsDate: point.obsDate, value: Number(point.value) }));
      pointsByCode.set(item.code,points);
      const metadata = item.metadata as Record<string, unknown> | undefined;
      const scrape = metadata?.scrape as Record<string, unknown> | undefined;
      const sub = item.dataSubscription;
      const rule = sub?.releaseRule as Record<string, unknown> | undefined;
      const packageRule = sub?.releasePackage?.releaseTemplate as Record<string, unknown> | undefined;
      if (!points.length || sub?.sourceId !== "mof-fiscal" || !sub.enabled || readFetchAcquisition(metadata)?.status !== "known" || scrape?.provider !== "mof_fiscal" || metadata?.countryCode !== "CN" || metadata?.catalogKey !== `mds:${item.code}`) fail(`${item.code} 观测/来源/metadata异常 count=${points.length}`);
      if (!sub?.releasePackageId || sub.releasePackageId !== "cn.mof.fiscal" || rule?.type !== "probe_interval" || Number(rule.intervalHours) !== 24 || packageRule?.type !== "probe_interval" || Number(packageRule.intervalHours) !== 24 || sub.revisionLookback < 36 || !sub.nextRunAt) fail(`${item.code} 发布包/24h探测/36月回读/nextRunAt未正确配置`);
      if (process.argv.includes("--require-worker")) {
        const run = sub ? await prisma.fetchRun.findFirst({ where: { subscriptionId: sub.id }, orderBy: { startedAt: "desc" }, select: { status: true, error: true } }) : null;
        if (!run || run.status === "FAILED") fail(`${item.code} 尚无成功或无新值的真实调度记录 ${run?.error ?? ""}`);
      }
      if (live && typeof scrape?.component === "string" && (scrape.measure === "amount" || scrape.measure === "yoy")) {
        const source = live.get(scrape.component)?.get(scrape.measure) ?? [];
        const last = source.at(-1);
        if (!last) fail(`${item.code} 当年源端缺少已登记分项`);
        for (const point of source) {
          const stored = points.find(candidate => candidate.obsDate.getTime() === point.obsDate.getTime());
          if (!stored || Math.abs(stored.value-point.value) > 1e-8) fail(`${item.code} 与官方源不符 ${point.obsDate.toISOString().slice(0,7)} source=${point.value} db=${stored?.value ?? "missing"}`);
        }
      }
    }
    for (const code of BROAD_FISCAL_INPUTS) {
      const byYear = new Map<number, Array<{ obsDate: Date; value: number }>>();
      for (const point of pointsByCode.get(code) ?? []) byYear.set(point.obsDate.getUTCFullYear(), [...(byYear.get(point.obsDate.getUTCFullYear()) ?? []), point]);
      for (const [year, points] of byYear) for (let index=1; index<points.length; index++) if (points[index]!.value < points[index-1]!.value) fail(`${code} ${year} 累计额倒退：${points[index-1]!.value} -> ${points[index]!.value}`);
    }
    const generalMonths = new Set((pointsByCode.get(BROAD_FISCAL_INPUTS[0]) ?? []).map(point => point.obsDate.toISOString().slice(0,7)));
    const commonMonths = (pointsByCode.get(BROAD_FISCAL_INPUTS[1]) ?? []).filter(point => generalMonths.has(point.obsDate.toISOString().slice(0,7))).length;
    if (commonMonths < 90) fail(`广义财政两本账同月交集不足：${commonMonths}`);
    // Jan is normally combined with Feb; do not report fictitious January gaps.
    const general = pointsByCode.get("mof_cn_fiscal_general_revenue_amount") ?? [];
    const present = new Set(general.map(point => point.obsDate.toISOString().slice(0,7)));
    const latest = general.at(-1)?.obsDate;
    if (latest) for (let year=2015; year<=latest.getUTCFullYear(); year++) for (let month=2; month<=12; month++) {
      const date = new Date(Date.UTC(year,month-1,1));
      const key = date.toISOString().slice(0,7);
      if (date<=latest && !present.has(key)) fail(`全国一般公共预算收入缺月 ${key}（不含一月免报）`);
    }
    console.log(`[verify-mof-fiscal] 有效序列=${items.length}，广义财政同月交集=${commonMonths}，source comparison=${!!live}，worker audit=${process.argv.includes("--require-worker")}`);
  } finally { await prisma.$disconnect(); }
  if (errors) throw new Error(`[verify-mof-fiscal] 失败：${errors}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
