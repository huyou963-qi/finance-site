/**
 * 将旧 market_event 行适配到新框架字段（scope / markerLabel / sourceKind / externalId / tags / eventType）。
 * 幂等：可重复执行；已写好的 externalId 会保留，仅补齐/规范化空缺与遗留中文类型。
 *
 * Usage:
 *   npm run db:backfill-market-event-fields -- --dry-run
 *   npm run db:backfill-market-event-fields
 *
 * 云上（事件已在生产库，无需传 JSON）：
 *   cd /opt/finance-site && npm run db:backfill-market-event-fields
 */
import { loadEnvConfig } from "@next/env";
import type { EventScope, Prisma } from "@prisma/client";
import {
  defaultMarkerLabel,
  normalizeEventType,
  normalizeIndustryTag,
} from "../src/lib/data/eventTaxonomy";
import { prisma } from "../src/lib/prisma";

loadEnvConfig(process.cwd());

function extractMarker(content: string, key: string): string | null {
  const re = new RegExp(`\\[${key}:([^\\]]+)\\]`);
  const m = re.exec(content);
  return m?.[1]?.trim() || null;
}

function isGicsLike(raw: string): boolean {
  const n = normalizeIndustryTag(raw);
  return /^\d{2}(\d{2})?(\d{2})?$/.test(n);
}

function inferScope(row: {
  countries: string[];
  industries: string[];
  assets: string[];
}): EventScope {
  if (row.assets.length > 0) return "COMPANY";
  if (row.countries.length > 0) return "COUNTRY";
  if (row.industries.some(isGicsLike)) return "INDUSTRY";
  return "CROSS";
}

function splitIndustriesAndTags(
  industries: string[],
  content: string,
): { industries: string[]; tags: string[] } {
  const gics: string[] = [];
  const tags = new Set<string>();

  const eraTag = extractMarker(content, "era:tag");
  if (eraTag) tags.add(eraTag);

  for (const raw of industries) {
    const t = raw.trim();
    if (!t) continue;
    if (t === "时代阶段") {
      tags.add("时代阶段");
      continue;
    }
    if (isGicsLike(t)) {
      gics.push(normalizeIndustryTag(t));
      continue;
    }
    // 旧数据把时代名塞进 industries → 迁到 tags
    tags.add(t);
  }

  return {
    industries: [...new Set(gics)],
    tags: [...tags],
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await prisma.marketEvent.findMany({
    select: {
      id: true,
      title: true,
      content: true,
      eventType: true,
      scope: true,
      countries: true,
      industries: true,
      assets: true,
      tags: true,
      markerLabel: true,
      sourceKind: true,
      externalId: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (const row of rows) {
    const seedKey = extractMarker(row.content, "seed");
    const nextType = normalizeEventType(row.eventType) ?? row.eventType;
    const nextScope = inferScope(row);
    const { industries, tags } = splitIndustriesAndTags(row.industries, row.content);
    const mergedTags = [...new Set([...row.tags, ...tags])];
    const nextMarker =
      row.markerLabel?.trim() || defaultMarkerLabel(nextType);
    const nextSourceKind = row.sourceKind?.trim() || (seedKey ? "seed" : null);
    const nextExternalId = row.externalId?.trim() || seedKey;

    const data: Prisma.MarketEventUpdateInput = {};
    if (nextType && nextType !== row.eventType) data.eventType = nextType;
    if (nextScope !== row.scope) data.scope = nextScope;
    if (
      industries.length !== row.industries.length ||
      industries.some((v, i) => v !== row.industries[i])
    ) {
      data.industries = industries;
    }
    if (
      mergedTags.length !== row.tags.length ||
      mergedTags.some((v, i) => v !== row.tags[i])
    ) {
      data.tags = mergedTags;
    }
    if (!row.markerLabel?.trim()) data.markerLabel = nextMarker.slice(0, 16);
    if (!row.sourceKind?.trim() && nextSourceKind) data.sourceKind = nextSourceKind;
    if (!row.externalId?.trim() && nextExternalId) {
      data.externalId = nextExternalId.slice(0, 128);
    }

    if (Object.keys(data).length === 0) {
      skipped++;
      continue;
    }

    if (samples.length < 5) {
      samples.push(
        `${row.title ?? row.id}: type ${row.eventType}→${nextType ?? row.eventType}, scope→${nextScope}, marker→${nextMarker}, ext→${nextExternalId ?? "-"}`,
      );
    }

    if (!dryRun) {
      await prisma.marketEvent.update({ where: { id: row.id }, data });
    }
    updated++;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        total: rows.length,
        wouldUpdate: updated,
        unchanged: skipped,
        samples,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
