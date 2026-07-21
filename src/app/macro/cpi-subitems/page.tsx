import { CpiSubitemsClient } from "./CpiSubitemsClient";

export const metadata = {
  title: "CPI 分项环比 — Finova",
  description: "美国 CPI 分项季调环比矩阵，附各分项权重（relative importance）",
};

/** 环比由 DB 内 SA 指数水平实时计算，禁止 build 时静态快照。 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function CpiSubitemsPage() {
  return <CpiSubitemsClient />;
}
