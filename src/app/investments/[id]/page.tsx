import { InvestmentCaseClient } from "./InvestmentCaseClient";

export default async function InvestmentCasePage({ params }: { params: Promise<{ id: string }> }) {
  return <InvestmentCaseClient caseId={(await params).id} />;
}
