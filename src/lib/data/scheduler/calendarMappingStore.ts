import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { refreshCalendarOverrideCache } from "./calendarOverrideCache";
import {
  deleteCalendarOverrideFromDb,
  loadCalendarOverridesFromDb,
  loadMergedCalendarOverrides,
  upsertCalendarOverrideInDb,
} from "./calendarOverrideStore";
import { buildFredCalendarMapFromPackages } from "./releasePackageCatalog";
import { TE_CALENDAR_BY_FRED, mergedTeCalendarByFred, type CalendarMatchSpec } from "./teEventMap";

export type CalendarMappingEntry = CalendarMatchSpec & {
  updatedAt?: string;
};

export type CalendarMappingOverrides = Record<string, CalendarMappingEntry>;

export async function listCalendarMappings(): Promise<{
  builtIn: Record<string, CalendarMatchSpec>;
  legacyFallback: Record<string, CalendarMatchSpec>;
  overrides: CalendarMappingOverrides;
  merged: Record<string, CalendarMatchSpec>;
}> {
  await refreshCalendarOverrideCache(prisma);
  const fromDb = await loadCalendarOverridesFromDb(prisma);
  const overrides: CalendarMappingOverrides = {};
  for (const [key, spec] of Object.entries(fromDb.fred)) {
    overrides[key] = { ...spec };
  }

  const fromPackages = buildFredCalendarMapFromPackages();
  const merged = mergedTeCalendarByFred();

  return {
    builtIn: fromPackages,
    legacyFallback: TE_CALENDAR_BY_FRED,
    overrides,
    merged,
  };
}

export async function getCalendarSpecOverride(key: string): Promise<CalendarMatchSpec | null> {
  await refreshCalendarOverrideCache(prisma);
  const buckets = await loadMergedCalendarOverrides(prisma);
  return buckets.fred[key.trim()] ?? null;
}

export async function upsertCalendarMappingOverride(
  key: string,
  spec: CalendarMatchSpec,
): Promise<CalendarMappingOverrides> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("缺少 fredKey");
  if (!spec.keywords?.length) throw new Error("keywords 不能为空");

  await upsertCalendarOverrideInDb(prisma, "fred", trimmed, spec);
  await refreshCalendarOverrideCache(prisma);
  const { overrides } = await listCalendarMappings();
  return overrides;
}

export async function deleteCalendarMappingOverride(key: string): Promise<CalendarMappingOverrides> {
  await deleteCalendarOverrideFromDb(prisma, key.trim());
  await refreshCalendarOverrideCache(prisma);
  const { overrides } = await listCalendarMappings();
  return overrides;
}

export async function importLegacyCalendarOverrideFiles(): Promise<{
  fredImported: number;
  packageImported: number;
}> {
  const { importFileCalendarOverridesToDb } = await import("./calendarOverrideStore");
  const result = await importFileCalendarOverridesToDb(prisma);
  await refreshCalendarOverrideCache(prisma);
  return result;
}

export async function exportCalendarOverridesToLegacyFiles(): Promise<{ fredPath: string }> {
  const { exportCalendarOverridesToFile } = await import("./calendarOverrideStore");
  const paths = await exportCalendarOverridesToFile(prisma);
  return { fredPath: paths.fredPath };
}
