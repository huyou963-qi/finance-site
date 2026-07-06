import { redirect } from "next/navigation";

/** 预览路由并入主时间线页 */
export default function TimelinePreviewRedirectPage() {
  redirect("/events");
}
