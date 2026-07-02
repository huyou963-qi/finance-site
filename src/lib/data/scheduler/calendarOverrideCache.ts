import type { PrismaClient } from "@prisma/client";
import { loadMergedCalendarOverrides } from "./calendarOverrideStore";
import type { CalendarMatchSpec } from "./teEventMap";

let cachedFred: Record<string, CalendarMatchSpec> | null = null;
let cachedPackage: Record<string, CalendarMatchSpec> | null = null;

export async function refreshCalendarOverrideCache(prisma: PrismaClient): Promise<void> {
  const merged = await loadMergedCalendarOverrides(prisma);
  cachedFred = merged.fred;
  cachedPackage = merged.package;
}

export function getCachedFredCalendarOverrides(): Record<string, CalendarMatchSpec> {
  return cachedFred ?? {};
}

export function getCachedPackageCalendarOverrides(): Record<string, CalendarMatchSpec> {
  return cachedPackage ?? {};
}

export function applyFredOverridesToMap(
  merged: Record<string, CalendarMatchSpec>,
): Record<string, CalendarMatchSpec> {
  const overrides = getCachedFredCalendarOverrides();
  for (const [key, spec] of Object.entries(overrides)) {
    merged[key] = spec;
  }
  return merged;
}
