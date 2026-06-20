/**
 * 为缺少 [era:parent:…] 的旧事件按发生日期补全时代归属标记。
 *
 * Usage:
 *   npm run db:patch-market-events-era
 */
import { loadEnvConfig } from "@next/env";
import { findEraCatalogEntryByDate } from "../src/lib/data/usHistoryEraCatalog";
import { prisma } from "../src/lib/prisma";

loadEnvConfig(process.cwd());

async function main() {
  const rows = await prisma.marketEvent.findMany({
    where: { eventType: { not: "时代阶段" } },
    select: { id: true, title: true, content: true, occurredAt: true, industries: true },
  });

  let patched = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.content.includes("[era:parent:")) {
      skipped++;
      continue;
    }
    const entry = findEraCatalogEntryByDate(row.occurredAt.toISOString());
    if (!entry) continue;

    const parentLine = `[era:parent:${entry.seedKey}]`;
    const tagLine = `[era:tag:${entry.tag}]`;
    const content = `${row.content.trim()}\n\n${parentLine}\n${tagLine}`;
    const industries = [...new Set([...row.industries, entry.tag])];

    await prisma.marketEvent.update({
      where: { id: row.id },
      data: { content, industries },
    });
    patched++;
  }

  console.log(
    `[patch-market-events-era] total=${rows.length} patched=${patched} alreadyTagged=${skipped}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
