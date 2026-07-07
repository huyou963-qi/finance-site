/**
 * 只读预检：模拟 seed-overview / seed-fiscal 补 fredSeriesId=row.fredId 时是否触发
 * Instrument.fredSeriesId @unique 冲突。
 *
 * 对每个 (code, fredId) 目标：
 *  - 该 code 当前 fredSeriesId
 *  - 是否存在「另一个 code」已占用同一 fredSeriesId（= 真正的阻塞冲突）
 *  - 同一 fredId 是否被本次 seed 的多个 code 目标同时认领（catalog 内部冲突，如 FGCEC1 raw+yoy）
 *
 * 运行：dotenv -e .env.local -- tsx scripts/data-worker/audit-fred-preflight.ts
 * 只读。
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { OVERVIEW_FRED_SERIES } from "../../src/lib/data/scheduler/overviewFredSeedCatalog";
import {
  FISCAL_FRED_ALREADY_IN_OVERVIEW,
  FISCAL_FRED_SERIES,
  FISCAL_FRED_YOY_SERIES,
} from "../../src/lib/data/scheduler/fiscalFredSeedCatalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

type Target = { catalog: string; code: string; fredId: string };

function collectTargets(): Target[] {
  const t: Target[] = [];
  for (const r of OVERVIEW_FRED_SERIES) {
    t.push({ catalog: "overview", code: r.code, fredId: r.fredId.toUpperCase() });
  }
  for (const r of FISCAL_FRED_SERIES) {
    if (FISCAL_FRED_ALREADY_IN_OVERVIEW.has(r.fredId)) continue; // fiscal 跳过，overview 已建
    t.push({ catalog: "fiscal", code: r.code, fredId: r.fredId.toUpperCase() });
  }
  for (const r of FISCAL_FRED_YOY_SERIES) {
    t.push({ catalog: "fiscal-yoy", code: r.code, fredId: r.fredId.toUpperCase() });
  }
  return t;
}

async function main() {
  const targets = collectTargets();

  // fredId → 计划认领它的目标（catalog 内部冲突检测）
  const claimants = new Map<string, Target[]>();
  for (const t of targets) {
    const a = claimants.get(t.fredId) ?? [];
    a.push(t);
    claimants.set(t.fredId, a);
  }

  const allFredIds = [...claimants.keys()];
  // 当前 DB 中已持有这些 fredSeriesId 的仪器
  const holders = await prisma.instrument.findMany({
    where: { fredSeriesId: { in: allFredIds } },
    select: { code: true, fredSeriesId: true, _count: { select: { macroPoints: true } } },
  });
  const holderByFred = new Map<string, { code: string; obs: number }[]>();
  for (const h of holders) {
    const k = h.fredSeriesId!.toUpperCase();
    const a = holderByFred.get(k) ?? [];
    a.push({ code: h.code, obs: h._count.macroPoints });
    holderByFred.set(k, a);
  }

  // 目标 code 的当前 fredSeriesId
  const targetCodes = targets.map((t) => t.code);
  const targetInsts = await prisma.instrument.findMany({
    where: { code: { in: targetCodes } },
    select: { code: true, fredSeriesId: true, _count: { select: { macroPoints: true } } },
  });
  const curByCode = new Map(targetInsts.map((i) => [i.code, { fred: i.fredSeriesId, obs: i._count.macroPoints }]));

  let internalConflicts = 0;
  let externalConflicts = 0;
  let alreadySet = 0;
  let willSet = 0;
  let missingInDb = 0;

  console.log(`\n=== 预检 ${targets.length} 个 (code, fredId) 目标 ===\n`);

  // 1) catalog 内部：一个 fredId 被多个 code 认领
  console.log("--- [A] 同一 fredId 被本次 seed 多个 code 认领（内部冲突）---");
  for (const [fid, cs] of claimants) {
    if (cs.length > 1) {
      internalConflicts++;
      console.log(`  ⚠ ${fid}: ${cs.map((c) => `${c.code}[${c.catalog}]`).join("  vs  ")}`);
    }
  }
  if (internalConflicts === 0) console.log("  （无）");

  // 2) 逐目标：设置 fredSeriesId 是否与「别的 code」冲突
  console.log("\n--- [B] 逐目标设置 fredSeriesId 的结果 ---");
  for (const t of targets) {
    const cur = curByCode.get(t.code);
    if (!cur) {
      missingInDb++;
      console.log(`  · ${t.code} (${t.fredId}): DB 中尚无此仪器（seed 将 create）`);
      // 仍需检查外部占用
    }
    const others = (holderByFred.get(t.fredId) ?? []).filter((h) => h.code !== t.code);
    if (others.length > 0) {
      externalConflicts++;
      console.log(
        `  ✗ ${t.code} → fredSeriesId=${t.fredId} 冲突：已被 ${others
          .map((o) => `${o.code}(obs=${o.obs})`)
          .join(", ")} 占用`,
      );
    } else if (cur?.fred && cur.fred.toUpperCase() === t.fredId) {
      alreadySet++;
    } else {
      willSet++;
    }
  }

  console.log(
    `\n[汇总] 将新设=${willSet} 已设=${alreadySet} 外部冲突=${externalConflicts} 内部冲突fredId=${internalConflicts} DB缺失(将create)=${missingInDb}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
