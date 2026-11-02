import type { Metadata } from "next";
import { MembershipWorkspace } from "./MembershipWorkspace";

export const metadata: Metadata = {
  title: "会员与订单管理 — Admin",
};

export default function AdminOrdersPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <MembershipWorkspace />
    </div>
  );
}
