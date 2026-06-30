/**
 * 将 10Y / SPX / XAU 日 K Excel 导入 mds.instrument + mds.bar（区间回报工具数据源）
 *
 * npm run db:import-asset-return-xlsx
 * npm run db:import-asset-return-xlsx -- --asset=SPX
 * npm run db:import-asset-return-xlsx -- --dry-run
 *
 * xlsx 查找顺序：ASSET_DATA_DIR → 项目根 → data/ → assets/
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  ALL_ASSET_CODES,
  ASSET_RETURN_DEFS,
  ASSET_RETURN_TIMEFRAME,
  type AssetCode,
} from "../src/lib/data/assetReturnCatalog";
import { assetBarToDbRow } from "../src/lib/data/assetReturnTool";
import { parseAssetBarsFromXlsxFile, resolveAssetXlsxPath } from "../src/lib/data/assetReturnXlsx";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function importOneAsset(asset: AssetCode, dryRun: boolean) {
  const def = ASSET_RETURN_DEFS[asset];
  const filePath = resolveAssetXlsxPath(def.xlsxFile);
  const bars = parseAssetBarsFromXlsxFile(asset, filePath);

  console.info(`[${asset}] ${bars.length} bars from ${filePath}`);

  if (dryRun) {
    console.info(
      `  range ${bars[0]?.date ?? "?"} .. ${bars[bars.length - 1]?.date ?? "?"}`,
    );
    return;
  }

  const instrument = await prisma.instrument.upsert({
    where: { code: def.instrumentCode },
    create: {
      code: def.instrumentCode,
      kind: def.kind,
      name: def.name,
      freqLabel: "日",
      metadata: {
        assetReturnTool: true,
        assetCode: asset,
        source: "xlsx-import",
      },
    },
    update: {
      kind: def.kind,
      name: def.name,
      freqLabel: "日",
      metadata: {
        assetReturnTool: true,
        assetCode: asset,
        source: "xlsx-import",
      },
    },
  });

  await prisma.bar.deleteMany({
    where: {
      instrumentId: instrument.id,
      timeframe: ASSET_RETURN_TIMEFRAME,
    },
  });

  const batchSize = 500;
  for (let i = 0; i < bars.length; i += batchSize) {
    const chunk = bars.slice(i, i + batchSize);
    await prisma.bar.createMany({
      data: chunk.map((bar) => ({
        instrumentId: instrument.id,
        timeframe: ASSET_RETURN_TIMEFRAME,
        ...assetBarToDbRow(bar),
      })),
    });
  }

  console.info(`  upserted instrument ${def.instrumentCode}, wrote ${bars.length} bars`);
}

async function main() {
  const dryRun = argFlag("dry-run");
  const assetArg = argValue("asset")?.trim().toUpperCase();
  const assets: AssetCode[] =
    assetArg && ALL_ASSET_CODES.includes(assetArg as AssetCode)
      ? [assetArg as AssetCode]
      : ALL_ASSET_CODES;

  if (assetArg && !ALL_ASSET_CODES.includes(assetArg as AssetCode)) {
    console.error(`未知 asset：${assetArg}（可用：${ALL_ASSET_CODES.join("、")}）`);
    process.exit(1);
  }

  for (const asset of assets) {
    await importOneAsset(asset, dryRun);
  }

  if (dryRun) {
    console.info("[dry-run] 未写入数据库");
  } else {
    console.info("导入完成");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
