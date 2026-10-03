import { ForecastSidebarNav } from "@/components/forecast/ForecastSidebarNav";

/** 指标预测：桌面端左栏分页，手机端内容上方分页 */
export default function ForecastLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="-mt-1 -mb-3 flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-44 shrink-0 flex-col border-r border-fs-border bg-fs-elevated/40 max-md:hidden lg:w-48">
        <ForecastSidebarNav />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 md:hidden">
          <ForecastSidebarNav mobile />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
