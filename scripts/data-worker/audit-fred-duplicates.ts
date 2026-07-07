/**
 * 只读审计：找出「同一 FRED 序列被多个 code 的 MACRO_SERIES 仪器占用」的重复仪器。
 *
 * 用途：db-first（fredDbFirst.ts）按 Instrument.fredSeriesId 查库；schema 中该字段
 * @unique，且存在重复仪器，导致 seed-overview/seed-fiscal 不能安全补 fredSeriesId。
 * 本脚本按「派生 fredId」分组，列出 count>1 的组与各仪器的关键属性，供制定去重策略。
 *
 * 运行：dotenv -e .env.local -- tsx scripts/data-worker/audit-fred-duplicates.ts
 * 只读：不写任何表。
 */
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** 从仪器 code / 订阅 / metadata / fredSeriesId 推导其对应的 FRED series id（大写） */
function deriveFredId(inst: {
  code: string;
  fredSeriesId: string | null;
  metadata: unknown;
  dataSubscription: { sourceSeriesKey: string; source: { adapterKind: SourceAdapterKind } } | null;
}): string | null {
  const sub = inst.dataSubscription;
  if (
    sub &&
    sub.source.adapterKind === SourceAdapterKind.FRED_API &&
    sub.sourceSeriesKey &&
    sub.sourceSeriesKey.toUpperCase() !== "COMPOSITE"
  ) {
    return sub.sourceSeriesKey.trim().toUpperCase();
  }
  const m = /^sched_fred_(.+)$/i.exec(inst.code);
  if (m) return m[1].trim().toUpperCase();
  if (inst.fredSeriesId) return inst.fredSeriesId.trim().toUpperCase();
  const meta = inst.metadata as Record<string, unknown> | null;
  const catalogKey = typeof meta?.catalogKey === "string" ? meta.catalogKey : null;
  if (catalogKey && catalogKey.startsWith("fred:")) {
    return catalogKey.slice("fred:".length).trim().toUpperCase();
  }
  return null;
}

async function main() {
  const instruments = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES },
    select: {
      id: true,
      code: true,
      name: true,
      fredSeriesId: true,
      metadata: true,
      dataSubscription: {
        select: {
          sourceSeriesKey: true,
          sourceId: true,
          enabled: true,
          priority: true,
          source: { select: { adapterKind: true } },
        },
      },
      releasePackageMembers: { select: { packageId: true } },
      _count: { select: { macroPoints: true } },
    },
  });

  // catalog layout JSON —— 扫描其中引用到的 code / catalogKey / fredId
  const layout = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  const layoutStr = layout ? JSON.stringify(layout.layout) : "";

  type Row = (typeof instruments)[number];
  const byFred = new Map<string, Row[]>();
  const noFred: Row[] = [];
  for (const inst of instruments) {
    const fid = deriveFredId(inst);
    if (!fid) {
      noFred.push(inst);
      continue;
    }
    const arr = byFred.get(fid) ?? [];
    arr.push(inst);
    byFred.set(fid, arr);
  }

  const dupGroups = [...byFred.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  console.log(`\n=== MACRO_SERIES 仪器总数: ${instruments.length} ===`);
  console.log(`可派生 fredId 的分组数: ${byFred.size}；重复(count>1)分组数: ${dupGroups.length}\n`);

  for (const [fid, arr] of dupGroups) {
    console.log(`\n### FRED ${fid}  (${arr.length} 个仪器)`);
    for (const inst of arr) {
      const sub = inst.dataSubscription;
      const refs: string[] = [];
      if (layoutStr.includes(inst.code)) refs.push("layout:code");
      if (layoutStr.includes(`fred:${fid}`)) refs.push("layout:fred-key");
      const pkg = inst.releasePackageMembers.map((m) => m.packageId).join(",") || "-";
      console.log(
        [
          `  code=${inst.code}`,
          `fredSeriesId=${inst.fredSeriesId ?? "null"}`,
          `obs=${inst._count.macroPoints}`,
          `sub=${sub ? `${sub.sourceId}/${sub.sourceSeriesKey}/${sub.enabled ? "on" : "off"}/p${sub.priority}` : "none"}`,
          `pkg=${pkg}`,
          `refs=${refs.join("+") || "-"}`,
          `id=${inst.id}`,
        ].join("  "),
      );
    }
  }

  // 额外：当前已设置 fredSeriesId 的仪器，确认无隐藏冲突
  const withFred = instruments.filter((i) => i.fredSeriesId);
  console.log(`\n=== 已设置 fredSeriesId 的仪器: ${withFred.length} ===`);
  const fredIdSeen = new Map<string, string[]>();
  for (const i of withFred) {
    const k = i.fredSeriesId!.toUpperCase();
    const a = fredIdSeen.get(k) ?? [];
    a.push(i.code);
    fredIdSeen.set(k, a);
  }
  for (const [k, codes] of fredIdSeen) {
    if (codes.length > 1) console.log(`  ⚠ fredSeriesId=${k} 被多仪器占用: ${codes.join(", ")}`);
  }

  console.log(`\n=== 无法派生 fredId 的 MACRO_SERIES: ${noFred.length}（前 20）===`);
  for (const i of noFred.slice(0, 20)) console.log(`  code=${i.code}  name=${i.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
