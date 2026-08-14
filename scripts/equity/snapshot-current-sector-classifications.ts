import { prisma } from "../../src/lib/prisma";
import { normalizeGicsSector } from "../../src/lib/equity/gicsCatalog";
import { upsertClassificationHistory } from "../../src/lib/equity/sectorClassificationHistory";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
  const source = arg("source") ?? "equity-security-current-snapshot";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`非法 --as-of=${asOf}`);
  const securities = await prisma.equitySecurity.findMany({
    where: { gicsSector: { not: null } },
    select: {
      symbol: true,
      gicsSector: true,
      gicsIndustryGroup: true,
      gicsIndustry: true,
      gicsSubIndustry: true,
      gicsIndustryCode: true,
    },
  });
  const openRows = await prisma.equitySectorClassificationHistory.findMany({
    where: { scheme: "gics", validTo: null },
  });
  const openBySymbol = new Map(openRows.map((row) => [row.symbol, row]));
  const rows = securities.flatMap((security) => {
    const sector = normalizeGicsSector(security.gicsSector);
    const previous = openBySymbol.get(security.symbol);
    const unchanged = previous != null && sector === previous.sector &&
      security.gicsIndustryGroup === previous.industryGroup &&
      security.gicsIndustry === previous.industry &&
      security.gicsSubIndustry === previous.subIndustry &&
      security.gicsIndustryCode === previous.industryCode;
    if (unchanged) return [];
    return sector
      ? [{
          symbol: security.symbol,
          scheme: "gics",
          sector,
          industryGroup: security.gicsIndustryGroup,
          industry: security.gicsIndustry,
          subIndustry: security.gicsSubIndustry,
          industryCode: security.gicsIndustryCode,
          sic: null,
          sicDescription: null,
          validFrom: asOf,
          validTo: null,
          source,
          confidence: 1,
        }]
      : [];
  });
  const changedSymbols = new Set(rows.map((row) => row.symbol));
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const previousDay = new Date(asOfDate.getTime() - 86_400_000);
  const rowsToClose = openRows.filter((row) => changedSymbols.has(row.symbol) && row.validFrom < asOfDate);
  const invalidFuture = openRows.find((row) => changedSymbols.has(row.symbol) && row.validFrom > asOfDate);
  if (invalidFuture) throw new Error(`${invalidFuture.symbol} 已有晚于 ${asOf} 的开放分类记录，拒绝倒序快照`);
  if (!process.argv.includes("--dry-run") && rowsToClose.length) {
    await prisma.$transaction(rowsToClose.map((row) => prisma.equitySectorClassificationHistory.update({
      where: { id: row.id },
      data: { validTo: previousDay },
    })));
  }
  const count = process.argv.includes("--dry-run") ? rows.length : await upsertClassificationHistory(rows);
  console.log(`${process.argv.includes("--dry-run") ? "验证" : "写入"} ${count} 条变更后的当前 GICS 观察，关闭 ${rowsToClose.length} 条旧区间；不回填 ${asOf} 之前历史`);
}

main().finally(() => prisma.$disconnect());
