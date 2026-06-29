import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import {
  collectItemLabels,
  deleteMacroCatalogLayout,
  exportCatalogLayout,
  loadMacroCatalogLayout,
  sanitizeCatalogLayoutDocument,
  saveMacroCatalogLayout,
  type CatalogLayoutApiPayload,
  type CatalogLayoutDocument,
} from "@/lib/data/catalogLayout";
import { buildBaseCatalogCountries, clearFredCatalogCache } from "@/lib/data/fredCatalog";

async function buildPayload(): Promise<CatalogLayoutApiPayload> {
  const baseCountries = await buildBaseCatalogCountries();
  const defaultLayout = exportCatalogLayout(baseCountries);
  const custom = await loadMacroCatalogLayout();
  const itemLabels = collectItemLabels(baseCountries);

  const row = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });

  return {
    layout: custom ?? defaultLayout,
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

    await saveMacroCatalogLayout(sanitized, me.username);
    clearFredCatalogCache();
    const payload = await buildPayload();
    return NextResponse.json({ ...payload, message: "目录树已保存" });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
