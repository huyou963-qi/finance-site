import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PricingClient } from "./PricingClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function PricingPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-fs-bg">
      <PricingClient />
    </div>
  );
}
