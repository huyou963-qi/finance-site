import type { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_BATCH_SIZE = 2_000;

export type MacroObservationVintageInput = {
  instrumentId: string;
  obsDate: Date;
  availableAt: Date;
  realtimeStart?: Date | null;
  realtimeEnd?: Date | null;
  value: number;
  source: string;
  sourceSeriesId?: string | null;
  isInitialRelease?: boolean;
  metadata?: Prisma.InputJsonValue;
};

type VintageWriter = Pick<PrismaClient, "macroObservationVintage">;

/**
 * 宏观版本事实的唯一追加入口。所有 source adapter、worker capture 和回填任务
 * 都必须经过这里，以保持批量、幂等和 append-only 语义一致。
 */
export async function appendMacroObservationVintages(
  client: VintageWriter,
  rows: readonly MacroObservationVintageInput[],
  options: { batchSize?: number } = {},
): Promise<number> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  let inserted = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const result = await client.macroObservationVintage.createMany({
      data: batch.map((row) => ({
        instrumentId: row.instrumentId,
        obsDate: row.obsDate,
        availableAt: row.availableAt,
        realtimeStart: row.realtimeStart ?? null,
        realtimeEnd: row.realtimeEnd ?? null,
        value: row.value,
        source: row.source,
        sourceSeriesId: row.sourceSeriesId ?? null,
        isInitialRelease: row.isInitialRelease ?? false,
        ...(row.metadata === undefined ? {} : { metadata: row.metadata }),
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }
  return inserted;
}
