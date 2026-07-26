import type { Metadata } from "next";
import { AdminOrdersClient } from "./AdminOrdersClient";

export const metadata: Metadata = {
  title: "订单确认 — Admin",
};

export default function AdminOrdersPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AdminOrdersClient />
    </div>
  );
}
