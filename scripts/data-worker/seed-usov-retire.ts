/**
 * 退役 US_Overview 不合规 xlsx 序列（幂等；部署时随 data:apply 执行）
 *
 * npm run data:seed -- --catalog=usov-retire [-- --dry-run]
 *
 * 对 RETIRED_USOV_CODES 逐条执行与管理端「删除指标」（/api/admin/catalog-layout/item）相同的清理：
 * 写 tombstone → 删抓取记录、发布包成员、订阅、仪器（级联删除观测与版本账本）→ 布局去幽灵引用。
 * 另把系统模板覆盖与用户工作区/模板里的旧键替换为标准指标（usOverviewStandardSeries.ts）。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { Prisma, PrismaClient } from "@prisma/client";
import {
  RETIRED_USOV_CODES,
  rewriteRetiredUsovKeys,
} from "../../src/lib/data/usOverviewStandardSeries";
import { buildBaseCatalogCountries, clearFredCatalogCache } from "../../src/lib/data/fredCatalog";
import {
  loadMacroCatalogLayout,
  reconcileCatalogLayoutWithBase,
  saveMacroCatalogLayout,
} from "../../src/lib/data/catalogLayout";

const prisma = new PrismaClient();
const ACTOR = "data:seed-usov-retire";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function retireInstruments(dryRun: boolean) {
  for (const code of RETIRED_USOV_CODES) {
    const key = `mds:${code}`;
    const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
    const obs = instrument
      ? await prisma.macroObservation.count({ where: { instrumentId: instrument.id } })
      : 0;
    if (dryRun) {
      console.log(`  ~ ${code}${instrument ? `（${obs} 条观测）` : "（已不存在）"}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.macroCatalogExcludedKey.upsert({
        where: { catalogKey: key },
        create: { catalogKey: key, deletedBy: ACTOR },
        update: { deletedAt: new Date(), deletedBy: ACTOR },
      });
      if (!instrument) return;
      await tx.fetchRun.deleteMany({ where: { subscription: { instrumentId: instrument.id } } });
      await tx.releasePackageMember.deleteMany({ where: { instrumentId: instrument.id } });
      await tx.dataSubscription.deleteMany({ where: { instrumentId: instrument.id } });
      await tx.instrument.delete({ where: { id: instrument.id } });
    });
    console.log(instrument ? `  ✓ 已退役并删除 ${code}（${obs} 条观测）` : `  · ${code} 已不存在（tombstone 已确认）`);
  }
}

function rewriteTemplateList(list: unknown): { value: unknown; changed: boolean } {
  if (!Array.isArray(list)) return { value: list, changed: false };
  let changed = false;
  const value = list.map((tpl) => {
    if (!isObject(tpl)) return tpl;
    const r = rewriteRetiredUsovKeys(tpl);
    changed ||= r.changed;
    return r.value;
  });
  return { value, changed };
}

async function rewriteTemplates(dryRun: boolean) {
  const system = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (system && isObject(system.prefs)) {
    const prefs = { ...(system.prefs as JsonObject) };
    let changed = false;
    if (isObject(prefs.builtinTemplateOverrides)) {
      const overrides: JsonObject = {};
      for (const [id, tpl] of Object.entries(prefs.builtinTemplateOverrides)) {
        if (!isObject(tpl)) {
          overrides[id] = tpl;
          continue;
        }
        const r = rewriteRetiredUsovKeys(tpl);
        if (r.changed) console.log(`  ✓ 系统模板覆盖 ${id} 已替换退役键`);
        changed ||= r.changed;
        overrides[id] = r.value;
      }
      prefs.builtinTemplateOverrides = overrides;
    }
    const custom = rewriteTemplateList(prefs.customBuiltinTemplates);
    if (custom.changed) console.log("  ✓ 自定义系统模板已替换退役键");
    changed ||= custom.changed;
    prefs.customBuiltinTemplates = custom.value;
    if (changed && !dryRun) {
      await prisma.systemMacroChartPrefs.update({
        where: { id: "default" },
        data: { prefs: prefs as Prisma.InputJsonValue },
      });
    }
  }

  const users = await prisma.userMacroChartPrefs.findMany();
  for (const row of users) {
    if (!isObject(row.prefs)) continue;
    const top = rewriteRetiredUsovKeys(row.prefs as JsonObject);
    const prefs = { ...top.value };
    const templates = rewriteTemplateList(prefs.templates);
    prefs.templates = templates.value;
    if (!top.changed && !templates.changed) continue;
    console.log(`  ✓ 用户 ${row.userId} 工作区/模板已替换退役键`);
    if (!dryRun) {
      await prisma.userMacroChartPrefs.update({
        where: { userId: row.userId },
        data: { prefs: prefs as Prisma.InputJsonValue },
      });
    }
  }
}

async function reconcileLayout(dryRun: boolean) {
  const layout = await loadMacroCatalogLayout();
  if (!layout || dryRun) return;
  const base = await buildBaseCatalogCountries();
  await saveMacroCatalogLayout(reconcileCatalogLayoutWithBase(layout, base), ACTOR);
  clearFredCatalogCache();
  console.log("  ✓ 目录布局已清理退役键");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[data:seed-usov-retire] 退役 ${RETIRED_USOV_CODES.length} 条 US_Overview xlsx 序列${dryRun ? "（dry-run）" : ""}…`);
  await retireInstruments(dryRun);
  console.log("[data:seed-usov-retire] 模板替换为标准指标…");
  await rewriteTemplates(dryRun);
  await reconcileLayout(dryRun);
  console.log("[data:seed-usov-retire] 完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
