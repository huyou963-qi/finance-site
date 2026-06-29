/**
 * 发布包 Phase B 种子：写入 mds.release_package / member，并链接 DataSubscription
 *
 * npm run data:seed-release-packages
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { stripCalendarStateFromSubscriptionRule } from "../../src/lib/data/scheduler/applyCalendarSchedules";
import {
  RELEASE_PACKAGE_CATALOG,
  instrumentMatchesPackageMember,
} from "../../src/lib/data/scheduler/releasePackageCatalog";
import { parseReleaseRule } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  const instruments = await prisma.instrument.findMany({
    select: { id: true, code: true, fredSeriesId: true },
  });

  const claimedInstrument = new Set<string>();
  let memberLinks = 0;
  let subsLinked = 0;

  console.log("[data:seed-release-packages] 写入发布包…");
  for (const def of RELEASE_PACKAGE_CATALOG) {
    await prisma.releasePackage.upsert({
      where: { id: def.id },
      create: {
        id: def.id,
        labelZh: def.labelZh,
        labelEn: def.labelEn ?? null,
        countryCode: def.countryCode,
        agencyId: def.agencyId ?? null,
        granularity: def.granularity,
        calendarSpec: def.calendar as object,
        releaseTemplate: def.release as object,
        sortOrder: def.sortOrder ?? 0,
        enabled: true,
      },
      update: {
        labelZh: def.labelZh,
        labelEn: def.labelEn ?? null,
        countryCode: def.countryCode,
        agencyId: def.agencyId ?? null,
        granularity: def.granularity,
        calendarSpec: def.calendar as object,
        releaseTemplate: def.release as object,
        sortOrder: def.sortOrder ?? 0,
        enabled: true,
      },
    });

    const matched = instruments.filter(
      (inst) =>
        !claimedInstrument.has(inst.id) &&
        instrumentMatchesPackageMember(inst, def.members),
    );

    for (const inst of matched) {
      await prisma.releasePackageMember.upsert({
        where: { instrumentId: inst.id },
        create: {
          packageId: def.id,
          instrumentId: inst.id,
        },
        update: {
          packageId: def.id,
        },
      });
      claimedInstrument.add(inst.id);
      memberLinks += 1;

      const sub = await prisma.dataSubscription.findUnique({
        where: { instrumentId: inst.id },
      });
      if (!sub) continue;

      const stripped = stripCalendarStateFromSubscriptionRule(
        parseReleaseRule(sub.releaseRule),
      );
      await prisma.dataSubscription.update({
        where: { id: sub.id },
        data: {
          releasePackageId: def.id,
          releaseRule: stripped as object,
        },
      });
      subsLinked += 1;
    }

    console.log(`  ✓ ${def.id} (${def.labelZh}) members=${matched.length}`);
  }

  console.log(
    `[data:seed-release-packages] 完成：${RELEASE_PACKAGE_CATALOG.length} 包，${memberLinks} 成员，${subsLinked} 订阅已链接`,
  );
  console.log("  下一步：npm run data:sync-calendar");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
