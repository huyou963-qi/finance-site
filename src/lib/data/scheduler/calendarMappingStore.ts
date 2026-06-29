import fs from "node:fs/promises";
import path from "node:path";
import { TE_CALENDAR_BY_FRED, type CalendarMatchSpec } from "./teEventMap";

const DATA_DIR = path.join(process.cwd(), ".data");
const OVERRIDES_FILE = path.join(DATA_DIR, "te-calendar-mapping-overrides.json");
const LEGACY_OVERRIDES_FILE = path.join(DATA_DIR, "calendar-mapping-overrides.json");

export type CalendarMappingEntry = CalendarMatchSpec & {
  updatedAt?: string;
};

export type CalendarMappingOverrides = Record<string, CalendarMappingEntry>;

async function readOverridesFile(): Promise<CalendarMappingOverrides> {
  for (const file of [OVERRIDES_FILE, LEGACY_OVERRIDES_FILE]) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as CalendarMappingOverrides;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      // try next
    }
  }
  return {};
}

async function writeOverridesFile(data: CalendarMappingOverrides): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OVERRIDES_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function listCalendarMappings(): Promise<{
  builtIn: Record<string, CalendarMatchSpec>;
  overrides: CalendarMappingOverrides;
  merged: Record<string, CalendarMatchSpec>;
}> {
  const overrides = await readOverridesFile();
  const merged: Record<string, CalendarMatchSpec> = {
    ...TE_CALENDAR_BY_FRED,
  };
  for (const [key, spec] of Object.entries(overrides)) {
    merged[key] = {
      countryCodes: spec.countryCodes,
      keywords: spec.keywords,
      excludeKeywords: spec.excludeKeywords,
      eventId: spec.eventId,
    };
  }
  return { builtIn: TE_CALENDAR_BY_FRED, overrides, merged };
}

export async function getCalendarSpecOverride(key: string): Promise<CalendarMatchSpec | null> {
  const overrides = await readOverridesFile();
  const spec = overrides[key];
  if (!spec) return null;
  return {
    countryCodes: spec.countryCodes,
    keywords: spec.keywords,
    excludeKeywords: spec.excludeKeywords,
    eventId: spec.eventId,
  };
}

export async function upsertCalendarMappingOverride(
  key: string,
  spec: CalendarMatchSpec,
): Promise<CalendarMappingOverrides> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("缺少 fredKey");
  if (!spec.keywords?.length) throw new Error("keywords 不能为空");

  const overrides = await readOverridesFile();
  overrides[trimmed] = {
    ...spec,
    updatedAt: new Date().toISOString(),
  };
  await writeOverridesFile(overrides);
  return overrides;
}

export async function deleteCalendarMappingOverride(key: string): Promise<CalendarMappingOverrides> {
  const overrides = await readOverridesFile();
  delete overrides[key.trim()];
  await writeOverridesFile(overrides);
  return overrides;
}
