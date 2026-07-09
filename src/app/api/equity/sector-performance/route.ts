import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { GICS_SECTOR_DEFS, type GicsSector, normalizeGicsSector } from "@/lib/equity/gicsCatalog";
import { fetchFmpSectorPerformance } from "@/lib/equity/fmpEquity";

type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;
    const sectorRaw = sp.get("sector");

    const targets: { sector: GicsSector; fmpName: string }[] = sectorRaw
      ? (() => {
          const s = normalizeGicsSector(sectorRaw);
          if (!s) throw new Error("未知行业");
          const def = GICS_SECTOR_DEFS.find((d) => d.sector === s)!;
          return [{ sector: s, fmpName: def.fmpSectorName }];
        })()
      : GICS_SECTOR_DEFS.map((d) => ({ sector: d.sector, fmpName: d.fmpSectorName }));

    const cacheKey = `${sectorRaw ?? "all"}|${from ?? ""}|${to ?? ""}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json(hit.body);
    }

    const series: Record<string, { date: string; averageChange: number }[]> = {};
    for (const t of targets) {
      try {
        const pts = await fetchFmpSectorPerformance({
          sector: t.fmpName,
          from,
          to,
        });
        series[t.sector] = pts.map((p) => ({
          date: p.date,
          averageChange: p.averageChange,
        }));
      } catch {
        series[t.sector] = [];
      }
    }

    const body = { from: from ?? null, to: to ?? null, series };
    cache.set(cacheKey, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
