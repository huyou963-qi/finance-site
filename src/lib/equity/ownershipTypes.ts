export type ReportingOwner = { cik: string; name: string; isOfficer: boolean; isDirector: boolean; isTenPercentOwner: boolean; title: string | null };
export type OwnershipLineEvidence = {
  version: 2; security: string; ownership: "D" | "I" | null; nature: string | null;
  owners: ReportingOwner[]; footnotes: string[]; footnoteIds: string[];
  documentType: string; originalSubmissionDate: string | null; lineIndex: number;
  remarks?: string;
  formPlan: boolean | null; plan: boolean | null; planAdoptionDate: string | null;
  derivative: boolean; underlyingShares: number | null; underlyingSecurity: string | null;
};
export type OwnershipHolding = { security: string; ownership: "D" | "I" | null; nature: string | null; shares: number; date: string; owners: ReportingOwner[]; footnotes: string[] };
export type TradingPlan = {
  id: string; ownerName: string; ownerCik: string | null; adopted: string | null;
  start: string | null; end: string | null; terminated: string | null;
  maxShares: number | null; security: string | null; account: string | null;
  status: "adopted" | "terminated" | "modified" | "candidate";
  rule10b51: boolean | null; conditions: string; sourceUrl: string; filedAt: string;
  evidence: string; verified: boolean;
};
export type OwnershipDocument = {
  parserVersion?: number;
  version: 2; sourceHash: string; sourceUrl: string; parsedAt: string;
  holdings: OwnershipHolding[]; plans: TradingPlan[]; warnings: string[];
  rawXml?: string;
};
export type ReviewKind = "account" | "transaction" | "baseline" | "float" | "plan" | "role";
export type ReviewPayload =
  | { kind: "account"; lineIds: string[]; account: string; security: string; ownerCik: string }
  | { kind: "transaction"; lineIds: string[]; action: "merge" | "separate" | "replace" | "exclude"; canonicalId: string | null }
  | { kind: "baseline"; account: string; security: string; ownerCik: string; date: string; shares: number; label: string }
  | { kind: "float"; security: string; date: string; shares: number }
  | { kind: "role"; ownerCik: string; role: "Founder / Executive" | "Director" | "VC / PE" | "Strategic investor" | "10% owner" | "Employee" }
  | { kind: "plan"; plan: TradingPlan };
export type OwnershipReviewFact = { id: string; key: string; revision: number; payload: ReviewPayload; sourceUrl: string; quote: string; availableAt: string; createdAt: string };
export type OwnershipCoverage = { since: string; through: string; checkedAt: string; complete: boolean; discovered: number; parsed: number; failed: number; error?: string };
