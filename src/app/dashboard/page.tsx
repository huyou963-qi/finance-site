import { MacroAllWeatherDashboard } from "@/components/MacroAllWeatherDashboard";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 lg:px-6">
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-slate-50">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          全天候（All Weather）宏观象限看板：增长/通胀预期差与资产表现联动。
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MacroAllWeatherDashboard />
      </div>
    </div>
  );
}
