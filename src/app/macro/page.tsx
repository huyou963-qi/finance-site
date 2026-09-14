import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { MacroSection } from "./MacroSection";

export const dynamic = "force-dynamic";

export default function MacroPage() {
  return (
    <FeatureGate featureId="macro">
      {/* 手机端底部标签栏贴底：抵消 main 的 pb-3 */}
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden max-md:-mb-3">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
              加载中…
            </div>
          }
        >
          <MacroSection />
        </Suspense>
      </div>
    </FeatureGate>
  );
}
