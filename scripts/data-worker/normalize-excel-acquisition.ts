/**
 * 将 metadata.fetchAcquisition 中「Excel 模板再导入 + known」批量改为 pending
 *
 * npm run data:normalize-excel-acquisition -- --apply
 */
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient } from "@prisma/client";
import {
  isExcelOnlyFetchAcquisition,
  mergeFetchAcquisition,
  readFetchAcquisition,
  type FetchAcquisitionRecord,
} from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function rawFetchAcquisition(metadata: unknown): FetchAcquisitionRecord | null {
  if (!metadata || typeof metadata !== "object") return null;
  const fa = (metadata as Record<string, unknown>).fetchAcquisition;
  if (!fa || typeof fa !== "object") return null;
  const r = fa as Record<string, unknown>;
  if (r.status !== "known" && r.status !== "pending") return null;
  return {
    status: r.status as "known" | "pending",
    probedAt: String(r.probedAt ?? ""),
    method: typeof r.method === "string" ? r.method : undefined,
    methodLabel: typeof r.methodLabel === "string" ? r.methodLabel : undefined,
    message: typeof r.message === "string" ? r.message : undefined,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES },
    select: { id: true, code: true, metadata: true },
  });

  let hit = 0;
  for (const row of rows) {
    const raw = rawFetchAcquisition(row.metadata);
    if (!raw || raw.status !== "known" || !isExcelOnlyFetchAcquisition(raw)) continue;
    hit += 1;
    console.log(`  ${row.code}`);
    if (apply) {
      await prisma.instrument.update({
        where: { id: row.id },
        data: {
          metadata: mergeFetchAcquisition(row.metadata, raw) as object,
        },
      });
    }
  }

  console.log(
    `[normalize-excel-acquisition] ${hit} 条 Excel 获取标记${apply ? "已" : "将"}改为待确定${apply ? "" : "（加 --apply 写入）"}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
