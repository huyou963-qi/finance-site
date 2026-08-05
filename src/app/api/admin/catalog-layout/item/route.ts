import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { clearFredCatalogCache, buildBaseCatalogCountries } from "@/lib/data/fredCatalog";
import {
  loadMacroCatalogLayout,
  reconcileCatalogLayoutWithBase,
  saveMacroCatalogLayout,
} from "@/lib/data/catalogLayout";
import { prisma } from "@/lib/prisma";

function storageCatalogKey(key: string): string {
  const variantAt = key.indexOf("::");
  return variantAt >= 0 ? key.slice(0, variantAt) : key;
}

async function findInstrumentId(key: string): Promise<string | null> {
  if (key.startsWith("mds:")) {
    const instrument = await prisma.instrument.findUnique({
      where: { code: key.slice(4) },
      select: { id: true },
    });
    return instrument?.id ?? null;
  }
  if (key.startsWith("fred:")) {
    const fredId = key.slice(5).toUpperCase();
    const instrument = await prisma.instrument.findFirst({
      where: { OR: [{ fredSeriesId: fredId }, { code: `sched_fred_${fredId}` }] },
      select: { id: true },
    });
    return instrument?.id ?? null;
  }
  return null;
}

/** DELETE /api/admin/catalog-layout/item — 删除指标、历史数据及其订阅；仅管理员可用。 */
export async function DELETE(req: NextRequest) {
  try {
    const me = await requireAdmin(req);
    const body = (await req.json()) as { key?: unknown };
    if (typeof body.key !== "string" || !body.key.trim()) {
      return NextResponse.json({ error: "缺少指标键" }, { status: 400 });
    }

    const key = storageCatalogKey(body.key.trim());
    const countries = await buildBaseCatalogCountries();
    const known = countries.some((country) =>
      country.categories.some((category) =>
        [...category.items, ...(category.subgroups ?? []).flatMap((subgroup) => subgroup.items)].some(
          (item) => item.key === key,
        ),
      ),
    );
    if (!known) return NextResponse.json({ error: "指标不存在或已删除" }, { status: 404 });

    const instrumentId = await findInstrumentId(key);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO public.macro_catalog_excluded_key (catalog_key, deleted_by)
        VALUES (${key}, ${me.username})
        ON CONFLICT (catalog_key)
        DO UPDATE SET deleted_at = CURRENT_TIMESTAMP, deleted_by = EXCLUDED.deleted_by
      `;
      if (!instrumentId) return;

      // 显式清理便于审计；Instrument 的级联关系同时覆盖历史观测、行情与订阅。
      await tx.fetchRun.deleteMany({ where: { subscription: { instrumentId } } });
      await tx.releasePackageMember.deleteMany({ where: { instrumentId } });
      await tx.dataSubscription.deleteMany({ where: { instrumentId } });
      await tx.instrument.delete({ where: { id: instrumentId } });
    });

    // 把删除键从持久化布局清理掉，避免下次恢复/导出时留下幽灵引用。
    const layout = await loadMacroCatalogLayout();
    if (layout) {
      const base = await buildBaseCatalogCountries();
      await saveMacroCatalogLayout(reconcileCatalogLayoutWithBase(layout, base), me.username);
    }
    clearFredCatalogCache();
    return NextResponse.json({ message: "指标、历史数据和更新订阅已删除" });
  } catch (error) {
    const { message, status } = adminErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
