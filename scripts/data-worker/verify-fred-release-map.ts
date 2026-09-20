/**
 * 核对 `fredReleaseCalendar/catalog.ts` 的发布包 → FRED release 映射。
 *
 * 对库里每个发布包的全部 FRED 成员调用 `/fred/series/release`，与注册表比对：
 * 多出来的 / 少掉的 / 整包新增或消失，都会列出来。新增发布包或调整成员后跑一次。
 *
 * npm run data:verify-fred-release-map
 * npm run data:verify-fred-release-map -- --print   # 顺带打印可直接粘贴的注册表片段
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { getFredRateLimiter } from "../../src/lib/data/scheduler/fredRateLimiter";
import {
  FRED_RELEASE_IDS_BY_PACKAGE,
  FRED_RELEASE_NAMES,
} from "../../src/lib/data/scheduler/fredReleaseCalendar/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

type SeriesRelease = { id: number; name: string };

async function seriesRelease(
  seriesId: string,
  apiKey: string,
  cache: Map<string, SeriesRelease | null>,
): Promise<SeriesRelease | null> {
  const hit = cache.get(seriesId);
  if (hit !== undefined) return hit;
  const url =
    `https://api.stlouisfed.org/fred/series/release?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}&file_type=json`;
  const res = await getFredRateLimiter().fetch(url);
  if (!res.ok) {
    cache.set(seriesId, null);
    return null;
  }
  const json = (await res.json()) as { releases?: Array<{ id?: number; name?: string }> };
  const first = json.releases?.[0];
  const value =
    typeof first?.id === "number" ? { id: first.id, name: String(first.name ?? "") } : null;
  cache.set(seriesId, value);
  return value;
}

async function main() {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 FRED_API_KEY");
  const print = process.argv.includes("--print");

  const rows = await prisma.dataSubscription.findMany({
    where: { sourceId: "fred", releasePackageId: { not: null } },
    select: {
      releasePackageId: true,
      instrument: { select: { code: true, fredSeriesId: true } },
    },
  });

  const byPackage = new Map<string, string[]>();
  for (const row of rows) {
    const pkg = row.releasePackageId;
    const sid = row.instrument.fredSeriesId?.trim();
    if (!pkg || !sid) continue;
    const list = byPackage.get(pkg) ?? [];
    list.push(sid);
    byPackage.set(pkg, list);
  }

  const cache = new Map<string, SeriesRelease | null>();
  const derived = new Map<string, Set<number>>();
  const lookupFailures: string[] = [];
  const names = new Map<number, string>();

  for (const [pkg, seriesIds] of byPackage) {
    const ids = new Set<number>();
    for (const sid of seriesIds) {
      const rel = await seriesRelease(sid, apiKey, cache);
      if (!rel) {
        lookupFailures.push(`${pkg} / ${sid}`);
        continue;
      }
      ids.add(rel.id);
      names.set(rel.id, rel.name);
    }
    if (ids.size > 0) derived.set(pkg, ids);
  }

  let problems = 0;
  const allPackages = new Set([...derived.keys(), ...Object.keys(FRED_RELEASE_IDS_BY_PACKAGE)]);
  for (const pkg of [...allPackages].sort()) {
    const want = derived.get(pkg);
    const have = FRED_RELEASE_IDS_BY_PACKAGE[pkg];
    if (!want) {
      console.log(`  ✗ ${pkg}：注册表里有，但库中已无 FRED 成员（应移除）`);
      problems += 1;
      continue;
    }
    if (!have) {
      console.log(
        `  ✗ ${pkg}：库中有 FRED 成员但注册表缺失 → [${[...want].sort((a, b) => a - b).join(", ")}]`,
      );
      problems += 1;
      continue;
    }
    const haveSet = new Set(have);
    const missing = [...want].filter((id) => !haveSet.has(id));
    const extra = [...haveSet].filter((id) => !want.has(id));
    if (missing.length || extra.length) {
      console.log(
        `  ✗ ${pkg}：缺 [${missing.join(", ")}]，多 [${extra.join(", ")}]`,
      );
      problems += 1;
    }
  }

  for (const id of names.keys()) {
    if (!FRED_RELEASE_NAMES[id]) {
      console.log(`  ✗ release ${id} (${names.get(id)}) 缺少 FRED_RELEASE_NAMES 条目`);
      problems += 1;
    }
  }

  if (lookupFailures.length) {
    console.log(
      `  · ${lookupFailures.length} 条序列查不到 release（多半是已下架的 FRED ID）：${lookupFailures
        .slice(0, 10)
        .join("; ")}`,
    );
  }

  if (print) {
    console.log("\n--- 可粘贴的注册表片段 ---");
    for (const pkg of [...derived.keys()].sort()) {
      const ids = [...derived.get(pkg)!].sort((a, b) => a - b);
      console.log(`  /** ${ids.map((i) => names.get(i)).join(" + ")} */`);
      console.log(`  "${pkg}": [${ids.join(", ")}],`);
    }
  }

  console.log(
    `\n[data:verify-fred-release-map] 发布包 ${derived.size} 个，release ${names.size} 个，问题 ${problems} 处`,
  );
  if (problems > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
