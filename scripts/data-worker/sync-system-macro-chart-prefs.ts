/**
 * 系统内置模板配置（SystemMacroChartPrefs，全局单例 id=default）与 git 快照互相同步
 *
 * npm run data:export-system-macro-chart-prefs   # DB → data/system-macro-chart-prefs.json（+ .meta.json）
 *                                                 # [-- --out-dir=/tmp/x] 写到别处（定时同步任务用）
 * npm run data:import-system-macro-chart-prefs   # 快照 → DB（整行覆盖）[-- --dry-run] [-- --force]
 *
 * 唯一真源是 HK 生产库：系统模板只能由 admin 在线上界面编辑。快照只是镜像——
 * GitHub Action `sync-system-templates` 每天从 HK 导出并自动提交到仓库。
 * 不接入 data:apply：部署时自动 import 会覆盖生产端的管理员改动。
 *
 * 导入保护（2026-09-22）：导出时在 .meta.json 记下当时库行的 updated_at；导入时库行若在那之后
 * 又被改过（管理员在线上改了模板而快照是旧的），拒绝导入，除非显式 --force。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const REQUIRED_KEYS = [
  "builtinTemplateOverrides",
  "customBuiltinTemplates",
  "builtinTemplateFolders",
  "builtinTemplateFolderIds",
  "hiddenBuiltinTemplateIds",
];

type SnapshotMeta = { exportedAt: string; dbUpdatedAt: string; sha256: string };

function outDir(): string {
  const arg = process.argv.find((a) => a.startsWith("--out-dir="))?.slice("--out-dir=".length);
  return arg ? path.resolve(arg) : path.join(process.cwd(), "data");
}

function snapshotPaths(dir: string) {
  return {
    snapshot: path.join(dir, "system-macro-chart-prefs.json"),
    meta: path.join(dir, "system-macro-chart-prefs.meta.json"),
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function summarize(prefs: Record<string, unknown>) {
  const count = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);
  return REQUIRED_KEYS.map((k) => `${k}=${count(prefs[k])}`).join(" ");
}

async function exportSnapshot() {
  const row = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (!row) throw new Error("SystemMacroChartPrefs 无 default 行，无可导出");
  const { snapshot, meta } = snapshotPaths(outDir());
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  const body = `${JSON.stringify(row.prefs, null, 2)}\n`;
  fs.writeFileSync(snapshot, body);
  const m: SnapshotMeta = {
    exportedAt: new Date().toISOString(),
    dbUpdatedAt: row.updatedAt.toISOString(),
    sha256: sha256(body),
  };
  fs.writeFileSync(meta, `${JSON.stringify(m, null, 2)}\n`);
  console.log(`[system-macro-chart-prefs] 已导出（库 updated_at ${m.dbUpdatedAt}）→ ${snapshot}`);
  console.log(`  ${summarize(row.prefs as Record<string, unknown>)}`);
}

async function importSnapshot(dryRun: boolean, force: boolean) {
  const { snapshot, meta } = snapshotPaths(path.join(process.cwd(), "data"));
  const body = fs.readFileSync(snapshot, "utf8");
  const prefs = JSON.parse(body) as Record<string, unknown>;
  const missing = REQUIRED_KEYS.filter((k) => !(k in prefs));
  if (prefs.version !== 1 || missing.length) {
    throw new Error(`快照格式不符（version=${String(prefs.version)}，缺 ${missing.join(",") || "无"}）`);
  }

  // 防止旧快照覆盖线上管理员的改动
  const row = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (row && !force) {
    if (!fs.existsSync(meta)) {
      throw new Error("缺少 system-macro-chart-prefs.meta.json，无法判断快照是否比库旧；确认要覆盖请加 --force");
    }
    const m = JSON.parse(fs.readFileSync(meta, "utf8")) as SnapshotMeta;
    if (row.updatedAt.getTime() > new Date(m.dbUpdatedAt).getTime()) {
      throw new Error(
        `库里的系统模板在快照导出之后又被改过（库 ${row.updatedAt.toISOString()} > 快照基于 ${m.dbUpdatedAt}），` +
          "拒绝用旧快照覆盖。先从 HK 导出最新快照；确认要覆盖请加 --force",
      );
    }
  }

  console.log(`[system-macro-chart-prefs] 快照 ${summarize(prefs)}${dryRun ? "（dry-run）" : ""}`);
  if (dryRun) return;
  const json = prefs as Prisma.InputJsonValue;
  await prisma.systemMacroChartPrefs.upsert({
    where: { id: "default" },
    create: { id: "default", prefs: json },
    update: { prefs: json },
  });
  console.log("  ✓ 已写入 SystemMacroChartPrefs(default)");
}

async function main() {
  if (process.argv.includes("--export")) await exportSnapshot();
  else if (process.argv.includes("--import")) {
    await importSnapshot(process.argv.includes("--dry-run"), process.argv.includes("--force"));
  } else throw new Error("需指定 --export 或 --import");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
