import { NextResponse } from "next/server";
import { getFredCatalogCached } from "@/lib/data/fredCatalog";

/**
 * GET /api/data/fmp-catalog
 * 返回统一宏观目录（国家 → 分类 → 指标）及 allowlist 键。
 */
export async function GET() {
  try {
    const { countries, groups, allowlist, labelExtras } = await getFredCatalogCached();
    return NextResponse.json({
      countries,
      groups,
      allowlistKeys: [...allowlist],
      labelExtras: labelExtras ?? {},
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
