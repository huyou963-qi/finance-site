import { redirect } from "next/navigation";

/** 首页默认进入宏观 */
export default function Home() {
  redirect("/macro");
}
