/**
 * 统一 seed 入口（转发到既有 seed-*.ts，不改变各脚本行为）
 *
 * npm run data:seed -- --catalog=cpi
 * npm run data:seed -- --list
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  SEED_CATALOG_REGISTRY,
  listSeedCatalogNames,
} from "../../src/lib/data/scheduler/seedCatalogRegistry";

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

function forwardArgs(): string[] {
  return process.argv.slice(2).filter((a) => !a.startsWith("--catalog=") && a !== "--list");
}

function main() {
  if (process.argv.includes("--list")) {
    console.log("可用 catalog：");
    for (const name of listSeedCatalogNames()) {
      const entry = SEED_CATALOG_REGISTRY[name]!;
      console.log(`  ${name.padEnd(18)} ${entry.labelZh} (${entry.script}.ts)`);
    }
    return;
  }

  const catalog = argValue("catalog")?.trim();
  if (!catalog || !SEED_CATALOG_REGISTRY[catalog]) {
    console.error("用法: npm run data:seed -- --catalog=<name>");
    console.error("      npm run data:seed -- --list");
    console.error(`可用: ${listSeedCatalogNames().join(", ")}`);
    process.exit(1);
  }

  const entry = SEED_CATALOG_REGISTRY[catalog]!;
  const scriptPath = path.join(process.cwd(), "scripts", "data-worker", `${entry.script}.ts`);
  const extra = forwardArgs();
  console.info(`[data:seed] catalog=${catalog} → ${entry.script}.ts`);

  const result = spawnSync("npx", ["tsx", scriptPath, ...extra], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  if ((result.status ?? 1) === 0) {
    // seed 脚本只建 Instrument + DataSubscription，**不写**
    // metadata.fetchAcquisition；而调度器要求它等于 "known" 才会选中订阅。
    // 漏跑探测的话新种的序列会被静默跳过（2026-07~09 就这样漏了 410 条）。
    console.info(
      `[data:seed] 完成。新种的订阅还不会被调度器选中，请接着跑：
` +
        `  npm run data:probe-sources -- --skip-known
` +
        `  npm run data:verify-catalog -- --db   # 确认「ready 但不会被调度」为 0`,
    );
  }

  process.exit(result.status ?? 1);
}

main();
