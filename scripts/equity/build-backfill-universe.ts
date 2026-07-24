/**
 * 生成「深历史基本面回填名单」：index_constituent 历史成分并集 ∩ equity_security（有 CIK）。
 *
 * 为什么要显式名单：`equity_security` 含全美股宇宙且 marketCap 多为 null，
 * sync-fundamentals 默认排序会拿到字母序小盘股 —— 回填必须按历史成分并集定名单。
 *
 * Usage:
 *   npm run equity:build-backfill-universe                      # 打印统计 + 名单到 stdout
 *   npm run equity:build-backfill-universe -- --from=2010-01-01 --out=tmp/backfill-universe.txt
 *
 * 产物文件：每行一个 symbol（`#` 开头为注释），供 sync-fundamentals --symbols-file 消费。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

async function main() {
  const from = argValue("--from") ?? "2010-01-01";
  const out = argValue("--out");

  const members = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { gte: new Date(`${from}T00:00:00.000Z`) } },
    select: { symbol: true },
    distinct: ["symbol"],
  });
  const historical = [...new Set(members.map((m) => m.symbol))].sort();

  const secs = await prisma.equitySecurity.findMany({
    where: { symbol: { in: historical } },
    select: { symbol: true, cik: true },
  });
  const withCik = secs.filter((s) => s.cik).map((s) => s.symbol).sort();
  const noCik = secs.filter((s) => !s.cik).map((s) => s.symbol).sort();
  const known = new Set(secs.map((s) => s.symbol));
  const missing = historical.filter((s) => !known.has(s));

  console.log(
    JSON.stringify(
      {
        from,
        historicalUnion: historical.length,
        inEquitySecurity: secs.length,
        withCik: withCik.length,
        withoutCik: noCik.length,
        // 不在证券主表 = Phase 1 已知的无价退市股，SEC 拉不到，覆盖率报表单列
        notInSecurityTable: missing.length,
      },
      null,
      2,
    ),
  );
  if (noCik.length) console.log(`无 CIK（跳过）：${noCik.join(",")}`);

  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    const header = [
      `# 深历史基本面回填名单 generated ${new Date().toISOString().slice(0, 10)}`,
      `# 口径：index_constituent as_of_date>=${from} 并集 ∩ equity_security(cik not null)`,
      `# 计数：并集 ${historical.length} / 可拉 ${withCik.length} / 不在证券主表 ${missing.length}`,
    ].join("\n");
    writeFileSync(out, `${header}\n${withCik.join("\n")}\n`, "utf8");
    console.log(`已写入 ${out}（${withCik.length} 个 symbol）`);
  } else {
    console.log(withCik.join(","));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
