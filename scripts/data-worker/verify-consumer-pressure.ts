import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { CONSUMER_PRESSURE_FRED, NYFED_HHDC_SERIES, NYFED_HHDC_PACKAGE, CONSUMER_CORE_REUSED } from "../../src/lib/data/scheduler/consumerPressure/catalog";
import { sanitizeCatalogLayoutDocument } from "../../src/lib/data/catalogLayout";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const rows = [
    ...CONSUMER_PRESSURE_FRED.map(r => ({ code: `sched_fred_${r.fredId}`, packageId: r.packageId, startYear: r.fredId.startsWith("RCC") ? 2012 : r.fredId.includes("193034") ? 1945 : 1987 })),
    ...NYFED_HHDC_SERIES.map(r => ({ code: r.code, packageId: NYFED_HHDC_PACKAGE, startYear: 2003 })),
    ...CONSUMER_CORE_REUSED.map(id => ({ code: `sched_fred_${id}`, packageId: id === "PCEC96" ? "us.bea.personal_income" : null, startYear: null })),
  ];
  for (const row of rows) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!inst) throw new Error(`Missing instrument: ${row.code}`);
    const [sub, first, latest, count] = await Promise.all([
      prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } }),
      prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } }),
      prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "desc" } }),
      prisma.macroObservation.count({ where: { instrumentId: inst.id } }),
    ]);
    const staged = process.argv.includes("--allow-staged-nyfed") && row.code.startsWith("nyfed_hhdc_");
    if (!sub || (!sub.enabled && !staged) || !sub.nextRunAt || !first || !latest || !count) throw new Error(`Missing history/schedule: ${row.code}`);
    if (row.packageId && sub.releasePackageId !== row.packageId) throw new Error(`Wrong package: ${row.code}`);
    if (row.startYear && first.obsDate.getUTCFullYear() > row.startYear) throw new Error(`History incomplete: ${row.code}`);
    const cutoff = new Date(); cutoff.setUTCMonth(cutoff.getUTCMonth() - (inst.freqLabel === "月" ? 4 : 10));
    if (latest.obsDate < cutoff) throw new Error(`Stale observations: ${row.code}`);
    console.log(JSON.stringify({ code: row.code, count, first: first.obsDate, latest: latest.obsDate, value: latest.value, enabled: sub.enabled, package: sub.releasePackageId, nextRunAt: sub.nextRunAt }));
  }
  const saved = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  const layout = saved && sanitizeCatalogLayoutDocument(saved.layout);
  const us = layout?.countries.find(c => c.countryCode === "US");
  if (saved && !us) throw new Error("US catalog layout missing");
  const expected = [...CONSUMER_PRESSURE_FRED.map(r => ({ key: `fred:${r.fredId}`, subgroup: r.subgroup })), ...NYFED_HHDC_SERIES.map(r => ({ key: `mds:${r.code}`, subgroup: "居民消费信贷" }))];
  for (const row of expected) {
    if (!us) continue;
    const groups = us.categories.filter(c => c.name === "金融条件与银行").flatMap(c => c.subgroups).filter(g => g.itemKeys.includes(row.key));
    if (groups.length !== 1 || groups[0].name !== row.subgroup || groups[0].itemKeys.length > 48) throw new Error(`Wrong catalog leaf: ${row.key}`);
  }
  console.log("[consumer-pressure] history, packages and catalog placement verified");
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
