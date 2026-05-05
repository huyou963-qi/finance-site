import type { Prisma } from "@prisma/client";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type { MacroSeriesVisualConfigMap } from "@/lib/macroChartOption";
import { prisma } from "@/lib/prisma";

export type MacroChartPrefs = {
  version: 1;
  layoutMode: 1 | 2 | 3 | 4;
  selectedKeys: string[];
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap: MacroSeriesVisualConfigMap;
};

function sanitize(input: unknown): MacroChartPrefs | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const lm = Number(o.layoutMode);
  const layoutMode = lm === 1 || lm === 2 || lm === 3 || lm === 4 ? lm : 1;
  const selectedKeys = Array.isArray(o.selectedKeys)
    ? o.selectedKeys.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const slotAssignment =
    o.slotAssignment && typeof o.slotAssignment === "object"
      ? (o.slotAssignment as MacroSlotAssignment)
      : {};
  const seriesVisualMap =
    o.seriesVisualMap && typeof o.seriesVisualMap === "object"
      ? (o.seriesVisualMap as MacroSeriesVisualConfigMap)
      : {};
  return {
    version: 1,
    layoutMode,
    selectedKeys,
    slotAssignment,
    seriesVisualMap,
  };
}

export async function loadMacroChartPrefsForUser(
  userId: string,
): Promise<MacroChartPrefs | null> {
  const row = await prisma.userMacroChartPrefs.findUnique({
    where: { userId },
  });
  if (!row) return null;
  return sanitize(row.prefs as unknown);
}

export async function saveMacroChartPrefsForUser(
  userId: string,
  input: unknown,
): Promise<MacroChartPrefs> {
  const prefs = sanitize(input);
  if (!prefs) throw new Error("图形配置格式不合法");
  const json = prefs as unknown as Prisma.InputJsonValue;
  await prisma.userMacroChartPrefs.upsert({
    where: { userId },
    create: { userId, prefs: json },
    update: { prefs: json },
  });
  return prefs;
}
