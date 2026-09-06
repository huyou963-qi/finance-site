import { Suspense } from "react";
import { OwnershipClient } from "./OwnershipClient";

export const metadata = { title: "持股与供给监控 | Finova" };
export default function OwnershipPage() {
  return <Suspense fallback={<p className="p-6">加载持股监控…</p>}><OwnershipClient /></Suspense>;
}
