import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import {
  collectItemLabels,
  deleteMacroCatalogLayout,
  exportCatalogLayout,
  loadMacroCatalogLayout,
  reconcileCatalogLayoutWithBase,
  sanitizeCatalogLayoutDocument,
  saveMacroCatalogLayout,
  type CatalogLayoutApiPayload,
  type CatalogLayoutDocument,
} from "@/lib/data/catalogLayout";
import {
  buildBaseCatalogCountries,
  clearFredCatalogCache,
  getFredCatalogCached,
} from "@/lib/data/fredCatalog";
import { presentUsCpiAsYoy } from "@/lib/data/catalogTree";

async function buildPayload(): Promise<CatalogLayoutApiPayload> {
  const baseCountries = await buildBaseCatalogCountries();
  // 编辑器必须以 /macro 实际渲染的有效目录为准，不能只回显存储的原始 JSON；
  // 否则新入库、尚未写进布局的指标只会在宏观页的「未分配」出现。
  const effectiveCatalog = await getFredCatalogCached();
  const defaultLayout = exportCatalogLayout(presentUsCpiAsYoy(baseCountries));
  const custom = await loadMacroCatalogLayout();
  const itemLabels = collectItemLabels(effectiveCatalog.countries);

  const row = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });

  return {
    layout: exportCatalogLayout(effectiveCatalog.countries),
    defaultLayout,
    isCustom: custom !== null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    updatedBy: row?.updatedBy ?? null,
    itemLabels,
  };
}

/** GET /api/admin/catalog-layout — 当前布局 + 默认布局 + 指标标签 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const payload = await buildPayload();
    return NextResponse.json(payload);
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/** PUT /api/admin/catalog-layout — 保存或恢复默认布局 */
export async function PUT(req: NextRequest) {
  try {
    const me = await requireAdmin(req);
    const body = (await req.json()) as { layout?: unknown; reset?: boolean };

    if (body.reset) {
      await deleteMacroCatalogLayout();
      clearFredCatalogCache();
      const payload = await buildPayload();
      return NextResponse.json({ ...payload, message: "已恢复默认目录树" });
    }

    const sanitized = sanitizeCatalogLayoutDocument(body.layout);
    if (!sanitized) {
      return NextResponse.json({ error: "布局格式无效" }, { status: 400 });
    }

    const baseCountries = await buildBaseCatalogCountries();
    // 将展示变体键归一为原始键，并把漏掉的当前指标自动落到「未分配」。
    // 之后宏观页与编辑器均从同一份完整布局导出。
    await saveMacroCatalogLayout(
      reconcileCatalogLayoutWithBase(sanitized, baseCountries),
      me.username,
    );
    clearFredCatalogCache();
    const payload = await buildPayload();
    return NextResponse.json({ ...payload, message: "目录树已保存" });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
