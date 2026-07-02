import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { CalendarMatchSpec } from "./teEventMap";

const DATA_DIR = path.join(process.cwd(), ".data");
const FRED_OVERRIDES_FILE = path.join(DATA_DIR, "te-calendar-mapping-overrides.json");
const LEGACY_FRED_OVERRIDES_FILE = path.join(DATA_DIR, "calendar-mapping-overrides.json");
const PACKAGE_OVERRIDES_FILE = path.join(DATA_DIR, "te-release-package-overrides.json");

export type CalendarOverrideKind = "fred" | "package";

export type CalendarOverrideBuckets = {
  fred: Record<string, CalendarMatchSpec>;
  package: Record<string, CalendarMatchSpec>;
};

function normalizeSpec(raw: unknown): CalendarMatchSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const keywords = Array.isArray(r.keywords)
    ? r.keywords.map(String).filter(Boolean)
    : [];
  if (!keywords.length) return null;
  return {
    countryCodes: Array.isArray(r.countryCodes) ? r.countryCodes.map(String) : [],
    keywords,
    excludeKeywords: Array.isArray(r.excludeKeywords)
      ? r.excludeKeywords.map(String)
      : undefined,
    eventId: r.eventId != null ? String(r.eventId) : undefined,
  };
}

function readFredOverridesFromFiles(): Record<string, CalendarMatchSpec> {
  const out: Record<string, CalendarMatchSpec> = {};
  for (const file of [FRED_OVERRIDES_FILE, LEGACY_FRED_OVERRIDES_FILE]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      for (const [key, spec] of Object.entries(parsed)) {
        const normalized = normalizeSpec(spec);
        if (normalized) out[key] = normalized;
      }
    } catch {
      // 无文件
    }
  }
  return out;
}

function readPackageOverridesFromFile(): Record<string, CalendarMatchSpec> {
  const out: Record<string, CalendarMatchSpec> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(PACKAGE_OVERRIDES_FILE, "utf8")) as Record<
      string,
      unknown
    >;
    for (const [key, spec] of Object.entries(parsed)) {
      const normalized = normalizeSpec(spec);
      if (normalized) out[key] = normalized;
    }
  } catch {
    // 无文件
  }
  return out;
}

export async function loadCalendarOverridesFromDb(
  prisma: PrismaClient,
): Promise<CalendarOverrideBuckets> {
  const rows = await prisma.dataSchedulerCalendarOverride.findMany();
  const fred: Record<string, CalendarMatchSpec> = {};
  const pkg: Record<string, CalendarMatchSpec> = {};
  for (const row of rows) {
    const spec = normalizeSpec(row.spec);
    if (!spec) continue;
    if (row.kind === "package") pkg[row.key] = spec;
    else fred[row.key] = spec;
  }
  return { fred, package: pkg };
}

/** 合并：DB 优先，文件填补 DB 未覆盖的键（迁移期兼容） */
export async function loadMergedCalendarOverrides(
  prisma: PrismaClient,
): Promise<CalendarOverrideBuckets> {
  const fromDb = await loadCalendarOverridesFromDb(prisma);
  const fromFileFred = readFredOverridesFromFiles();
  const fromFilePkg = readPackageOverridesFromFile();
  return {
    fred: { ...fromFileFred, ...fromDb.fred },
    package: { ...fromFilePkg, ...fromDb.package },
  };
}

export async function upsertCalendarOverrideInDb(
  prisma: PrismaClient,
  kind: CalendarOverrideKind,
  key: string,
  spec: CalendarMatchSpec,
): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("缺少 key");
  if (!spec.keywords?.length) throw new Error("keywords 不能为空");
  await prisma.dataSchedulerCalendarOverride.upsert({
    where: { key: trimmed },
    create: {
      key: trimmed,
      kind,
      spec: spec as object,
    },
    update: {
      kind,
      spec: spec as object,
    },
  });
}

export async function deleteCalendarOverrideFromDb(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await prisma.dataSchedulerCalendarOverride.deleteMany({
    where: { key: key.trim() },
  });
}

/** 将 `.data/*.json` 覆盖导入 DB（幂等，不删 DB 已有项） */
export async function importFileCalendarOverridesToDb(prisma: PrismaClient): Promise<{
  fredImported: number;
  packageImported: number;
}> {
  const existing = await prisma.dataSchedulerCalendarOverride.findMany({
    select: { key: true },
  });
  const have = new Set(existing.map((r) => r.key));
  let fredImported = 0;
  let packageImported = 0;

  for (const [key, spec] of Object.entries(readFredOverridesFromFiles())) {
    if (have.has(key)) continue;
    await upsertCalendarOverrideInDb(prisma, "fred", key, spec);
    fredImported += 1;
  }
  for (const [key, spec] of Object.entries(readPackageOverridesFromFile())) {
    if (have.has(key)) continue;
    await upsertCalendarOverrideInDb(prisma, "package", key, spec);
    packageImported += 1;
  }

  return { fredImported, packageImported };
}

export async function exportCalendarOverridesToFile(
  prisma: PrismaClient,
): Promise<{ fredPath: string; packagePath: string }> {
  const buckets = await loadCalendarOverridesFromDb(prisma);
  await fsPromises.mkdir(DATA_DIR, { recursive: true });

  const fredPayload: Record<string, CalendarMatchSpec & { updatedAt: string }> = {};
  for (const [key, spec] of Object.entries(buckets.fred)) {
    fredPayload[key] = { ...spec, updatedAt: new Date().toISOString() };
  }
  await fsPromises.writeFile(FRED_OVERRIDES_FILE, `${JSON.stringify(fredPayload, null, 2)}\n`, "utf8");

  const pkgPayload: Record<string, CalendarMatchSpec & { updatedAt: string }> = {};
  for (const [key, spec] of Object.entries(buckets.package)) {
    pkgPayload[key] = { ...spec, updatedAt: new Date().toISOString() };
  }
  await fsPromises.writeFile(PACKAGE_OVERRIDES_FILE, `${JSON.stringify(pkgPayload, null, 2)}\n`, "utf8");

  return { fredPath: FRED_OVERRIDES_FILE, packagePath: PACKAGE_OVERRIDES_FILE };
}
