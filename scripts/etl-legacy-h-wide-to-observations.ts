/**
 * 将 schema `h` 宽表写入 mds.MacroObservation。列名对应序列键（与 Instrument.code 同源）。
 * 请先：`npm run db:seed-mds-from-legacy-h`
 *
 *   npm run db:etl-legacy-h-observations
 *   npm run db:etl-legacy-h-observations -- --granularity=daily
 *   npm run db:etl-legacy-h-observations -- --dry-run
 */
import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { instrumentCodeFromSeriesKey } from "../src/lib/mdsInstrumentCode";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DATE_KEYS = new Set(["date", "Date", "DATE"]);

function parseArgs() {
  const argv = process.argv.slice(2);
  let granularity = "monthly";
  let rowChunk = 80;
  let dryRun = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--granularity="))
      granularity = a.slice("--granularity=".length).trim();
    else if (a.startsWith("--row-chunk="))
      rowChunk = Math.max(10, Number(a.slice("--row-chunk=".length)) || 80);
  }
  return { granularity, rowChunk, dryRun };
}

/** 仅允许已知宽表名，防止 SQL 注入 */
function resolveWideTable(g: string): "Data_D" | "Data_M" | "Data_Q" | "Data_Y" | null {
  const m: Record<string, "Data_D" | "Data_M" | "Data_Q" | "Data_Y"> = {
    daily: "Data_D",
    monthly: "Data_M",
    quarterly: "Data_Q",
    yearly: "Data_Y",
    d: "Data_D",
    m: "Data_M",
    q: "Data_Q",
    y: "Data_Y",
  };
  return m[g.toLowerCase()] ?? null;
}

function safeSeriesKeys(keys: string[]): string[] {
  return keys.filter(
    (k) =>
      !DATE_KEYS.has(k) &&
      /^[A-Za-z][A-Za-z0-9_]*$/.test(k) &&
      k.length <= 64,
  );
}

function normalizeObsDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  if (typeof v === "string") {
    const d = new Date(v.slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function main() {
  const { granularity, rowChunk, dryRun } = parseArgs();
  const wideTable = resolveWideTable(granularity);
  if (!wideTable) {
    console.error("Unknown granularity:", granularity);
    process.exitCode = 1;
    return;
  }

  const [{ exists }] =
    await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'h') AS exists
  `;
  if (!exists) {
    console.warn('Schema "h" not found.');
    return;
  }

  const tblCheck =
    await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.tables
    WHERE table_schema = 'h' AND table_name = ${wideTable}
  `;
  if (Number(tblCheck[0]?.c ?? 0) === 0) {
    console.warn(`Table h."${wideTable}" does not exist — skip.`);
    return;
  }

  const instruments = await prisma.instrument.findMany({
    where: { kind: "MACRO_SERIES" },
    select: { id: true, code: true },
  });
  const byCode = new Map(instruments.map((i) => [i.code, i.id]));

  const [countRow] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*)::bigint AS total FROM h."${wideTable}"`,
  );
  const totalRows = Number(countRow?.total ?? 0);
  console.info(
    `ETL ${wideTable}: ${totalRows} rows, chunk=${rowChunk}, dryRun=${dryRun}`,
  );

  let offset = 0;
  let inserted = 0;
  let dryRunCells = 0;
  let skippedNoInstrument = 0;
  const batch: Prisma.MacroObservationCreateManyInput[] = [];

  const flush = async () => {
    if (dryRun || batch.length === 0) return;
    await prisma.macroObservation.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    batch.length = 0;
  };

  while (offset < totalRows) {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM h."${wideTable}" ORDER BY date ASC LIMIT ${rowChunk} OFFSET ${offset}`,
    );
    if (!rows.length) break;

    const seriesKeys = safeSeriesKeys(Object.keys(rows[0] ?? {}));

    for (const row of rows) {
      const obsDate = normalizeObsDate(row.date ?? row.Date);
      if (!obsDate) continue;

      for (const key of seriesKeys) {
        const raw = row[key];
        if (raw == null) continue;
        const num = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(num)) continue;

        const code = instrumentCodeFromSeriesKey(key);
        const instrumentId = byCode.get(code);
        if (!instrumentId) {
          skippedNoInstrument++;
          continue;
        }

        if (!dryRun) {
          batch.push({
            instrumentId,
            obsDate,
            value: num,
          });
          if (batch.length >= 600) await flush();
        } else {
          dryRunCells++;
        }
      }
    }

    offset += rows.length;
    if (offset % (rowChunk * 20) === 0 || rows.length < rowChunk) {
      console.info(
        `… offset ${offset}/${totalRows}, pending ${dryRun ? dryRunCells : inserted + batch.length}`,
      );
    }

    if (rows.length < rowChunk) break;
  }

  await flush();

  console.info(
    dryRun
      ? `[dry-run] ~${dryRunCells} numeric cells matched instruments (no DB write)`
      : `Done. Inserted ${inserted} observation rows (duplicates skipped by DB).`,
  );
  if (skippedNoInstrument)
    console.info(
      `Skipped ${skippedNoInstrument} cells (no Instrument for column — seed Ind_Info first).`,
    );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
