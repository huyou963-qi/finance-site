import type { Metadata } from "next";
import { PricingClient } from "./PricingClient";

export const metadata: Metadata = {
  title: "定价 — Finova Pro",
  description: "Finova 美股研究工作台 Pro 订阅：月付 ¥39、年付 ¥421，新户 7 天试用",
};

export default function PricingPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-fs-bg">
      <PricingClient />
    </div>
  );
}
