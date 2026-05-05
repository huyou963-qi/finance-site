/**
 * 将一次性导入库 schema `h` 中的目录与指标并入 mds（本系统编码，不保留万得 ID）。
 * 使用确定性 code：与库内回填规则一致 m_ + md5(来源行主键)，便于幂等 upsert。
 *
 * 前置：PostgreSQL 中存在 h."Category"、h."Ind_Info"（例如曾执行 db:import-mysql-h）。
 */
import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { instrumentCodeFromSeriesKey } from "../src/lib/mdsInstrumentCode";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function categoryCode(legacyCatId: bigint | number | string): string {
  const s = String(legacyCatId);
  return `c_${crypto.createHash("md5").update(`cat|${s}`).digest("hex").slice(0, 32)}`;
}

type HCat = {
  name: string;
  cat_id: bigint;
  parent_id: bigint | null;
  skip: number | null;
};

type HInd = {
  wd_id: string;
  indname: string | null;
  freq: string | null;
  unit: string | null;
  starttime: string | null;
  endtime: string | null;
  refreshtime: Date | string | null;
  source: string | null;
  country: string | null;
  cat_id: bigint | null;
};

async function main() {
  const [{ exists }] =
    await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'h') AS exists
  `;
  if (!exists) {
    console.warn('Schema "h" not found — nothing to merge.');
    return;
  }

  const cats = await prisma.$queryRaw<HCat[]>`
    SELECT name, cat_id, parent_id, skip FROM h."Category"
  `;
  const catKeyToUuid = new Map<string, string>();

  const pending = new Map<string, HCat>(cats.map((c) => [String(c.cat_id), c]));
  let guard = 0;
  while (pending.size > 0 && guard++ < 5000) {
    let progressed = false;
    for (const [cid, row] of [...pending.entries()]) {
      const ok =
        row.parent_id == null || catKeyToUuid.has(String(row.parent_id));
      if (!ok) continue;

      const code = categoryCode(row.cat_id);
      const parentUuid =
        row.parent_id != null ? catKeyToUuid.get(String(row.parent_id)) ?? null : null;

      await prisma.macroCategory.upsert({
        where: { code },
        create: {
          code,
          name: row.name,
          parentId: parentUuid,
          sortOrder: row.skip ?? 0,
          metadata: { legacyImport: { source: "h.Category", catId: String(row.cat_id) } } as object,
        },
        update: {
          name: row.name,
          parentId: parentUuid,
          sortOrder: row.skip ?? 0,
        },
      });

      const saved = await prisma.macroCategory.findUnique({ where: { code } });
      if (!saved) throw new Error(`MacroCategory missing after upsert: ${code}`);
      catKeyToUuid.set(cid, saved.id);
      pending.delete(cid);
      progressed = true;
    }
    if (!progressed) {
      console.error("Category tree has unresolved parents — abort.");
      process.exitCode = 1;
      return;
    }
  }

  console.info(`Synced ${catKeyToUuid.size} macro categories.`);

  const inds = await prisma.$queryRaw<HInd[]>`
    SELECT wd_id, indname, freq, unit, starttime, endtime, refreshtime, source, country, cat_id
    FROM h."Ind_Info"
  `;

  let n = 0;
  for (const r of inds) {
    const code = instrumentCodeFromSeriesKey(r.wd_id);
    const categoryId =
      r.cat_id != null ? catKeyToUuid.get(String(r.cat_id)) ?? null : null;

    const metadata = {
      catalogRange: { start: r.starttime, end: r.endtime },
      refresh: r.refreshtime,
      providerNote: r.source,
      region: r.country,
    };

    await prisma.instrument.upsert({
      where: { code },
      create: {
        code,
        kind: "MACRO_SERIES",
        name: r.indname?.trim() || code,
        freqLabel: r.freq,
        unit: r.unit,
        categoryId,
        metadata: metadata as object,
      },
      update: {
        name: r.indname?.trim() || code,
        freqLabel: r.freq,
        unit: r.unit,
        categoryId,
        metadata: metadata as object,
      },
    });
    n += 1;
    if (n % 500 === 0) console.info(`… ${n} instruments`);
  }

  console.info(`Synced ${n} instruments from h."Ind_Info".`);
  console.info(
    "完成后若不再需要原始宽表，可在 Postgres 中执行 scripts/drop-legacy-h-schema.sql（请先备份）。",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
