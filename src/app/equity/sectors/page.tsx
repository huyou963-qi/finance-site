import { Suspense } from "react";
import { EquitySectorsClient } from "./EquitySectorsClient";

export default function EquitySectorsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
          加载中…
        </div>
      }
    >
      <EquitySectorsClient />
    </Suspense>
  );
}
