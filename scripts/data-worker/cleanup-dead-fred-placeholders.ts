/**
 * 清理两条无效 FRED 占位指标（series ID 在 FRED 侧已不存在，探测返回
 * "The series does not exist."，非网络/限频问题）：
 *
 *   - sched_fred_CUSR0000SEGF01「CPI 家庭食品」：重复于已有的 sched_fred_CUSR0000SAF11
 *     （正确 ID，893 条观测，归 us.bls.cpi 包），纯占位，直接删。
 *   - sched_fred_A101RX1Q020SBEA「实际住宅固定投资」：正确 ID 是 PRFIC1，
 *     已通过 sched_fred_PRFIC1 重新入库（见 overviewFredSeedCatalog.ts）。
 *
 * 两条均 obs=0，仅有失败的 FetchRun 记录，删除前会二次确认无观测数据再动手。
 * 同时清掉 MacroCatalogLayout 里残留的 mds:sched_fred_<ID> 键，否则管理页仍显示。
 *
 * npm run data:cleanup-dead-fred-placeholders -- --dry-run
 * npm run data:cleanup-dead-fred-placeholders
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DEAD_CODES = ["sched_fred_CUSR0000SEGF01", "sched_fred_A101RX1Q020SBEA"];
const DEAD_LAYOUT_KEYS = [
  "mds:sched_fred_CUSR0000SEGF01",
  "mds:sched_fred_A101RX1Q020SBEA",
  "fred:CUSR0000SEGF01",
  "fred:A101RX1Q020SBEA",
];

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function stripKeys(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node
      .filter((v) => !(typeof v === "string" && DEAD_LAYOUT_KEYS.includes(v)))
      .map(stripKeys);
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (DEAD_LAYOUT_KEYS.includes(k)) continue;
      out[k] = stripKeys(v);
    }
    return out;
  }
  return node;
}

async function main() {
  const dryRun = argFlag("dry-run");
  console.log(`[cleanup-dead-fred] ${dryRun ? "DRY RUN（不写库）" : "写库"}\n`);

  for (const code of DEAD_CODES) {
    const inst = await prisma.instrument.findUnique({
      where: { code },
      include: { _count: { select: { macroPoints: true, bars: true } } },
    });
    if (!inst) {
      console.log(`[skip] ${code} 不存在（已清理过或未曾入库）`);
      continue;
    }
    if (inst._count.macroPoints > 0 || inst._count.bars > 0) {
      console.error(
        `[abort] ${code} 已有观测数据 (macro=${inst._count.macroPoints} bars=${inst._count.bars})，` +
          `拒绝删除——说明该 ID 其实是有效的，请先核实再手动处理`,
      );
      process.exitCode = 1;
      return;
    }
    const runs = await prisma.fetchRun.count({ where: { subscription: { instrumentId: inst.id } } });
    console.log(`${dryRun ? "·" : "✓"} 删除 ${code}（obs=0, fetchRuns=${runs}）`);
    if (!dryRun) {
      await prisma.fetchRun.deleteMany({ where: { subscription: { instrumentId: inst.id } } });
      await prisma.dataSubscription.deleteMany({ where: { instrumentId: inst.id } });
      await prisma.releasePackageMember.deleteMany({ where: { instrumentId: inst.id } });
      await prisma.instrument.delete({ where: { id: inst.id } });
    }
  }

  const layout = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  if (layout) {
    const before = JSON.stringify(layout.layout);
    const after = JSON.stringify(stripKeys(layout.layout));
    const hits = DEAD_LAYOUT_KEYS.filter((k) => before.includes(k));
    console.log(
      `\n[layout] 命中残留键: ${hits.join(", ") || "无"}（长度 ${before.length} → ${after.length}）`,
    );
    if (!dryRun && before !== after) {
      await prisma.macroCatalogLayout.update({
        where: { id: "default" },
        data: { layout: JSON.parse(after), updatedBy: "cleanup-dead-fred-placeholders" },
      });
    }
  } else {
    console.log("\n[layout] 无自定义 MacroCatalogLayout，跳过");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
