import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserByRequest } from "@/lib/auth";
import { getViewerFromRequest } from "@/lib/access/featureAccess";
import { defaultFeatureAccessPolicy, normalizeFeatureAccessPolicy, resolveFeatureAccess } from "@/lib/access/featureCatalog";
import { getChart, renderChartData } from "@/lib/market/charts";
import type { StoredChartReference } from "@/lib/market/attach";
import { chartIdSchema, day, MarketError } from "@/lib/market/schema";
import { parseMacroDateLabelToUtcMs } from "@/lib/macroPeriodLabel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    // Read the existing policy without the navigation helper's fail-open fallback/cache.
    // Permission-store failures must not expose chart data.
    const [viewer, policyRow] = await Promise.all([getViewerFromRequest(req), prisma.featureAccessPolicy.findUnique({ where: { id: "default" } })]);
    const policy = policyRow ? normalizeFeatureAccessPolicy(policyRow.policy) : defaultFeatureAccessPolicy();
    const gate = resolveFeatureAccess(policy, "macro", viewer);
    if (gate !== "allowed") return NextResponse.json({ error: "图表需要宏观数据访问权限", state: gate }, { status: 403, headers });
    const { id } = await context.params;
    let ref: StoredChartReference;
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      const articleGate = resolveFeatureAccess(policy, "articles", viewer);
      if (articleGate !== "allowed") return NextResponse.json({ error: "图表需要文章访问权限", state: articleGate }, { status: 403, headers });
      const asset = await prisma.articleAsset.findUnique({ where: { id }, select: { data: true, sourceKind: true, article: { select: { status: true, authorId: true, bodyMarkdown: true } } } });
      if (!asset || asset.sourceKind !== "chart-reference" || !asset.article.bodyMarkdown.includes(JSON.stringify({ referenceId: id }))) return NextResponse.json({ error: "图表引用不存在" }, { status: 404, headers });
      if (asset.article.status !== "published") {
        const user = await getUserByRequest(req);
        if (user?.role !== "admin" || user.id !== asset.article.authorId) return NextResponse.json({ error: "请登录文章作者的管理员账号预览" }, { status: user ? 403 : 401, headers });
      }
      ref = JSON.parse(Buffer.from(asset.data).toString("utf8")) as StoredChartReference;
      // A hidden/deleted system chart cannot be resurrected via an old reference.
      await getChart({ chartId: ref.chartId });
    } else {
      const chartId = chartIdSchema.parse(id), definition = await getChart({ chartId });
      ref = { version: 1, chartId, renderMode: "live", createdAt: new Date().toISOString(), dataCutoff: null, definition,
        displayStartDate: new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10), displayEndDate: new Date().toISOString().slice(0, 10),
        displayOptions: { height: 420, showSource: true, showLastUpdated: true, allowTimeRangeChange: true } };
    }
    const start = req.nextUrl.searchParams.get("startDate"), end = req.nextUrl.searchParams.get("endDate");
    if ((start || end) && !ref.displayOptions.allowTimeRangeChange) throw new MarketError("INVALID_INPUT", "该引用已锁定显示区间");
    const startDate = start ? day.parse(start) : ref.displayStartDate, endDate = end ? day.parse(end) : ref.displayEndDate;
    if (startDate > endDate) throw new MarketError("INVALID_INPUT", "时间范围无效");
    let data;
    if (ref.renderMode === "snapshot") {
      if (!ref.snapshot) throw new MarketError("DATA_UNAVAILABLE", "历史快照不存在");
      const indices = ref.snapshot.categories.map((d, i) => ({ time: parseMacroDateLabelToUtcMs(d), i })).filter(({ time }) => time != null && time >= Date.parse(startDate) && time <= Date.parse(endDate)).map(x => x.i);
      data = { ...ref.snapshot, categories: indices.map(i => ref.snapshot!.categories[i]!), series: ref.snapshot.series.map(s => ({ ...s, data: indices.map(i => s.data[i] ?? null) })) };
    } else {
      data = await renderChartData(await getChart({ chartId: ref.chartId }), startDate, endDate);
    }
    return NextResponse.json({ data, renderMode: ref.renderMode, dataCutoff: ref.dataCutoff, capturedAt: ref.createdAt, displayOptions: ref.displayOptions }, { headers });
  } catch (error) {
    const known = error instanceof MarketError;
    if (!known) console.error("[article-chart]", error);
    return NextResponse.json({ error: known ? error.message : "图表暂不可用，请稍后重试", code: known ? error.code : "DATA_UNAVAILABLE" }, { status: known && error.code === "NOT_FOUND" ? 404 : 400, headers });
  }
}
