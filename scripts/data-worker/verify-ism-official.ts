/**
 * ISM 官网主源自检
 *
 * npm run data:verify-ism-official
 * npm run data:verify-ism-official -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { ISM_OFFICIAL_SERIES } from "../../src/lib/data/scheduler/ismOfficial/catalog";
import { parseIsmOfficialCalendarPage } from "../../src/lib/data/scheduler/ismOfficial/parseCalendar";
import { parseIsmOfficialReport } from "../../src/lib/data/scheduler/ismOfficial/parseReport";
import fs from "node:fs";
import path from "node:path";

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const fixDir = path.join(process.cwd(), "src/lib/data/scheduler/ismOfficial/fixtures");

  const cal = parseIsmOfficialCalendarPage(
    fs.readFileSync(path.join(fixDir, "calendar-2026.snippet.html"), "utf8"),
  );
  if (cal.filter((r) => r.kind === "manufacturing").length !== 12) {
    console.error("  ✗ 日历 fixture 制造业不是 12 条");
    errors++;
  } else {
    console.log("  ✓ 日历 fixture 12 条制造业 + 12 条服务业");
  }

  const mfg = parseIsmOfficialReport(
    fs.readFileSync(path.join(fixDir, "mfg-july-2026.snippet.html"), "utf8"),
    "manufacturing",
  );
  const svc = parseIsmOfficialReport(
    fs.readFileSync(path.join(fixDir, "svc-july-2026.snippet.html"), "utf8"),
    "services",
  );
  if (mfg.pointsByCode.size !== 11 || svc.pointsByCode.size !== 11) {
    console.error(`  ✗ 报告 fixture 分项数 mfg=${mfg.pointsByCode.size} svc=${svc.pointsByCode.size}（应各 11）`);
    errors++;
  } else {
    console.log("  ✓ 制造业/服务业 At a Glance 各 11 项");
  }

  if (!useDb) {
    if (errors) process.exit(1);
    console.log("[verify-ism-official] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const row of ISM_OFFICIAL_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) {
        console.error(`  ✗ 缺 Instrument ${row.code}`);
        errors++;
        continue;
      }
      const acq = readFetchAcquisition(inst.metadata);
      const md = (inst.metadata ?? {}) as Record<string, unknown>;
      const scrape = md.scrape as Record<string, unknown> | undefined;
      if (acq?.status !== "known" || scrape?.provider !== "ism_official") {
        console.error(
          `  ✗ ${row.code} acquisition=${acq?.status ?? "无"} provider=${scrape?.provider ?? "无"}`,
        );
        errors++;
        continue;
      }
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub?.enabled || sub.sourceId !== "ism-official") {
        console.error(`  ✗ ${row.code} 订阅未指向 ism-official`);
        errors++;
        continue;
      }
      console.log(`  ✓ ${row.code} known / ism_official / ${sub.sourceId}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors) {
    console.error(`[verify-ism-official] 失败 ${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-ism-official] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
