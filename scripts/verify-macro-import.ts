/**
 * 通用宏观 Excel 导入验证
 *
 * npm run db:verify-macro-import -- --prefix=ism_us_
 * npm run db:verify-macro-import -- --prefix=ism_us_ --country=US --category=采购经理人指数 --expect-count=8
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { clearFredCatalogCache, getFredCatalogCached } from "../src/lib/data/fredCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const prefix = argValue("prefix");
  if (!prefix) {
    console.error(
      "用法: npm run db:verify-macro-import -- --prefix=ism_us_ [--country=US] [--category=分类名] [--expect-count=N] [--min-points=N] [--require-name-en]",
    );
    process.exit(1);
  }

  const country = argValue("country")?.toUpperCase();
  const category = argValue("category");
  const expectCountRaw = argValue("expect-count");
  const expectCount = expectCountRaw != null ? Number(expectCountRaw) : null;
  const minPointsRaw = argValue("min-points");
  const minPoints = minPointsRaw != null && Number.isFinite(Number(minPointsRaw))
    ? Number(minPointsRaw)
    : 1;
  const requireNameEn = argFlag("require-name-en");

  const instruments = await prisma.instrument.findMany({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      nameEn: true,
      freqLabel: true,
      unit: true,
      metadata: true,
      _count: { select: { macroPoints: true } },
      macroPoints: {
        orderBy: { obsDate: "desc" },
        take: 1,
        select: { obsDate: true, value: true },
      },
    },
  });

  console.info(`[instruments] prefix=${prefix} count=${instruments.length}`);
  if (instruments.length === 0) {
    console.error("[fail] 未找到任何序列");
    process.exit(1);
  }

  for (const row of instruments) {
    const md = row.metadata as Record<string, unknown> | null;
    const latest = row.macroPoints[0];
    console.info(
      [
        row.code,
        `zh=${row.name}`,
        `en=${row.nameEn ?? "—"}`,
        `freq=${row.freqLabel}`,
        `points=${row._count.macroPoints}`,
        latest
          ? `latest=${latest.obsDate.toISOString().slice(0, 10)}@${latest.value}`
          : "latest=—",
        `catalog=${String(md?.catalogCategory ?? "—")}`,
      ].join(" | "),
    );
  }

  if (expectCount != null && instruments.length !== expectCount) {
    console.error(`[fail] 期望 ${expectCount} 条，实际 ${instruments.length} 条`);
    process.exitCode = 1;
  }

  const missingCatalog = instruments.filter((r) => {
    const md = r.metadata as Record<string, unknown> | null;
    return !md?.catalogCategory || String(md.catalogCategory).trim() === "";
  });
  if (missingCatalog.length > 0) {
    console.error(
      `[fail] 缺少 catalogCategory: ${missingCatalog.map((r) => r.code).join(", ")}`,
    );
    process.exitCode = 1;
  }

  const lowPoints = instruments.filter((r) => r._count.macroPoints < minPoints);
  if (lowPoints.length > 0) {
    console.error(
      `[fail] 观测点不足 ${minPoints}: ${lowPoints.map((r) => r.code).join(", ")}`,
    );
    process.exitCode = 1;
  }

  if (requireNameEn) {
    const missingEn = instruments.filter((r) => !r.nameEn?.trim());
    if (missingEn.length > 0) {
      console.error(`[fail] 缺少英文名称: ${missingEn.map((r) => r.code).join(", ")}`);
      process.exitCode = 1;
    }
  }

  if (country && category) {
    clearFredCatalogCache();
    const catalog = await getFredCatalogCached();
    const c = catalog.countries.find((x) => x.code === country);
    if (!c) {
      console.error(`[fail] 宏观目录无国家 ${country}`);
      process.exitCode = 1;
    } else {
      const cat = c.categories.find((x) => x.name === category);
      const mdsItems = cat?.items.filter((i) => i.key.startsWith(`mds:${prefix}`)) ?? [];
      console.info(`\n[catalog] ${country} / ${category} mds items=${mdsItems.length}`);
      for (const item of mdsItems) {
        console.info(`  ${item.key} | ${item.label} | ${item.frequency}`);
      }
      if (mdsItems.length !== instruments.length) {
        console.error(
          `[fail] 目录树条目 ${mdsItems.length} 与库内序列 ${instruments.length} 不一致`,
        );
        process.exitCode = 1;
      }
    }
  }

  if (!process.exitCode) {
    console.info("\n[ok] 宏观 Excel 导入验证通过");
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
