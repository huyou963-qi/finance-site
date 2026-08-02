import { QuantSidebarNav } from "@/components/quant/QuantSidebarNav";

/** 量化平台：左栏分页 + 右侧内容，占满 main 剩余高度 */
export default function QuantLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="-mt-1 -mb-3 flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-44 shrink-0 flex-col border-r border-fs-border bg-fs-elevated/40 lg:w-48">
        <QuantSidebarNav />
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
