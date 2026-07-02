/**
 * 统一 verify 入口（转发到既有 verify-*.ts）
 *
 * npm run data:verify -- --catalog=cpi -- --db
 * npm run data:verify -- --list
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  VERIFY_CATALOG_REGISTRY,
  listVerifyCatalogNames,
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
    for (const name of listVerifyCatalogNames()) {
      const entry = VERIFY_CATALOG_REGISTRY[name]!;
      console.log(`  ${name.padEnd(12)} ${entry.labelZh} (${entry.script}.ts)`);
    }
    return;
  }

  const catalog = argValue("catalog")?.trim();
  if (!catalog || !VERIFY_CATALOG_REGISTRY[catalog]) {
    console.error("用法: npm run data:verify -- --catalog=<name> [-- ...原脚本参数]");
    console.error("      npm run data:verify -- --list");
    console.error(`可用: ${listVerifyCatalogNames().join(", ")}`);
    process.exit(1);
  }

  const entry = VERIFY_CATALOG_REGISTRY[catalog]!;
  const scriptPath = path.join(process.cwd(), "scripts", "data-worker", `${entry.script}.ts`);
  const extra = forwardArgs();
  if (entry.verifyNeedsDb && !extra.includes("--db")) {
    extra.push("--db");
  }
  console.info(`[data:verify] catalog=${catalog} → ${entry.script}.ts`);

  const result = spawnSync("npx", ["tsx", scriptPath, ...extra], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  process.exit(result.status ?? 1);
}

main();
