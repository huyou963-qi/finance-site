import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { resolveSectorParam } from "@/lib/equity/equitySecurities";
import { getSectorMacroMapping } from "@/lib/equity/sectorMacroMap";
import { fetchUnifiedMacro } from "@/lib/data/unifiedMacro";
import { getFredCatalogCached } from "@/lib/data/fredCatalog";

type Ctx = { params: Promise<{ sector: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { sector: raw } = await ctx.params;
    const sector = resolveSectorParam(raw);
    if (!sector) {
      return NextResponse.json({ error: "未知行业" }, { status: 404 });
    }
    const mapping = getSectorMacroMapping(sector);
    const keys = mapping.keys.map((k) => k.key);
    let series: {
      key: string;
      labelZh: string;
      points: { date: string; value: number }[];
    }[] = [];

    if (keys.length) {
      const { allowlist } = await getFredCatalogCached();
      const payload = await fetchUnifiedMacro(keys, allowlist);
      const categories: string[] = payload.categories ?? [];
      const labelByKey = new Map(mapping.keys.map((k) => [k.key, k.labelZh]));

      series = (payload.series ?? []).map((s) => {
        const key = (s as { key?: string; name?: string }).key ?? "";
        const data = (s as { data?: (number | null)[] }).data ?? [];
        const points: { date: string; value: number }[] = [];
        for (let i = 0; i < categories.length; i++) {
          const v = data[i];
          if (v == null || !Number.isFinite(v)) continue;
          const date = String(categories[i] ?? "").slice(0, 10);
          if (!date) continue;
          points.push({ date, value: v });
        }
        return {
          key,
          labelZh: labelByKey.get(key) ?? (s as { name?: string }).name ?? key,
          points,
        };
      });
    }

    return NextResponse.json({
      sector,
      mapping: {
        keys: mapping.keys,
        noteZh: mapping.noteZh,
        pending: mapping.pending ?? false,
        macroTemplateId: mapping.macroTemplateId,
      },
      series,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
