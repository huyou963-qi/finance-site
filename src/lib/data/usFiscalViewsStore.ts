import { prisma } from "@/lib/prisma";
import {
  FISCAL_NATIVE_TREASURY,
  FISCAL_HOLDER_FRED,
} from "./scheduler/usFiscalFoundation/catalog";
import { buildUsFiscalViews, type FiscalPoint } from "./usFiscalViews";
import type { TreasuryRow } from "./scheduler/usFiscalFoundation/raw";
import type { UsFiscalViewsPayload } from "./usFiscalViewTypes";

let cached:
  | { day: string; expires: number; result: Promise<UsFiscalViewsPayload> }
  | undefined;
async function load(today: string): Promise<UsFiscalViewsPayload> {
  const instruments = await prisma.instrument.findMany({
    where: {
      OR: [
        { code: { in: FISCAL_NATIVE_TREASURY.map((r) => r.code) } },
        {
          fredSeriesId: {
            in: [
              "GFDEGDQ188S",
              "FYGFGDQ188S",
              ...FISCAL_HOLDER_FRED.map((r) => r.fredId),
            ],
          },
        },
      ],
    },
    select: { id: true, code: true, fredSeriesId: true },
  });
  const names = new Map(
    instruments.map((r) => [
      r.id,
      r.fredSeriesId ? `fred:${r.fredSeriesId}` : r.code,
    ]),
  );
  const cutoff = new Date(`${today}T00:00:00Z`);
  // Ten visible years, plus warm-up for annual comparisons of trailing totals.
  const historyStart = new Date(
    Date.UTC(cutoff.getUTCFullYear() - 12, cutoff.getUTCMonth(), 1),
  );
  const auctionStart = new Date(Date.UTC(cutoff.getUTCFullYear() - 5, 0, 1));
  const [points, mspd, auctions] = await Promise.all([
    prisma.macroObservation.findMany({
      where: {
        instrumentId: { in: instruments.map((r) => r.id) },
        obsDate: { gte: historyStart, lte: cutoff },
      },
      orderBy: { obsDate: "asc" },
      take: 100001,
      select: { instrumentId: true, obsDate: true, value: true },
    }),
    prisma.treasurySourceSnapshot.findFirst({
      where: { dataset: "mspd", asOfDate: { lte: cutoff } },
      orderBy: [{ asOfDate: "desc" }, { capturedAt: "desc" }, { id: "desc" }],
      select: { asOfDate: true, payload: true },
    }),
    prisma.$queryRaw<
      Array<{ payload: unknown }>
    >`SELECT DISTINCT ON (record_key) payload FROM mds.treasury_source_snapshot WHERE dataset='auctions' AND as_of_date >= ${auctionStart} AND as_of_date <= ${cutoff} ORDER BY record_key,captured_at DESC,id DESC LIMIT 6001`,
  ]);
  if (
    !mspd ||
    !points.length ||
    !auctions.length ||
    points.length > 100000 ||
    auctions.length > 6000
  )
    throw new Error("Fiscal input missing or exceeds bounded read limits");
  const series: Record<string, FiscalPoint[]> = {};
  for (const p of points) {
    const key = names.get(p.instrumentId)!;
    (series[key] ??= []).push({
      date: p.obsDate.toISOString().slice(0, 10),
      value: p.value,
    });
  }
  return buildUsFiscalViews({
    series,
    mspd: {
      date: mspd.asOfDate.toISOString().slice(0, 10),
      rows: mspd.payload as TreasuryRow[],
    },
    auctions: auctions.flatMap((r) => r.payload as TreasuryRow[]),
    today,
  });
}
export function getUsFiscalViews(): Promise<UsFiscalViewsPayload> {
  const day = new Date().toISOString().slice(0, 10);
  if (cached && cached.day === day && cached.expires > Date.now())
    return cached.result;
  const result = load(day).catch((error) => {
    if (cached?.result === result) cached = undefined;
    throw error;
  });
  cached = { day, expires: Date.now() + 30 * 60000, result };
  return result;
}
