/**
 * 从 ISM 官网月报写入制造业 + 服务业分项（fixture 调试或 live）。
 *
 * npm run data:sync-ism-official -- --fixture-mfg=src/lib/data/scheduler/ismOfficial/fixtures/mfg-july-2026.snippet.html --fixture-svc=src/lib/data/scheduler/ismOfficial/fixtures/svc-july-2026.snippet.html
 * npm run data:sync-ism-official
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  clearIsmOfficialAdapterCache,
  fetchAllIsmOfficialPoints,
} from "../../src/lib/data/scheduler/adapters/ismOfficialAdapter";
import {
  ISM_OFFICIAL_MFG_SERIES,
  ISM_OFFICIAL_SVC_SERIES,
} from "../../src/lib/data/scheduler/ismOfficial/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

async function writeKind(
  kind: "manufacturing" | "services",
  fixturePath: string | undefined,
): Promise<number> {
  const parsed = await fetchAllIsmOfficialPoints(kind, { fixturePath });
  const series = kind === "manufacturing" ? ISM_OFFICIAL_MFG_SERIES : ISM_OFFICIAL_SVC_SERIES;
  console.info(
    `[fetch ${kind}] obs=${parsed.obsDate.toISOString().slice(0, 10)} points=${parsed.pointsByCode.size} title=${parsed.titleMonthText}`,
  );

  let upsertedTotal = 0;
  for (const row of series) {
    const point = parsed.pointsByCode.get(row.code);
    const inst = await prisma.instrument.findUnique({
      where: { code: row.code },
      select: { id: true, dataSubscription: { select: { id: true } } },
    });
    if (!inst) {
      console.warn(`[skip] 未找到 ${row.code}（先 seed）`);
      continue;
    }
    if (!point) {
      console.warn(`[skip] 官网表未解析到 ${row.officialLabel}`);
      continue;
    }
    const { upserted } = await upsertMacroObservations(prisma, inst.id, [point]);
    upsertedTotal += upserted;
    if (inst.dataSubscription) {
      await prisma.dataSubscription.update({
        where: { id: inst.dataSubscription.id },
        data: {
          lastObsDate: point.obsDate,
          lastSuccessAt: new Date(),
          lastError: null,
        },
      });
    }
    console.info(
      `[ok] ${row.code} | ${point.value} | obs=${point.obsDate.toISOString().slice(0, 10)} | +${upserted}`,
    );
  }
  return upsertedTotal;
}

async function main() {
  clearIsmOfficialAdapterCache();
  const mfgFix = argValue("fixture-mfg");
  const svcFix = argValue("fixture-svc");
  const only = argValue("only");
  let total = 0;
  if (only !== "services") total += await writeKind("manufacturing", mfgFix);
  if (only !== "manufacturing") total += await writeKind("services", svcFix);
  console.info(`[done] upserted ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
