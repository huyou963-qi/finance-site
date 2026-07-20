/**
 * 验收 WS4：getMacroValueAsOf 近似 PIT 语义。
 * 对 CPI/NFP（月度典型序列）检查：最新一期的估算发布日 R 满足
 * as-of(R−1天) 返回上一期观测、as-of(R) 返回最新一期观测。
 *
 * Usage: npm run db:verify-macro-asof
 */
import { prisma } from "../src/lib/prisma";
import { getMacroValueAsOf, resolveLagDays } from "../src/lib/data/macroAsOf";

const PROBES: Array<{ label: string; fredSeriesIds: string[] }> = [
  { label: "CPI", fredSeriesIds: ["CPIAUCSL", "CPIAUCNS"] },
  { label: "NFP", fredSeriesIds: ["PAYEMS"] },
];

async function main() {
  let failures = 0;
  const check = (label: string, cond: boolean) => {
    console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
    if (!cond) failures += 1;
  };

  for (const probe of PROBES) {
    const inst = await prisma.instrument.findFirst({
      where: { fredSeriesId: { in: probe.fredSeriesIds } },
      select: { id: true, code: true, name: true, fredSeriesId: true },
    });
    if (!inst) {
      console.warn(`SKIP ${probe.label}: 库内无 fredSeriesId ∈ [${probe.fredSeriesIds}]`);
      continue;
    }
    const lag = await resolveLagDays(inst.id);
    console.log(
      `\n[${probe.label}] ${inst.code}（${inst.fredSeriesId}）lag=${lag.lagDays}d source=${lag.lagSource} gran=${lag.granularity}`,
    );

    const [latest, prev] = await prisma.macroObservation.findMany({
      where: { instrumentId: inst.id },
      orderBy: { obsDate: "desc" },
      take: 2,
    });
    if (!latest || !prev) {
      console.warn(`SKIP ${probe.label}: 观测不足两期`);
      continue;
    }
    const latestIso = latest.obsDate.toISOString().slice(0, 10);
    const prevIso = prev.obsDate.toISOString().slice(0, 10);

    // 用 as-of(今天) 拿到最新可见期及其估算发布日 R
    const now = await getMacroValueAsOf(inst.id, new Date());
    check(`${probe.label} as-of(today) 可见`, now != null);
    if (!now) continue;
    console.log(
      `  最新可见期 obs=${now.obsDate}（库内最新 ${latestIso}）est发布=${now.estimatedReleaseDate}`,
    );

    const r = now.estimatedReleaseDate;
    const dayBefore = new Date(new Date(`${r}T00:00:00.000Z`).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const atR = await getMacroValueAsOf(inst.id, r);
    const beforeR = await getMacroValueAsOf(inst.id, dayBefore);
    check(`${probe.label} 发布日 ${r} 返回本期 ${now.obsDate}`, atR?.obsDate === now.obsDate);
    check(
      `${probe.label} 发布日前一天 ${dayBefore} 返回上期（≠ ${now.obsDate}）`,
      beforeR != null && beforeR.obsDate < now.obsDate,
    );
    if (now.obsDate === latestIso) {
      check(
        `${probe.label} 前一天返回的确是相邻上期 ${prevIso}`,
        beforeR?.obsDate === prevIso,
      );
    }

    // 历史抽查：一年前任意日也应有可见值且滞后语义成立
    const t = "2025-07-19";
    const hist = await getMacroValueAsOf(inst.id, t);
    check(
      `${probe.label} as-of(${t}) 有值且期末+滞后 ≤ T`,
      hist != null && hist.estimatedReleaseDate <= t,
    );
    if (hist) console.log(`  as-of(${t}) → obs=${hist.obsDate} val=${hist.value}`);
  }

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
