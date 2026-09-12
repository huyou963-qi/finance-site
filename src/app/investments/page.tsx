import { FeatureGate } from "@/components/access/FeatureGate";
import { InvestmentsClient } from "./InvestmentsClient";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const { symbol } = await searchParams;
  return (
    <FeatureGate featureId="investments">
      <InvestmentsClient initialSymbol={symbol?.trim().toUpperCase() ?? ""} />
    </FeatureGate>
  );
}
