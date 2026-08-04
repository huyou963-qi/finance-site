/**
 * 国家统计局中国 PMI 官方 Excel：抓取并幂等写入 24 条 headline / 分项历史。
 *
 * npm run data:sync-nbs-pmi
 * npm run data:sync-nbs-pmi -- --fixture=.data/nbs-pmi-sample.xls
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchNbsPmiWorkbook } from "../../src/lib/data/scheduler/nbsPmi/client";
import { NBS_PMI_INSTRUMENTS } from "../../src/lib/data/scheduler/nbsPmi/catalog";
import {
  fetchNbsPmiHistory,
  mergeNbsPmiPoints,
} from "../../src/lib/data/scheduler/nbsPmi/historyClient";
import { parseNbsPmiWorkbook } from "../../src/lib/data/scheduler/nbsPmi/parseWorkbook";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

async function removeLegacyHeadlineMonthDuplicates(): Promise<number> {
  let removed = 0;
  for (const code of ["chov_c05_mfg_pmi", "chov_c06_nm_pmi"]) {
    const instrument = await prisma.instrument.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!instrument) continue;
    const observations = await prisma.macroObservation.findMany({
      where: { instrumentId: instrument.id },
      select: { id: true, obsDate: true },
    });
    const canonicalMonths = new Set(
      observations
        .filter((row) => row.obsDate.getUTCDate() === 1)
        .map(
          (row) =>
            `${row.obsDate.getUTCFullYear()}-${String(row.obsDate.getUTCMonth() + 1).padStart(2, "0")}`,
        ),
    );
    const duplicateIds = observations
      .filter(
        (row) =>
          row.obsDate.getUTCDate() !== 1 &&
          canonicalMonths.has(
            `${row.obsDate.getUTCFullYear()}-${String(row.obsDate.getUTCMonth() + 1).padStart(2, "0")}`,
          ),
      )
      .map((row) => row.id);
    if (duplicateIds.length > 0) {
      removed += (
        await prisma.macroObservation.deleteMany({
          where: { id: { in: duplicateIds } },
        })
      ).count;
    }
  }
  return removed;
}

async function main() {
  const fixturePath = argValue("fixture");
  const source = await fetchNbsPmiWorkbook(fixturePath ? { fixturePath } : undefined);
  const parsed = parseNbsPmiWorkbook(source.workbook);
  const history = fixturePath ? null : await fetchNbsPmiHistory();
  const pointsByInstrument = history
    ? mergeNbsPmiPoints(history.pointsByInstrument, parsed.pointsByInstrument)
    : parsed.pointsByInstrument;
  console.log(
    `[sync-nbs-pmi] ${fixturePath ? `fixture=${fixturePath}` : source.workbookUrl} · ` +
      `${pointsByInstrument.size} 序列 · 最新 ${parsed.sourceLatestObsDate.toISOString().slice(0, 10)}` +
      `${history ? " · 新版国家数据全历史 + 月报覆盖" : ""}`,
  );

  let upserted = 0;
  let unchanged = 0;
  for (const definition of NBS_PMI_INSTRUMENTS) {
    const instrument = await prisma.instrument.findUnique({
      where: { code: definition.code },
      select: { id: true },
    });
    if (!instrument) {
      throw new Error(`未找到仪器 ${definition.code}，请先 npm run data:seed-nbs-pmi`);
    }
    const points = pointsByInstrument.get(definition.code);
    if (!points) throw new Error(`解析结果缺少 ${definition.code}`);
    const result = await upsertMacroObservations(prisma, instrument.id, points);
    upserted += result.upserted;
    unchanged += result.unchanged;
    console.log(
      `  ${definition.code.padEnd(40)} points=${points.length} upserted=${result.upserted} unchanged=${result.unchanged}`,
    );
  }

  const headline = pointsByInstrument.get("chov_c05_mfg_pmi")!.at(-1)!;
  const component = pointsByInstrument.get("nbs_cn_non_mfg_new_orders")!.at(-1)!;
  console.log(
    `[sync-nbs-pmi] 样例：制造业PMI=${headline.value}，非制造业新订单=${component.value} ` +
      `(${headline.obsDate.toISOString().slice(0, 10)})`,
  );
  const legacyDuplicatesRemoved = await removeLegacyHeadlineMonthDuplicates();
  console.log(
    `[sync-nbs-pmi] 完成：upserted=${upserted} unchanged=${unchanged} ` +
      `legacyHeadlineDuplicatesRemoved=${legacyDuplicatesRemoved}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
