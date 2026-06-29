import { Suspense } from "react";
import { FuturesPositionsClient } from "./FuturesPositionsClient";

export default function FuturesPositionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          加载中…
        </div>
      }
    >
      <FuturesPositionsClient />
    </Suspense>
  );
}
