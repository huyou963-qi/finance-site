import { SiteAnnouncementAdminClient } from "./SiteAnnouncementAdminClient";

export const metadata = { title: "首页公告 — 管理员" };

export default function AdminSiteAnnouncementPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 lg:px-6">
      <SiteAnnouncementAdminClient />
    </div>
  );
}
