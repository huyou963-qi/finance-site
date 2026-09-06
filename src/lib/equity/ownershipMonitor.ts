import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { calculateOwnershipMonitor, resolvePlanDisclosures } from "./ownershipEngine";
import { getOwnershipMarketContext } from "./equityPriceStore";
import type { OwnershipCoverage, OwnershipDocument, OwnershipLineEvidence, OwnershipReviewFact } from "./ownershipTypes";

/** Single DB-only query model for monitor and catalyst consumers. */
export async function loadOwnershipMonitor(symbol: string, asOf: string, from: string) {
  const [security,rows,filings,reviews,market] = await Promise.all([
    prisma.equitySecurity.findUnique({where:{symbol},select:{metadata:true,name:true}}),
    prisma.insiderTransaction.findMany({where:{symbol,filedAt:{lte:new Date(asOf)},transactionDate:{lte:new Date(asOf)}},orderBy:[{transactionDate:"asc"},{accession:"asc"},{lineIndex:"asc"}],take:50001}),
    prisma.$queryRaw<{filedAt:Date;ownershipData:Prisma.JsonValue}[]>`SELECT filed_at AS "filedAt", ownership_data - 'rawXml' - 'derivativeRows' AS "ownershipData" FROM mds.sec_filing WHERE symbol=${symbol} AND filed_at<=${new Date(asOf)} AND ownership_parsed_at IS NOT NULL ORDER BY filed_at, accession LIMIT 20001`,
    prisma.ownershipReview.findMany({where:{symbol,availableAt:{lte:new Date(asOf)}},orderBy:[{createdAt:"asc"},{id:"asc"}],take:10001}),
    getOwnershipMarketContext(symbol,asOf),
  ]);
  if (!security) return null;
  const documents = filings.map(f=>({date:f.filedAt.toISOString().slice(0,10),doc:f.ownershipData as unknown as OwnershipDocument})).filter(f=>f.doc?.version===2);
  const metadata = security.metadata as {ownershipCoverage?:OwnershipCoverage}|null;
  return {symbol,name:security.name,...calculateOwnershipMonitor({asOf,from,
    rows:rows.slice(0,50000).map(r=>({...r,id:`${r.accession}:${r.lineIndex}`,transactionDate:r.transactionDate.toISOString().slice(0,10),filedAt:r.filedAt.toISOString().slice(0,10),evidence:r.evidence as OwnershipLineEvidence|null})),
    reviews:reviews.map(r=>({...r,availableAt:r.availableAt.toISOString().slice(0,10),createdAt:r.createdAt.toISOString()})) as unknown as OwnershipReviewFact[],
    holdings:documents.flatMap(({doc,date})=>doc.holdings.map(h=>({...h,filedAt:date,sourceUrl:doc.sourceUrl}))),
    plans:documents.flatMap(({doc})=>doc.plans),splits:market.splits,coverage:metadata?.ownershipCoverage??null,market,
    truncated:rows.length>50000||filings.length>20000||reviews.length>10000,
  })};
}

/** Catalyst projection reads the SAME plan facts and revision resolver, without loading price/transaction history. */
export async function loadOwnershipPlanDisclosures(symbol:string,asOf:string) {
  const [filings,reviews]=await Promise.all([
    prisma.secFiling.findMany({where:{symbol,form:{in:["10-Q","10-Q/A","10-K","10-K/A"]},filedAt:{lte:new Date(asOf)},ownershipParsedAt:{not:null}},select:{ownershipData:true}}),
    prisma.ownershipReview.findMany({where:{symbol,kind:"plan",availableAt:{lte:new Date(asOf)}}}),
  ]);
  const plans=filings.flatMap(f=>(f.ownershipData as unknown as OwnershipDocument)?.plans??[]);
  return resolvePlanDisclosures(plans,reviews.map(r=>({...r,availableAt:r.availableAt.toISOString().slice(0,10),createdAt:r.createdAt.toISOString()})) as unknown as OwnershipReviewFact[],asOf);
}
