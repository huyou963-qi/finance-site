/**
 * data:apply — 幂等「落库」编排：把 git 里的 catalog 代码在目标环境重建为数据库状态。
 *
 * 设计前提（见 docs/DATA_DEPLOY_SYNC.md）：开发库不是事实来源，而是缓存；
 * 事实来源是 git 的 seed catalog + FRED。任何环境跑本脚本即收敛到与代码一致的
 * DB 状态——指标/订阅/发布包/目录布局由幂等 upsert 重建，历史观测由已运行的
 * worker（nextRunAt 触发全量回填）自动灌满，无需拷贝任何数据。
 *
 * 用法：
 *   npm run data:apply                      # 全量：migrate + 所有 catalog seed + 包 + 布局 + 日历 + 各域自检
 *   npm run data:apply -- --dry-run         # 只打印执行计划
 *   npm run data:apply -- --only=monetary,cpi   # 仅这些域的 seed/verify（包/布局/日历仍全局幂等执行）
 *   npm run data:apply -- --backfill        # 额外触发 sync-all-stale，立即拉观测（否则等 worker 周期）
 *   npm run data:apply -- --skip-migrate --skip-verify   # 按需跳过
 *
 * 全部步骤幂等，可在每次部署后无脑重复执行。
 */
import { spawnSync } from "node:child_process";
import {
  SEED_CATALOG_REGISTRY,
  VERIFY_CATALOG_REGISTRY,
  listSeedCatalogNames,
  listVerifyCatalogNames,
} from "../../src/lib/data/scheduler/seedCatalogRegistry";

type Flags = {
  dryRun: boolean;
  skipMigrate: boolean;
  skipLayout: boolean;
  skipCalendar: boolean;
  skipVerify: boolean;
  backfill: boolean;
  continueOnError: boolean;
  only: string[] | null;
};

function parseFlags(): Flags {
  const argv = process.argv.slice(2);
  const onlyRaw = argv.find((a) => a.startsWith("--only="))?.split("=").slice(1).join("=");
  return {
    dryRun: argv.includes("--dry-run"),
    skipMigrate: argv.includes("--skip-migrate"),
    skipLayout: argv.includes("--skip-layout"),
    skipCalendar: argv.includes("--skip-calendar"),
    skipVerify: argv.includes("--skip-verify"),
    backfill: argv.includes("--backfill"),
    continueOnError: argv.includes("--continue-on-error"),
    only: onlyRaw ? onlyRaw.split(",").map((s) => s.trim()).filter(Boolean) : null,
  };
}

type Step = {
  label: string;
  /** npm script 名 */
  script: string;
  /** 传给 npm script 的参数（会经 `npm run <script> -- <args>`） */
  args: string[];
  /** true=失败即中止序列；false=记录失败但继续（自检类） */
  gating: boolean;
};

function buildPlan(flags: Flags): Step[] {
  const steps: Step[] = [];

  // 1) schema 迁移（prisma migrate deploy，前向非交互）
  if (!flags.skipMigrate) {
    steps.push({ label: "migrate", script: "db:migrate", args: [], gating: true });
  }

  // 2) 各 catalog 指标/订阅 seed —— release-packages 必须最后（要链接已存在指标）
  const seedNames = listSeedCatalogNames().filter((n) => n !== "release-packages");
  const seedSelected = flags.only ? seedNames.filter((n) => flags.only!.includes(n)) : seedNames;
  for (const name of seedSelected) {
    steps.push({
      label: `seed:${name}`,
      script: "data:seed",
      args: [`--catalog=${name}`],
      gating: true,
    });
  }

  // 3) 发布包（在全部指标 seed 之后）
  if (SEED_CATALOG_REGISTRY["release-packages"]) {
    steps.push({ label: "release-packages", script: "data:seed-release-packages", args: [], gating: true });
  }

  // 4) 目录分类布局（把新增 FRED 指标归位到持久化布局；无自定义布局时脚本自跳过）
  if (!flags.skipLayout) {
    steps.push({ label: "catalog-layout", script: "data:sync-catalog-layout", args: ["--prefix=fred:"], gating: true });
  }

  // 5) 经济日历对齐（日历型发布包 → nextRunAt）
  if (!flags.skipCalendar) {
    steps.push({ label: "sync-calendar", script: "data:sync-calendar", args: [], gating: false });
  }

  // 6) 可选：立即回填观测（否则由已运行的 worker 周期性拉取）
  if (flags.backfill) {
    steps.push({ label: "backfill", script: "data:sync-all-stale", args: [], gating: false });
  }

  // 7) 各域自检（门禁）——排除全局 verify-catalog（含 legacy MANUAL 噪音，会误报）
  if (!flags.skipVerify) {
    const verifyNames = listVerifyCatalogNames().filter((n) => n !== "catalog");
    const verifySelected = flags.only ? verifyNames.filter((n) => flags.only!.includes(n)) : verifyNames;
    for (const name of verifySelected) {
      steps.push({
        label: `verify:${name}`,
        script: "data:verify",
        args: [`--catalog=${name}`],
        gating: false, // 收集所有失败，末尾统一以非零退出
      });
    }
  }

  return steps;
}

function runStep(step: Step): { ok: boolean; ms: number } {
  const started = Date.now();
  const npmArgs = ["run", step.script, ...(step.args.length ? ["--", ...step.args] : [])];
  const result = spawnSync("npm", npmArgs, { stdio: "inherit", shell: true, env: process.env });
  return { ok: (result.status ?? 1) === 0, ms: Date.now() - started };
}

function main() {
  const flags = parseFlags();
  const plan = buildPlan(flags);

  console.log(`\n[data:apply] 执行计划（${plan.length} 步）${flags.only ? ` · only=${flags.only.join(",")}` : ""}`);
  for (const s of plan) {
    console.log(`  ${s.gating ? "•" : "◦"} ${s.label.padEnd(22)} npm run ${s.script}${s.args.length ? " -- " + s.args.join(" ") : ""}`);
  }
  console.log("  （• 门禁步骤失败即中止；◦ 记录失败但继续）\n");

  if (flags.dryRun) {
    console.log("[data:apply] --dry-run：未执行任何步骤");
    return;
  }

  const results: { label: string; ok: boolean; ms: number }[] = [];
  let aborted = false;

  for (const step of plan) {
    console.log(`\n===== ▶ ${step.label} =====`);
    const r = runStep(step);
    results.push({ label: step.label, ...r });
    if (!r.ok) {
      console.error(`[data:apply] ✗ ${step.label} 失败（${(r.ms / 1000).toFixed(1)}s）`);
      if (step.gating && !flags.continueOnError) {
        aborted = true;
        break;
      }
    } else {
      console.log(`[data:apply] ✓ ${step.label}（${(r.ms / 1000).toFixed(1)}s）`);
    }
  }

  console.log("\n========== 汇总 ==========");
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.label.padEnd(22)} ${(r.ms / 1000).toFixed(1)}s`);
  }
  const failed = results.filter((r) => !r.ok);
  if (aborted) {
    console.error(`\n[data:apply] 中止：门禁步骤失败。已完成 ${results.length}/${plan.length} 步。`);
    process.exit(1);
  }
  if (failed.length > 0) {
    console.error(`\n[data:apply] 完成但有 ${failed.length} 项自检失败：${failed.map((f) => f.label).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n[data:apply] 全部 ${results.length} 步通过。观测数据将由 worker 按 nextRunAt 自动回填${flags.backfill ? "（已触发 sync-all-stale 立即拉取）" : ""}。`);
}

main();
