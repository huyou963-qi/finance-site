/**
 * Seed 全美股宇宙（NYSE / Nasdaq / CBOE 交易所上市，约 7.7k 只）进 mds.equity_security。
 *
 * 目的：让「已实现的个股功能（K线 / 基本面 / 事件）覆盖全美股」——只需 symbol + cik 即可懒回补，
 * GICS 分类留 null（未分类，不进行业浏览树）。标普 500 的 503 行由 seed-sp500 单独写好 GICS，
 * 本脚本用 createMany skipDuplicates **只插入新行、绝不覆盖** 那 503 行。
 *
 * 默认离线：从提交进 git 的快照 `src/lib/equity/data/us-equity-universe.json` 播种，无外网依赖
 * （与 seed-sp500 同构，见 scripts/data-worker/apply-all.ts 的「git 是事实来源」原则）。
 *
 * Usage:
 *   npm run equity:seed-us-universe                # 离线：读快照播种
 *   npm run equity:seed-us-universe -- --refresh   # 联网：抓 SEC exchange 文件，重写快照 + 播种
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
// 静态导入：相对本文件解析，与 process.cwd() 无关（apply-all 通过 spawn 调用，cwd 不保证是项目根）。
// 与 seed-sp500 导入 sp500-snapshot.json 是同一已在生产验证的模式（见 china-server-blocked-sources 教训②）。
import snapshotJson from "../../src/lib/equity/data/us-equity-universe.json";

const SNAPSHOT_WRITE_PATH = join(process.cwd(), "src/lib/equity/data/us-equity-universe.json");
const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-universe admin@hblook.com";
/** 只收交易所上市普通股，排除 OTC / 无交易所 */
const KEEP_EXCHANGES = new Set(["NYSE", "Nasdaq", "CBOE"]);

type UniverseRow = { symbol: string; name: string; cik: string; exchange: string };
type Snapshot = { source: string; generatedAt: string; count: number; rows: UniverseRow[] };

function padCik(raw: string | number): string {
  return String(raw).replace(/\D/g, "").padStart(10, "0");
}

/** 从提交进 git 的快照读取（离线路径，cwd 无关） */
function loadSnapshot(): UniverseRow[] {
  const parsed = snapshotJson as unknown as Snapshot;
  if (!Array.isArray(parsed.rows) || parsed.rows.length < 3000) {
    throw new Error(`全宇宙快照行数异常: ${parsed.rows?.length ?? 0}（期望 ≥3000）`);
  }
  return parsed.rows;
}

/** 从 SEC 抓取并重写快照（联网路径，供 --refresh 重建） */
async function fetchFromSec(): Promise<UniverseRow[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SEC company_tickers_exchange HTTP ${res.status}`);
  const json = (await res.json()) as { fields?: string[]; data?: unknown[][] };
  const f = json.fields ?? [];
  const iC = f.indexOf("cik");
  const iN = f.indexOf("name");
  const iT = f.indexOf("ticker");
  const iE = f.indexOf("exchange");

  const seen = new Set<string>();
  const rows: UniverseRow[] = [];
  for (const r of json.data ?? []) {
    const symbol = String(r[iT] ?? "").trim().toUpperCase();
    const exchange = String(r[iE] ?? "").trim();
    if (!symbol || !KEEP_EXCHANGES.has(exchange) || seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({ symbol, name: String(r[iN] ?? "").trim(), cik: padCik(r[iC] as string), exchange });
  }
  if (rows.length < 3000) throw new Error(`SEC 解析行数过少: ${rows.length}`);
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const snapshot: Snapshot = {
    source: "sec:company_tickers_exchange.json (NYSE/Nasdaq/CBOE)",
    generatedAt: new Date().toISOString().slice(0, 10),
    count: rows.length,
    rows,
  };
  writeFileSync(SNAPSHOT_WRITE_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`[refresh] 已重写快照 ${SNAPSHOT_WRITE_PATH}（${rows.length} 行）`);
  return rows;
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  console.log(`[seed-us-universe] START cwd=${process.cwd()} mode=${refresh ? "refresh" : "offline"}`);

  const rows = refresh ? await fetchFromSec() : loadSnapshot();
  console.log(`[seed-us-universe] 快照/抓取 ${rows.length} 行`);

  const before = await prisma.equitySecurity.count();
  console.log(`[seed-us-universe] DB 预检 OK，插入前 equity_security=${before} 行`);

  // createMany + skipDuplicates：只插入新 symbol，绝不触碰 sp500 seed 已写 GICS 的 503 行。
  // gicsSector 省略即 null（未分类）；cik 直接落库，让事件/基本面懒回补无需再抓 ticker-map。
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r) => ({
      symbol: r.symbol,
      name: r.name || r.symbol,
      cik: r.cik,
    }));
    const res = await prisma.equitySecurity.createMany({ data: batch, skipDuplicates: true });
    inserted += res.count;
  }

  const after = await prisma.equitySecurity.count();
  const classified = await prisma.equitySecurity.count({ where: { gicsSector: { not: null } } });
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: refresh ? "sec-refresh" : "snapshot-offline",
        universeRows: rows.length,
        insertedNew: inserted,
        equitySecurityTotal: after,
        classifiedWithGics: classified,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error("\n========== SEED-US-UNIVERSE FAILED ==========");
    console.error(e instanceof Error ? (e.stack ?? e.message) : e);
    console.error("=============================================\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
