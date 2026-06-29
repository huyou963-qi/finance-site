import type { PrismaClient } from "@prisma/client";
import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
  cotSlugFromCode,
} from "@/lib/data/cot/cotProductCatalog";
import type { CotReportPayload, CotReportRow } from "@/lib/data/cot/cotReportTypes";

export type { CotReportPayload, CotReportRow } from "@/lib/data/cot/cotReportTypes";

function fmtReportTuesday(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()] ?? "???";
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${day}-${mon}-${yy}`;
}

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function yearWindow(points: Array<{ obsDate: Date; net: number }>, asOf: Date): number[] {
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - 52 * 7);
  return points.filter((p) => p.obsDate >= cutoff && p.obsDate <= asOf).map((p) => p.net);
}

export async function buildCotReportFromDb(prisma: PrismaClient): Promise<CotReportPayload> {
  const codes = COT_MM_PRODUCTS.flatMap((p) => [
    cotInstrumentCode(p.slug, "long"),
    cotInstrumentCode(p.slug, "short"),
  ]);

  const instruments = await prisma.instrument.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(instruments.map((i) => [i.code, i.id]));

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 60 * 7);

  const observations = await prisma.macroObservation.findMany({
    where: {
      instrumentId: { in: instruments.map((i) => i.id) },
      obsDate: { gte: since },
    },
    orderBy: { obsDate: "asc" },
    select: { instrumentId: true, obsDate: true, value: true },
  });

  const byInst = new Map<string, Array<{ obsDate: Date; value: number }>>();
  for (const obs of observations) {
    const arr = byInst.get(obs.instrumentId) ?? [];
    arr.push({ obsDate: obs.obsDate, value: obs.value });
    byInst.set(obs.instrumentId, arr);
  }

  let latestReportDate: string | null = null;
  const rows: CotReportRow[] = [];

  for (const product of COT_MM_PRODUCTS) {
    const longId = idByCode.get(cotInstrumentCode(product.slug, "long"));
    const shortId = idByCode.get(cotInstrumentCode(product.slug, "short"));
    const longPts = longId ? (byInst.get(longId) ?? []) : [];
    const shortPts = shortId ? (byInst.get(shortId) ?? []) : [];

    const dateSet = new Set<string>();
    for (const p of longPts) dateSet.add(p.obsDate.toISOString().slice(0, 10));
    for (const p of shortPts) dateSet.add(p.obsDate.toISOString().slice(0, 10));
    const dates = [...dateSet].sort();

    const longByDate = new Map(longPts.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]));
    const shortByDate = new Map(shortPts.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]));

    const netSeries = dates.map((d) => ({
      obsDate: new Date(`${d}T00:00:00.000Z`),
      long: longByDate.get(d) ?? null,
      short: shortByDate.get(d) ?? null,
      net:
        longByDate.get(d) != null && shortByDate.get(d) != null
          ? (longByDate.get(d) as number) - (shortByDate.get(d) as number)
          : null,
    }));

    const validNet = netSeries.filter((p) => p.net != null);
    const latest = validNet[validNet.length - 1];
    const prev = validNet[validNet.length - 2];

    if (latest?.obsDate) {
      const iso = latest.obsDate.toISOString().slice(0, 10);
      if (!latestReportDate || iso > latestReportDate) latestReportDate = iso;
    }

    const yearNets = latest
      ? yearWindow(
          validNet.map((p) => ({ obsDate: p.obsDate, net: p.net as number })),
          latest.obsDate,
        )
      : [];
    const yearHigh = yearNets.length ? Math.max(...yearNets) : null;
    const yearLow = yearNets.length ? Math.min(...yearNets) : null;
    const relativeToMax =
      latest?.net != null && yearHigh != null && yearHigh !== 0
        ? (latest.net / yearHigh) * 100
        : null;

    const sparkWeeks = validNet.slice(-26).map((p) => p.net as number);

    rows.push({
      slug: product.slug,
      label: product.label,
      sector: product.sector,
      sectorLabel: product.sectorLabel,
      sortOrder: product.sortOrder,
      reportDate: latest?.obsDate.toISOString().slice(0, 10) ?? null,
      long: latest?.long ?? null,
      longChange:
        latest?.long != null && prev?.long != null ? latest.long - prev.long : null,
      short: latest?.short ?? null,
      shortChange:
        latest?.short != null && prev?.short != null ? latest.short - prev.short : null,
      net: latest?.net ?? null,
      netChange: latest?.net != null && prev?.net != null ? latest.net - prev.net : null,
      netChangePct: pctChange(latest?.net ?? null, prev?.net ?? null),
      netHistory: sparkWeeks,
      yearHigh,
      yearLow,
      relativeToMax,
    });
  }

  const sum = (pick: (r: CotReportRow) => number | null) =>
    rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);

  const totalLong = sum((r) => r.long);
  const totalShort = sum((r) => r.short);
  const totalNet = sum((r) => r.net);
  const totalLongCh = sum((r) => r.longChange);
  const totalShortCh = sum((r) => r.shortChange);
  const totalNetCh = sum((r) => r.netChange);
  const prevTotalNet = totalNet - totalNetCh;

  return {
    reportDate: latestReportDate,
    reportDateLabel: latestReportDate ? fmtReportTuesday(latestReportDate) : null,
    rows,
    totals: {
      long: totalLong,
      longChange: totalLongCh,
      short: totalShort,
      shortChange: totalShortCh,
      net: totalNet,
      netChange: totalNetCh,
      netChangePct: pctChange(totalNet, prevTotalNet !== totalNet ? prevTotalNet : null),
    },
    source: "CFTC Disaggregated Combined (kh3c-gbw2)",
  };
}

/** 从仪器 code 解析 slug（供管理目录等使用） */
export function parseCotSlugFromInstrumentCode(code: string): string | null {
  return cotSlugFromCode(code);
}
