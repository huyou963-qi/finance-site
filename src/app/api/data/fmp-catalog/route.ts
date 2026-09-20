import { NextRequest, NextResponse } from "next/server";
import { getFredCatalogCached } from "@/lib/data/fredCatalog";

/**
 * GET /api/data/fmp-catalog
 * 返回统一宏观目录（国家 → 分类 → 指标）及 allowlist 键。
 *
 * 响应体较大（5000+ 指标），配合 ETag 让重复访问走 304：目录内容只在
 * `builtAt`（12h 缓存过期重建）或布局 `layoutUpdatedAt` 变化时才会变，
 * 二者即可唯一标识一份响应，无需哈希整个 body。
 */
export async function GET(req: NextRequest) {
  try {
    const { countries, allowlist, labelExtras, builtAt, layoutUpdatedAt } =
      await getFredCatalogCached();
    const etag = `W/"cat-${builtAt}-${layoutUpdatedAt ?? 0}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, no-cache" },
      });
    }
    return NextResponse.json(
      {
        countries,
        allowlistKeys: [...allowlist],
        labelExtras: labelExtras ?? {},
      },
      { headers: { ETag: etag, "Cache-Control": "private, no-cache" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
