/**
 * 只读验证：补 fredSeriesId 后，fredDbFirst 对 overview/fiscal 序列的读库覆盖。
 * 调 loadFredObservationMapsDbFirst，统计 db / live 来源数。db 越多越好。
 *
 * 运行：dotenv -e .env.local -- tsx scripts/data-worker/audit-fred-dbfirst-coverage.ts
 * 注意：为纯测库覆盖，本脚本清空 FRED_API_KEY，缺库序列会抛错并被单独列出。
 */
import { loadEnvConfig } from "@next/env";
import { OVERVIEW_FRED_SERIES } from "../../src/lib/data/scheduler/overviewFredSeedCatalog";
import { FISCAL_FRED_SERIES } from "../../src/lib/data/scheduler/fiscalFredSeedCatalog";

loadEnvConfig(process.cwd());
delete process.env.FRED_API_KEY; // 强制只走库，缺库即抛错

async function main() {
  const { loadFredObservationMapsDbFirst } = await import(
    "../../src/lib/data/fredDbFirst"
  );

  const ids = [
    ...new Set([
      ...OVERVIEW_FRED_SERIES.map((r) => r.fredId.toUpperCase()),
      ...FISCAL_FRED_SERIES.map((r) => r.fredId.toUpperCase()),
    ]),
  ];

  const dbHit: string[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    try {
      const { sources } = await loadFredObservationMapsDbFirst([id]);
      if (sources.get(id) === "db") dbHit.push(id);
      else missing.push(id);
    } catch {
      missing.push(id); // 无 key + 不在库 → 抛错
    }
  }

  console.log(`\n=== fredDbFirst 覆盖（overview+fiscal，${ids.length} 序列，无 FRED key）===`);
  console.log(`读库命中 db=${dbHit.length}：${dbHit.sort().join(", ")}`);
  console.log(`\n未命中(缺库) ${missing.length}：${missing.sort().join(", ") || "（无）"}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
