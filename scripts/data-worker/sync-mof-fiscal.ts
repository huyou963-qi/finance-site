import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchMofFiscalHistory } from "../../src/lib/data/scheduler/mofFiscal/client";
import { MOF_FISCAL_COMPONENTS, mofFiscalCode, type FiscalMeasure } from "../../src/lib/data/scheduler/mofFiscal/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("[data:sync-mof-fiscal] 正在获取财政部完整历史归档（2015 年起）…");
  const history = await fetchMofFiscalHistory();
  const series = MOF_FISCAL_COMPONENTS.flatMap(component => (["amount", "yoy"] as const satisfies readonly FiscalMeasure[]).map(measure => ({ code: mofFiscalCode(component.key, measure), points: history.get(component.key)?.get(measure) ?? [] })));
  // A parser or source regression must never delete existing instruments or observations.
  const missing = series.filter(item => !item.points.length);
  if (missing.length) throw new Error(`财政部归档缺少已登记分项，停止回填：${missing.map(item => item.code).join(", ")}`);
  const instruments = await prisma.instrument.findMany({ where: { code: { in: series.map(item => item.code) } }, select: { id: true, code: true } });
  if (instruments.length !== series.length) throw new Error("财政部指标未全部 seed，停止回填");
  let upserted = 0;
  for (const item of series) {
    const instrument = instruments.find(candidate => candidate.code === item.code)!;
    if (!dryRun) upserted += (await upsertMacroObservations(prisma, instrument.id, item.points)).upserted;
    console.log(`${item.code}: ${item.points.length} ${item.points[0]!.obsDate.toISOString().slice(0,7)}..${item.points.at(-1)!.obsDate.toISOString().slice(0,7)}`);
  }
  console.log(`[data:sync-mof-fiscal] ${dryRun ? "只读预检" : "完成"}：series=${series.length}，upserted=${upserted}。本脚本仅回填；调度健康请通过 worker / sync-one 验证。`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
