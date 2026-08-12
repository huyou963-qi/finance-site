import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchSafeExternalHistory } from "../../src/lib/data/scheduler/safeExternal/client";
import { SAFE_DATASETS, type SafeDataset } from "../../src/lib/data/scheduler/safeExternal/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
const datasetArg = process.argv.find((arg) => arg.startsWith("--dataset="))?.slice("--dataset=".length);
const requestedDatasets: SafeDataset[] | undefined = datasetArg
  ? datasetArg.split(",").map((key) => key.trim()).filter((key): key is SafeDataset => SAFE_DATASETS.some((dataset) => dataset.key === key))
  : undefined;
if (datasetArg && !requestedDatasets?.length) throw new Error(`未知 SAFE dataset: ${datasetArg}`);
async function main() { console.log(`[data:sync-safe-external] 正在获取外管局公开时间序列表 dataset=${requestedDatasets?.join(",") ?? "all"}…`); const history = await fetchSafeExternalHistory(requestedDatasets ? { datasets: requestedDatasets } : undefined); let upserted = 0; for (const series of history.values()) { const item = await prisma.instrument.findUnique({ where: { code: series.code }, select: { id: true } }); if (!item) throw new Error(`未找到 ${series.code}，请先运行 data:seed-safe-external`); upserted += (await upsertMacroObservations(prisma, item.id, series.points)).upserted; } console.log(`[data:sync-safe-external] 完成：序列=${history.size}，upserted=${upserted}`); }
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
