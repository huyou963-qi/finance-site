"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FEATURE_CATALOG } from "@/lib/access/featureCatalog";

/** 首屏乐观值：按目录默认对普通用户可见的集合，避免导航在取回策略前空白闪烁。 */
const OPTIMISTIC = new Set(
  FEATURE_CATALOG.filter((f) => f.defaults.standard).map((f) => f.id),
);

export type VisibleFeatures = {
  ids: Set<string>;
  /** 是否已取回真实策略（false 时用的是默认值） */
  loaded: boolean;
  can: (featureId: string) => boolean;
};

/**
 * 拉取当前访问者可见的功能页 id（`/api/access/features`）。
 * 导航类组件用它过滤入口；真正的拦截在服务端 `FeatureGate` / `checkFeatureAccess`。
 */
export function useVisibleFeatures(): VisibleFeatures {
  const pathname = usePathname();
  const [state, setState] = useState<{ ids: Set<string>; loaded: boolean }>({
    ids: OPTIMISTIC,
    loaded: false,
  });

  useEffect(() => {
    let alive = true;
    fetch("/api/access/features", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { features?: string[] }) : null))
      .then((j) => {
        if (alive && j?.features) setState({ ids: new Set(j.features), loaded: true });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  return {
    ids: state.ids,
    loaded: state.loaded,
    can: (featureId: string) => state.ids.has(featureId),
  };
}
