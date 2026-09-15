/**
 * 系统内置模板配置（SystemMacroChartPrefs，全局单例 id=default）与 git 快照互相同步
 *
 * npm run data:export-system-macro-chart-prefs   # DB → data/system-macro-chart-prefs.json
 * npm run data:import-system-macro-chart-prefs   # 快照 → DB（整行覆盖）[-- --dry-run]
 *
 * 管理员在生产端改完系统模板后：服务器上 export → 快照提交 git → 本地 import。
 * 不接入 data:apply：部署时自动 import 会覆盖生产端尚未导出的管理员改动。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SNAPSHOT = path.join(process.cwd(), "data", "system-macro-chart-prefs.json");
const REQUIRED_KEYS = [
  "builtinTemplateOverrides",
  "customBuiltinTemplates",
  "builtinTemplateFolders",
  "builtinTemplateFolderIds",
  "hiddenBuiltinTemplateIds",
];

function summarize(prefs: Record<string, unknown>) {
  const count = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);
  return REQUIRED_KEYS.map((k) => `${k}=${count(prefs[k])}`).join(" ");
}

async function exportSnapshot() {
  const row = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (!row) throw new Error("SystemMacroChartPrefs 无 default 行，无可导出");
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(row.prefs, null, 2)}\n`);
  console.log(`[system-macro-chart-prefs] 已导出（updated_at ${row.updatedAt.toISOString()}）→ ${SNAPSHOT}`);
  console.log(`  ${summarize(row.prefs as Record<string, unknown>)}`);
}

async function importSnapshot(dryRun: boolean) {
  const prefs = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as Record<string, unknown>;
  const missing = REQUIRED_KEYS.filter((k) => !(k in prefs));
  if (prefs.version !== 1 || missing.length) {
    throw new Error(`快照格式不符（version=${String(prefs.version)}，缺 ${missing.join(",") || "无"}）`);
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
  else if (process.argv.includes("--import")) await importSnapshot(process.argv.includes("--dry-run"));
  else throw new Error("需指定 --export 或 --import");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
