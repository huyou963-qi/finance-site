import { FeatureAccessAdminClient } from "./FeatureAccessAdminClient";

export const metadata = { title: "功能页权限 — 管理员" };

export default function AdminFeatureAccessPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 lg:px-6">
      <FeatureAccessAdminClient />
    </div>
  );
}
