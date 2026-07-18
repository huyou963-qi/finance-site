/**
 * debtcap 来源标签归位：从「xlsx 导入」改标为「BIS API 订阅」。
 *
 * 背景：这 22 条指标最初由 `国家偿债能力.xlsx` 引导入库，metadata 一直留着
 * `sourceTag: "debt-capacity-xlsx"`。数据早已改由 BIS SDMX 订阅自动更新，该标签
 * 现在有三处实际危害（不只是显示不对）：
 *
 *   1. `MacroSection.tsx` 的来源列在 `metadata.source` 缺失时回退显示 sourceTag，
 *      于是页面上写着「来源: debt-capacity-xlsx」；
 *   2. `isExcelTemplateInstrument()` 把任何 `-xlsx` 结尾的 sourceTag 判为 Excel 导入，
 *      导致 `effectiveFetchAcquisition()` 强制把状态压成 pending（「须确认网络自动源」），
 *      掩盖了这些指标其实已有可用的 BIS 订阅；
 *   3. `XLSX_IMPORT_BY_SOURCE_TAG` 会据此建议「跑 db:import-debt-capacity-xlsx 更新」，
 *      而重跑该导入会把季末口径的重复行灌回来，正是刚清理掉的问题。
 *
 * 保留 `workbook` / `sheet` 字段：它们无代码读取，仅作历史引导来源的记录。
 *
 * npm run data:retag-debtcap -- --dry-run
 * npm run data:retag-debtcap
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const NEW_SOURCE = "国际清算银行";
const NEW_SOURCE_TAG = "debtcap-bis-seed";
const OLD_SOURCE_TAG = "debt-capacity-xlsx";
const UPDATE_NOTE =
  "BIS SDMX API 自动更新（WS_TC 总信贷 / WS_DSR 偿债率，季频，probe_interval 72h）。" +
  "全量重拉用 npm run data:refetch-debtcap；勿再跑 db:import-debt-capacity-xlsx（季末口径会与季初口径冲突）。";

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = argFlag("dry-run");

  const insts = await prisma.instrument.findMany({
    where: { code: { startsWith: "debtcap_" } },
    select: { id: true, code: true, metadata: true },
    orderBy: { code: "asc" },
  });

  console.log(
    `[retag-debtcap] ${insts.length} 条指标，${dryRun ? "DRY RUN（不写库）" : "写库"}\n`,
  );

  let changed = 0;
  let skipped = 0;

  for (const inst of insts) {
    const meta = (inst.metadata ?? {}) as Record<string, unknown>;
    const curSource = meta.source;
    const curTag = meta.sourceTag;

    if (curSource === NEW_SOURCE && curTag === NEW_SOURCE_TAG) {
      skipped++;
      continue;
    }

    const next = {
      ...meta,
      source: NEW_SOURCE,
      sourceTag: NEW_SOURCE_TAG,
      sourceUpdateNote: UPDATE_NOTE,
    };

    console.log(
      `${dryRun ? "·" : "✓"} ${inst.code.padEnd(48)} ` +
        `source ${String(curSource ?? "(缺失)")} → ${NEW_SOURCE}；` +
        `sourceTag ${String(curTag ?? "(缺失)")} → ${NEW_SOURCE_TAG}`,
    );

    if (!dryRun) {
      await prisma.instrument.update({
        where: { id: inst.id },
        data: { metadata: next },
      });
    }
    changed++;
  }

  console.log(
    `\n[retag-debtcap] ${dryRun ? "待改" : "已改"} ${changed} 条，已是目标状态 ${skipped} 条`,
  );

  if (!dryRun && changed > 0) {
    const leftover = await prisma.instrument.count({
      where: {
        code: { startsWith: "debtcap_" },
        metadata: { path: ["sourceTag"], equals: OLD_SOURCE_TAG },
      },
    });
    console.log(`[retag-debtcap] 仍带旧标签的指标：${leftover} 条`);
    console.log(
      "\n下一步：npm run data:probe-sources -- --scope=all --prefix=debtcap_" +
        "\n  （metadata.fetchAcquisition 里还记着修复前的 WS_CREDIT_GAP 序列，需重新探测覆盖）",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
