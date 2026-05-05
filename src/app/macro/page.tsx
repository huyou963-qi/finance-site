import { Suspense } from "react";
import { MacroSection } from "./MacroSection";

export default function MacroPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            加载中…
          </div>
        }
      >
        <MacroSection />
      </Suspense>
    </div>
  );
}
