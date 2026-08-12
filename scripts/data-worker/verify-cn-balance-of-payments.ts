import { PrismaClient } from "@prisma/client";

type InputSpec = {
  code: string;
  label: string;
  packageId: string;
  minimumCount: number;
  earliestLatest: string;
};

const INPUTS: readonly InputSpec[] = [
  { code: "safe_cn_bop_current_account", label: "经常账户差额", packageId: "cn.safe.bop-quarterly", minimumCount: 100, earliestLatest: "2025-12-01" },
  { code: "safe_cn_bop_goods_balance", label: "货物差额", packageId: "cn.safe.bop-quarterly", minimumCount: 100, earliestLatest: "2025-12-01" },
  { code: "safe_cn_bop_services_balance", label: "服务差额", packageId: "cn.safe.bop-quarterly", minimumCount: 100, earliestLatest: "2025-12-01" },
  { code: "safe_cn_bop_direct_investment_net", label: "直接投资净额", packageId: "cn.safe.bop-quarterly", minimumCount: 100, earliestLatest: "2025-12-01" },
  { code: "safe_cn_bop_portfolio_investment_net", label: "证券投资净额", packageId: "cn.safe.bop-quarterly", minimumCount: 100, earliestLatest: "2025-12-01" },
  { code: "safe_cn_bop_other_investment_net", label: "其他投资净额", packageId: "cn.safe.bop-quarterly", minimumCount: 100, earliestLatest: "2025-12-01" },
  { code: "safe_cn_settlement_6b1b40a90c3a", label: "银行结售汇差额", packageId: "cn.safe.external", minimumCount: 180, earliestLatest: "2026-05-01" },
  { code: "safe_cn_payments_36f49c28853c", label: "银行代客涉外收付款差额", packageId: "cn.safe.external", minimumCount: 180, earliestLatest: "2026-05-01" },
  { code: "safe_cn_iip_d2af2fbaf002", label: "净国际投资头寸", packageId: "cn.safe.iip-quarterly", minimumCount: 55, earliestLatest: "2025-12-01" },
  { code: "safe_cn_iip_8d7e57a2760c", label: "储备资产", packageId: "cn.safe.iip-quarterly", minimumCount: 55, earliestLatest: "2025-12-01" },
  { code: "safe_cn_debt_ce941250bdad", label: "外债总额", packageId: "cn.safe.external-debt-quarterly", minimumCount: 40, earliestLatest: "2025-12-01" },
] as const;

const quarterKey = (date: Date) => {
  const month = date.getUTCMonth() + 1;
  return `${date.getUTCFullYear()}Q${Math.ceil(month / 3)}`;
};

async function main() {
  if (!process.argv.includes("--db")) {
    console.log(`[verify-cn-balance-of-payments] catalog 通过：raw=${INPUTS.length} derived=1`);
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const instruments = await prisma.instrument.findMany({
      where: { code: { in: INPUTS.map((item) => item.code) } },
      include: { dataSubscription: true },
    });
    const byCode = new Map(instruments.map((item) => [item.code, item]));

    for (const spec of INPUTS) {
      const item = byCode.get(spec.code);
      const aggregate = item
        ? await prisma.macroObservation.aggregate({
            where: { instrumentId: item.id },
            _count: true,
            _min: { obsDate: true },
            _max: { obsDate: true },
          })
        : null;
      const count = aggregate?._count ?? 0;
      const latest = aggregate?._max.obsDate?.toISOString().slice(0, 10) ?? "none";
      const unit = String(item?.unit ?? "").replace(/[）)]$/u, "");
      const valid =
        item != null &&
        item.dataSubscription?.enabled === true &&
        item.dataSubscription.sourceId === "safe-external" &&
        item.dataSubscription.releasePackageId === spec.packageId &&
        count >= spec.minimumCount &&
        latest >= spec.earliestLatest &&
        unit === "亿美元";
      console.log(
        `${valid ? "✓" : "✗"} ${spec.label} (${spec.code}) observations=${count} ` +
          `range=${aggregate?._min.obsDate?.toISOString().slice(0, 10) ?? "none"}→${latest} ` +
          `package=${item?.dataSubscription?.releasePackageId ?? "none"} unit=${item?.unit ?? "none"}`,
      );
      if (!valid) errors += 1;
    }

    const reserve = byCode.get("safe_cn_iip_8d7e57a2760c");
    const debt = byCode.get("safe_cn_debt_ce941250bdad");
    const reserveRows = reserve
      ? await prisma.macroObservation.findMany({
          where: { instrumentId: reserve.id },
          orderBy: { obsDate: "asc" },
          select: { obsDate: true, value: true },
        })
      : [];
    const debtRows = debt
      ? await prisma.macroObservation.findMany({
          where: { instrumentId: debt.id },
          orderBy: { obsDate: "asc" },
          select: { obsDate: true, value: true },
        })
      : [];
    const debtByQuarter = new Map(debtRows.map((row) => [quarterKey(row.obsDate), row.value]));
    const coverage = reserveRows.flatMap((row) => {
      const denominator = debtByQuarter.get(quarterKey(row.obsDate));
      return denominator != null && denominator > 0
        ? [{ period: quarterKey(row.obsDate), value: (row.value / denominator) * 100 }]
        : [];
    });
    const latestCoverage = coverage.at(-1);
    if (coverage.length < 40 || !latestCoverage || !Number.isFinite(latestCoverage.value)) {
      console.error(`✗ 储备资产/外债总额派生不可用：overlap=${coverage.length}`);
      errors += 1;
    } else {
      console.log(
        `✓ 储备资产/外债总额：overlap=${coverage.length} latest=${latestCoverage.period} ${latestCoverage.value.toFixed(1)}%`,
      );
    }

    if (errors) throw new Error(`[verify-cn-balance-of-payments] 失败：${errors} 项异常`);
    console.log(
      `[verify-cn-balance-of-payments] 通过：raw=${INPUTS.length}/${INPUTS.length} derived=1/1`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
