import { NextRequest, NextResponse } from "next/server";
import {
  calcAssetReturns,
  listAssetMeta,
  type AssetCode,
} from "@/lib/data/assetReturnTool";

const ALL_ASSETS: AssetCode[] = ["10Y", "SPX", "XAU"];

function isDateLiteral(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(req: NextRequest) {
  try {
    const start = req.nextUrl.searchParams.get("start") ?? "";
    const end = req.nextUrl.searchParams.get("end") ?? "";
    const assetsRaw = req.nextUrl.searchParams.get("assets") ?? "";

    const meta = await listAssetMeta();

    if (!start || !end) {
      return NextResponse.json({
        assets: meta,
        defaults: {
          start:
            meta.reduce((acc, m) => (acc === "" || m.firstDate < acc ? m.firstDate : acc), "") ||
            "",
          end:
            meta.reduce((acc, m) => (acc === "" || m.lastDate > acc ? m.lastDate : acc), "") || "",
          pickedAssets: ALL_ASSETS,
        },
        rows: [],
      });
    }

    if (!isDateLiteral(start) || !isDateLiteral(end) || start > end) {
      return NextResponse.json({ error: "日期参数不合法，请使用 YYYY-MM-DD 且 start <= end" }, { status: 400 });
    }

    const assetSet = new Set<AssetCode>();
    for (const item of assetsRaw.split(",").map((v) => v.trim()).filter(Boolean)) {
      if (ALL_ASSETS.includes(item as AssetCode)) {
        assetSet.add(item as AssetCode);
      }
    }
    const pickedAssets = assetSet.size > 0 ? [...assetSet] : ALL_ASSETS;

    const rows = await calcAssetReturns(start, end, pickedAssets);
    return NextResponse.json({
      assets: meta,
      defaults: { start, end, pickedAssets },
      rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
