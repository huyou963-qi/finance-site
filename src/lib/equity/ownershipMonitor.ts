import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { calculateOwnershipMonitor, resolvePlanDisclosures } from "./ownershipEngine";
import { getOwnershipMarketContext } from "./equityPriceStore";
import type { OwnershipCoverage, OwnershipDocument, OwnershipLineEvidence, OwnershipReviewFact } from "./ownershipTypes";

/**
 * 交易日下界。SEC 原样发布申报人填写的日期，其中有把年份首位打错的（`2025-07-25`
 * 写成 `0025-07-25`、`2015` 写成 `0015`）。落库路径刻意保持「一行不合格即整份拒收」
 * 的严格语义，而这类行分散在原本正常的申报里——按行剔除会连带丢掉同一份申报里的
 * 合法行（实测为剔 9 行错的要丢约 13 行对的），所以不在摄入端处理，改由读取端设界。
 *
 * 全库最早的合法交易日是 1994-06-01，1990 年以前只有那 5 行首位打错的，界限干净。
 * 未来方向的同类错误（2028、2031）已被下方的 `transactionDate<=asOf` 挡住。
 */
const TRANSACTION_DATE_FLOOR = new Date("1990-01-01");

/** Single DB-only query model for monitor and catalyst consumers. */
export async function loadOwnershipMonitor(symbol: string, asOf: string, from: string) {
  const [security,rows,filings,reviews,market] = await Promise.all([
    prisma.equitySecurity.findUnique({where:{symbol},select:{metadata:true,name:true}}),
    prisma.insiderTransaction.findMany({where:{symbol,filedAt:{lte:new Date(asOf)},transactionDate:{gte:TRANSACTION_DATE_FLOOR,lte:new Date(asOf)}},orderBy:[{transactionDate:"asc"},{accession:"asc"},{lineIndex:"asc"}],take:50001}),
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
