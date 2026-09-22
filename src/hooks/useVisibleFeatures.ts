"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FEATURE_CATALOG } from "@/lib/access/featureCatalog";

/** 首屏乐观值：按目录默认「已上线」的集合，避免导航在取回策略前空白闪烁。 */
const OPTIMISTIC_LISTED = new Set(
  FEATURE_CATALOG.filter((f) => f.defaults.status === "released").map((f) => f.id),
);
const OPTIMISTIC_LOCKED = new Set(
  FEATURE_CATALOG.filter((f) => f.defaults.status === "released" && f.defaults.proOnly).map(
    (f) => f.id,
  ),
);

export type VisibleFeatures = {
  /** 是否已取回真实策略（false 时用的是默认值） */
  loaded: boolean;
  /** 导航是否展示该入口 */
  can: (featureId: string) => boolean;
  /** 展示但当前身份需要 Pro（导航上加 Pro 标记） */
  locked: (featureId: string) => boolean;
};

/**
 * 拉取当前访问者的导航入口（`/api/access/features`）。
 * 导航类组件用它过滤入口；真正的拦截在服务端 `FeatureGate` / `checkFeatureAccess`。
 */
export function useVisibleFeatures(): VisibleFeatures {
  const pathname = usePathname();
  const [state, setState] = useState<{
    listed: Set<string>;
    locked: Set<string>;
    loaded: boolean;
  }>({ listed: OPTIMISTIC_LISTED, locked: OPTIMISTIC_LOCKED, loaded: false });

  useEffect(() => {
    let alive = true;
    fetch("/api/access/features", { cache: "no-store" })
      .then(async (r) =>
        r.ok ? ((await r.json()) as { features?: string[]; locked?: string[] }) : null,
      )
      .then((j) => {
        if (alive && j?.features) {
          setState({
            listed: new Set(j.features),
            locked: new Set(j.locked ?? []),
            loaded: true,
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  return {
    loaded: state.loaded,
    can: (featureId: string) => state.listed.has(featureId),
    locked: (featureId: string) => state.locked.has(featureId),
  };
}
