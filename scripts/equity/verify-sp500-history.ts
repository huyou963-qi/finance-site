/**
 * 验收 WS2：历史成分重建抽查（读 mds.index_constituent）。
 * - 2010/2015/2020 三时点规模与关键成员（DD 老公司、AAPL）
 * - TSLA 2020-12-21 纳入：2020-11-30 不在、2020-12-31 在
 * - as-of 语义演示：任意 T 取 max(asOfDate) ≤ T 的那期名单
 *
 * Usage: npm run equity:verify-sp500-history
 */
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";

async function membershipAsOf(dateIso: string): Promise<{ asOf: string; symbols: string[] }> {
  const t = new Date(`${dateIso}T00:00:00.000Z`);
  const latest = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { lte: t } },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (!latest) return { asOf: "-", symbols: [] };
  const rows = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: latest.asOfDate },
    select: { symbol: true },
  });
  return {
    asOf: latest.asOfDate.toISOString().slice(0, 10),
    symbols: rows.map((r) => r.symbol).sort(),
  };
}

async function main() {
  let failures = 0;
  const check = (label: string, cond: boolean) => {
    console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
    if (!cond) failures += 1;
  };

  for (const probe of ["2010-06-30", "2015-06-30", "2020-06-30"]) {
    const m = await membershipAsOf(probe);
    check(
      `${probe} 名单规模 ${m.symbols.length} ∈ [495,510]（快照期 ${m.asOf}）`,
      m.symbols.length >= 495 && m.symbols.length <= 510,
    );
    check(`${probe} 含 AAPL`, m.symbols.includes("AAPL"));
  }

  const m2015 = await membershipAsOf("2015-06-30");
  check("2015-06-30 含 DD（老 DuPont）", m2015.symbols.includes("DD"));
  check("2015-06-30 不含 TSLA", !m2015.symbols.includes("TSLA"));

  const nov = await membershipAsOf("2020-11-30");
  const dec = await membershipAsOf("2020-12-31");
  check(`2020-11-30 不含 TSLA（快照期 ${nov.asOf}）`, !nov.symbols.includes("TSLA"));
  check(`2020-12-31 含 TSLA（快照期 ${dec.asOf}）`, dec.symbols.includes("TSLA"));

  const m2010 = await membershipAsOf("2010-06-30");
  check("2010-06-30 含 META（当时的 FB 尚未上市 → 应不含）", !m2010.symbols.includes("META"));
  const m2015b = await membershipAsOf("2015-06-30");
  check("2015-06-30 含 META（FB 2013-12 纳入，历史行按现 symbol 表达）", m2015b.symbols.includes("META"));

  console.log(failures === 0 ? "\n全部通过 ✔" : `\n${failures} 项失败 ✘`);
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
