import { CpiMomMatrixTable } from "@/components/macro/CpiMomMatrixTable";

export const metadata = {
  title: "CPI 分项环比 — Finova",
  description: "复刻 BLS Table A 的美国 CPI 分项季调环比矩阵，附各分项权重（relative importance）",
};

/** 环比由 DB 内 SA 指数水平实时计算，禁止 build 时静态快照。 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function CpiSubitemsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-fs-text">CPI 分项季调环比（BLS Table A）</h1>
        <p className="text-sm text-fs-muted">
          复刻 BLS「Percent changes in CPI-U」表：分项作行、最近数月的季调环比（MoM %）作列，末列为各分项权重。
          用于一眼定位当月通胀由哪些分项驱动。
        </p>
      </header>
      <CpiMomMatrixTable />
    </div>
  );
}
