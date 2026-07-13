/**
 * Seed S&P 500 constituents into mds.equity_security + index_constituent.
 *
 * 默认离线：从提交进 git 的快照 `src/lib/equity/data/sp500-snapshot.json` 播种，
 * 无任何外网依赖——这样在中国大陆服务器（阿里云，访问不到 Wikipedia）也能正常收敛。
 * 事实来源是 git 快照，与仓库其它 seed 一致（见 scripts/data-worker/apply-all.ts）。
 *
 * Usage:
 *   npm run equity:seed-sp500                # 离线：读快照播种
 *   npm run equity:seed-sp500 -- --refresh   # 联网：抓 Wikipedia，重写快照 + 播种（需可访问 en.wikipedia.org）
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { normalizeGicsSector } from "../../src/lib/equity/gicsCatalog";
import { rollupFromSubIndustry } from "../../src/lib/equity/gicsIndustryCatalog";
import { fetchWikipediaSp500 } from "../../src/lib/equity/wikipediaSp500";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
// 静态导入：由模块解析器相对本文件解析，与 process.cwd() 无关——
// 服务器上 apply-all 通过 spawn 调用本脚本时 cwd 不保证是项目根，故不能用 cwd 拼路径。
// 这与 gicsIndustryCatalog 导入 data/gics/*.json 是同一（已在生产验证的）模式。
import snapshotJson from "../../src/lib/equity/data/sp500-snapshot.json";

/** --refresh 重写快照用的落地路径（仅本地手动执行，cwd 即项目根） */
const SNAPSHOT_WRITE_PATH = join(process.cwd(), "src/lib/equity/data/sp500-snapshot.json");

/** 快照行：GICS 归属已解析，可直接 upsert，无需再 rollup */
type SnapshotRow = {
  symbol: string;
  name: string;
  gicsSector: string;
  gicsIndustryGroup: string | null;
  gicsIndustry: string | null;
  gicsSubIndustry: string | null;
  gicsIndustryCode: string | null;
};

type Snapshot = {
  source: string;
  generatedAt: string;
  count: number;
  rows: SnapshotRow[];
};

/** 从提交进 git 的快照读取（离线路径，cwd 无关） */
function loadSnapshot(): SnapshotRow[] {
  const parsed = snapshotJson as unknown as Snapshot;
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 400) {
    throw new Error(`快照行数异常: ${parsed.rows?.length ?? 0}（期望 ≥400）`);
  }
  return parsed.rows;
}

/** 从 Wikipedia 抓取并解析成 SnapshotRow（联网路径，供 --refresh 重建快照） */
async function fetchFromWikipedia(): Promise<SnapshotRow[]> {
  const wiki = await fetchWikipediaSp500();
  const out: SnapshotRow[] = [];
  for (const row of wiki) {
    const sector = normalizeGicsSector(row.sector);
    if (!sector) {
      console.warn(`跳过未知 sector: ${row.symbol} / ${row.sector}`);
      continue;
    }
    const rollup = rollupFromSubIndustry(row.subIndustry);
    if (rollup && rollup.sector !== sector) {
      console.warn(
        `Sector 不一致 ${row.symbol}: wiki=${sector} rollup=${rollup.sector} sub=${row.subIndustry}`,
      );
    }
    out.push({
      symbol: row.symbol,
      name: row.name,
      gicsSector: sector,
      gicsIndustryGroup: rollup?.industryGroup ?? null,
      gicsIndustry: rollup?.industry ?? null,
      gicsSubIndustry: rollup?.subIndustry ?? row.subIndustry ?? null,
      gicsIndustryCode: rollup?.industryCode ?? null,
    });
  }
  if (out.length < 400) throw new Error(`Wikipedia 解析行数过少: ${out.length}`);
  // 重写快照文件（symbol 升序，稳定 diff）
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const snapshot: Snapshot = {
    source: "wikipedia:List_of_S&P_500_companies",
    generatedAt: new Date().toISOString().slice(0, 10),
    count: out.length,
    rows: out,
  };
  writeFileSync(SNAPSHOT_WRITE_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`[refresh] 已重写快照 ${SNAPSHOT_WRITE_PATH}（${out.length} 行）`);
  return out;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  console.log(`[seed-sp500] START cwd=${process.cwd()} mode=${refresh ? "refresh" : "offline"}`);

  const rows = refresh ? await fetchFromWikipedia() : loadSnapshot();
  console.log(`[seed-sp500] 快照/抓取 ${rows.length} 行`);

  // DB 预检：把连接/schema 问题与文件问题区分开，失败时定位更快
  const before = await prisma.equitySecurity.count();
  console.log(`[seed-sp500] DB 预检 OK，upsert 前 equity_security=${before} 行`);

  const asOf = new Date();
  asOf.setUTCHours(0, 0, 0, 0);

  let upserted = 0;
  const bySector: Record<string, number> = {};

  for (const row of rows) {
    bySector[row.gicsSector] = (bySector[row.gicsSector] ?? 0) + 1;

    await prisma.equitySecurity.upsert({
      where: { symbol: row.symbol },
      create: {
        symbol: row.symbol,
        name: row.name,
        gicsSector: row.gicsSector,
        gicsIndustryGroup: row.gicsIndustryGroup,
        gicsIndustry: row.gicsIndustry,
        gicsSubIndustry: row.gicsSubIndustry,
        gicsIndustryCode: row.gicsIndustryCode,
      },
      update: {
        name: row.name,
        gicsSector: row.gicsSector,
        gicsIndustryGroup: row.gicsIndustryGroup,
        gicsIndustry: row.gicsIndustry,
        gicsSubIndustry: row.gicsSubIndustry,
        gicsIndustryCode: row.gicsIndustryCode,
      },
    });

    await prisma.indexConstituent.upsert({
      where: {
        indexCode_symbol_asOfDate: {
          indexCode: SP500_INDEX_CODE,
          symbol: row.symbol,
          asOfDate: asOf,
        },
      },
      create: { indexCode: SP500_INDEX_CODE, symbol: row.symbol, asOfDate: asOf },
      update: {},
    });

    upserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: refresh ? "wikipedia-refresh" : "snapshot-offline",
        upserted,
        asOf: asOf.toISOString().slice(0, 10),
        bySector,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    // 醒目横幅：equity 是 data:apply 第 1 步，报错在长日志顶部，加边框便于定位
    console.error("\n========== SEED-SP500 FAILED ==========");
    console.error(e instanceof Error ? (e.stack ?? e.message) : e);
    console.error("=======================================\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
