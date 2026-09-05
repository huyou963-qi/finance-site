/**
 * 下线商务部「外贸：商品构成」维度（894 条序列 / 约 5.7 万条观测）。
 *
 * 背景：该接口只有金额没有数量，算不出进出口单价，且按 HS 章/类铺开的分项过细。
 * 分商品维度已迁到海关总署主要商品量值表（gacc-commodity），量、额、单价三口径齐备。
 * 商务部源保留「进出口总额 / 贸易方式 / 国别地区」三个维度，不受影响。
 *
 * npm run data:drop-mofcom-composition -- --dry-run   （默认，只列出将删除的内容）
 * npm run data:drop-mofcom-composition -- --apply     （真正删除）
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 商务部商品构成序列的判定：来自 mofcom-trade 源，且展示名以「外贸：商品构成」开头 */
const CODE_PREFIX = "mofcom_cn_trade_";
const LABEL_PREFIX = "外贸：商品构成";

async function main() {
  const apply = process.argv.includes("--apply");
  const all = await prisma.instrument.findMany({
    where: { code: { startsWith: CODE_PREFIX } },
    select: { id: true, code: true, shortName: true, name: true },
  });
  const targets = all.filter((item) =>
    (item.shortName ?? item.name ?? "").startsWith(LABEL_PREFIX),
  );
  const keep = all.length - targets.length;
  if (targets.length === 0) {
    console.log("[drop-mofcom-composition] 没有需要删除的商品构成序列（已清理过）");
    return;
  }

  const ids = targets.map((t) => t.id);
  const observations = await prisma.macroObservation.count({ where: { instrumentId: { in: ids } } });
  console.log(
    `[drop-mofcom-composition] 命中 ${targets.length} 条商品构成序列（观测 ${observations} 条），` +
      `保留同源其他维度 ${keep} 条`,
  );
  for (const t of targets.slice(0, 5)) console.log(`  例：${t.code}  ${t.shortName}`);
  console.log(`  …共 ${targets.length} 条`);

  if (!apply) {
    console.log("[drop-mofcom-composition] --dry-run（默认）：未删除。确认无误后加 --apply");
    return;
  }

  // 逐层删除：观测 → 订阅 → 仪器（外键顺序），分批避免超大 IN 语句
  const chunk = 200;
  let deletedObs = 0;
  let deletedSubs = 0;
  let deletedInstruments = 0;
  for (let i = 0; i < ids.length; i += chunk) {
    const batch = ids.slice(i, i + chunk);
    deletedObs += (await prisma.macroObservation.deleteMany({ where: { instrumentId: { in: batch } } })).count;
    deletedSubs += (await prisma.dataSubscription.deleteMany({ where: { instrumentId: { in: batch } } })).count;
    deletedInstruments += (await prisma.instrument.deleteMany({ where: { id: { in: batch } } })).count;
  }
  console.log(
    `[drop-mofcom-composition] 已删除：观测=${deletedObs}，订阅=${deletedSubs}，仪器=${deletedInstruments}`,
  );
  console.log("  下一步：npm run data:verify-mofcom-trade -- --db");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
