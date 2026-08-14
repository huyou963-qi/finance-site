import { prisma } from "@/lib/prisma";
import { normalizeGicsSector } from "@/lib/equity/gicsCatalog";

export type SectorClassificationHistoryInput = {
  symbol: string;
  scheme: string;
  sector: string | null;
  industryGroup: string | null;
  industry: string | null;
  subIndustry: string | null;
  industryCode: string | null;
  sic: string | null;
  sicDescription: string | null;
  validFrom: string;
  validTo: string | null;
  source: string;
  confidence: number;
};

function isoDate(value: unknown, nullable = false): string | null {
  const text = value == null ? "" : String(value).trim().slice(0, 10);
  if (!text && nullable) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`非法日期: ${String(value)}`);
  }
  return text;
}

function optional(value: unknown): string | null {
  const result = value == null ? "" : String(value).trim();
  return result || null;
}

export function normalizeClassificationInput(
  raw: Record<string, unknown>,
  defaultSource?: string,
): SectorClassificationHistoryInput {
  const symbol = String(raw.symbol ?? "").trim().toUpperCase();
  const scheme = String(raw.scheme ?? "gics").trim().toLowerCase();
  const source = String(raw.source ?? defaultSource ?? "").trim();
  if (!symbol || !scheme || !source) throw new Error("symbol、scheme、source 为必填字段");
  const sectorRaw = optional(raw.sector);
  const sector = scheme === "gics" ? normalizeGicsSector(sectorRaw) : sectorRaw;
  if (scheme === "gics" && !sector) throw new Error(`${symbol} 的 GICS sector 无法识别: ${sectorRaw}`);
  const confidence = Number(raw.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`${symbol} confidence 必须位于 0–1`);
  }
  const validFrom = isoDate(raw.validFrom)!;
  const validTo = isoDate(raw.validTo, true);
  if (validTo && validTo < validFrom) throw new Error(`${symbol} validTo 早于 validFrom`);
  return {
    symbol,
    scheme,
    sector,
    industryGroup: optional(raw.industryGroup),
    industry: optional(raw.industry),
    subIndustry: optional(raw.subIndustry),
    industryCode: optional(raw.industryCode),
    sic: optional(raw.sic),
    sicDescription: optional(raw.sicDescription),
    validFrom,
    validTo,
    source,
    confidence,
  };
}

export function validateClassificationIntervals(
  rows: readonly SectorClassificationHistoryInput[],
): void {
  const groups = new Map<string, SectorClassificationHistoryInput[]>();
  for (const row of rows) {
    const key = `${row.symbol}|${row.scheme}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const [key, group] of groups) {
    group.sort((left, right) => left.validFrom.localeCompare(right.validFrom));
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1]!;
      const current = group[index]!;
      if (!previous.validTo || previous.validTo >= current.validFrom) {
        throw new Error(`${key} 分类有效期重叠: ${previous.validFrom}..${previous.validTo ?? "open"} / ${current.validFrom}`);
      }
    }
  }
}

function date(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function upsertClassificationHistory(
  rows: readonly SectorClassificationHistoryInput[],
): Promise<number> {
  validateClassificationIntervals(rows);
  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const schemes = [...new Set(rows.map((row) => row.scheme))];
  const existing = await prisma.equitySectorClassificationHistory.findMany({
    where: { symbol: { in: symbols }, scheme: { in: schemes } },
  });
  const incomingKeys = new Set(rows.map((row) => `${row.symbol}|${row.scheme}|${row.validFrom}`));
  validateClassificationIntervals([
    ...existing
      .filter((row) => !incomingKeys.has(`${row.symbol}|${row.scheme}|${row.validFrom.toISOString().slice(0, 10)}`))
      .map((row) => ({
        symbol: row.symbol,
        scheme: row.scheme,
        sector: row.sector,
        industryGroup: row.industryGroup,
        industry: row.industry,
        subIndustry: row.subIndustry,
        industryCode: row.industryCode,
        sic: row.sic,
        sicDescription: row.sicDescription,
        validFrom: row.validFrom.toISOString().slice(0, 10),
        validTo: row.validTo?.toISOString().slice(0, 10) ?? null,
        source: row.source,
        confidence: row.confidence,
      })),
    ...rows,
  ]);

  await prisma.$transaction(
    rows.map((row) => {
      const data = {
        sector: row.sector,
        industryGroup: row.industryGroup,
        industry: row.industry,
        subIndustry: row.subIndustry,
        industryCode: row.industryCode,
        sic: row.sic,
        sicDescription: row.sicDescription,
        validTo: date(row.validTo),
        source: row.source,
        confidence: row.confidence,
        metadata: { importedAt: new Date().toISOString(), pointInTime: true },
      };
      return prisma.equitySectorClassificationHistory.upsert({
        where: {
          symbol_scheme_validFrom: {
            symbol: row.symbol,
            scheme: row.scheme,
            validFrom: date(row.validFrom)!,
          },
        },
        create: {
          symbol: row.symbol,
          scheme: row.scheme,
          validFrom: date(row.validFrom)!,
          ...data,
        },
        update: data,
      });
    }),
  );
  return rows.length;
}
