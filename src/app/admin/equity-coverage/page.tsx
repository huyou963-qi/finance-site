import { EquityCoverageAdminClient } from "./EquityCoverageAdminClient";

export const metadata = { title: "美股覆盖率 — 管理员" };

export default function AdminEquityCoveragePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 lg:px-6">
      <EquityCoverageAdminClient />
    </div>
  );
}
