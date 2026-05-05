import { NextResponse } from "next/server";
import { getFredCatalogCached } from "@/lib/data/fredCatalog";

/**
 * GET /api/data/fmp-catalog
 * 返回分组后的 FRED 指标目录及全量 fred: 键，供侧栏与序列序列化校验。
 */
export async function GET() {
  try {
    const { groups, allowlist } = await getFredCatalogCached();
    return NextResponse.json({
      groups,
      allowlistKeys: [...allowlist],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
