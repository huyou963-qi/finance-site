import { HomeLanding } from "@/components/home/HomeLanding";
import { loadActiveSiteAnnouncement } from "@/lib/siteAnnouncement";

export const dynamic = "force-dynamic";

export default async function Home() {
  const announcement = await loadActiveSiteAnnouncement();
  return (
    <div className="-mb-3 -mt-1 flex min-h-full w-full flex-1 flex-col bg-white px-4 pb-4 pt-1 sm:px-6 lg:px-6">
      <HomeLanding announcement={announcement} />
    </div>
  );
}
