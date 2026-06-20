import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  PHASE2_DEBTCAP_BIS_CODES,
  bisSourceSeriesKeyForDebtcapCode,
} from "../../src/lib/data/scheduler/phase2SeedCatalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const codes = [...PHASE2_DEBTCAP_BIS_CODES];
  const inst = await prisma.instrument.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const instSet = new Set(inst.map((i) => i.code));
  const subs = await prisma.dataSubscription.findMany({
    where: { instrument: { code: { in: codes } } },
    include: { instrument: { select: { code: true } } },
  });
  const subSet = new Set(subs.map((s) => s.instrument.code));

  console.log(`instruments ${inst.length}/${codes.length}, subscriptions ${subSet.size}/${codes.length}`);
  for (const c of codes) {
    const sk = bisSourceSeriesKeyForDebtcapCode(c);
    const flags = [
      instSet.has(c) ? "inst" : "NO-INST",
      subSet.has(c) ? "sub" : "NO-SUB",
      sk ?? "NO-BIS",
    ];
    if (!instSet.has(c) || !subSet.has(c)) {
      console.log(flags.join(" "), c, sk ?? "");
    }
  }
}

main()
  .finally(() => prisma.$disconnect());
