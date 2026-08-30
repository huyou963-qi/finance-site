import { InvestmentsClient } from "./InvestmentsClient";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  const { symbol } = await searchParams;
  return <InvestmentsClient initialSymbol={symbol?.trim().toUpperCase() ?? ""} />;
}
