import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { fetchTreasuryRows, parseTreasuryAmount } from "../treasuryFiscalData/client";
import type { FetchIncrementalResult } from "../types";

export type TreasuryRow = Record<string, string | null>;
const BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/";
export const MSPD_DETAIL_ENDPOINT = "v1/debt/mspd/mspd_table_3_market";
export const AUCTIONS_ENDPOINT = "v1/accounting/od/treasury_securities_auctions_v2";
const AUCTION_FIELDS = ["record_date", "cusip", "security_type", "security_desc", "comp_auction_close_date", "issue_date", "maturity_date", "announcemt_date", "floating_rate", "inflation_protected", "offering_amt", "grand_total_par_awarded", "soma_noncomp_par_awarded", "total_par_inside_awarded", "total_par_outside_awarded", "xml_filenm_comp_results", "reopening"];
const LEGACY_AUCTIONS_ENDPOINT="v1/accounting/od/auctions_query";
const LEGACY_AUCTION_FIELDS=["record_date","cusip","security_type","security_term","auction_date","issue_date","maturity_date","announcemt_date","floating_rate","inflation_index_security","offering_amt","total_accepted","soma_accepted","xml_filenm_comp_results","reopening"];

function isoDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value) throw new Error(`财政原始记录日期异常：${value}`);
  return value;
}
function snapshot(dataset: string, recordKey: string, date: string, payload: TreasuryRow[], endpoint: string) {
  const ordered = payload.map(r => Object.fromEntries(Object.entries(r).sort(([a],[b]) => a.localeCompare(b))))
    .sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { dataset, recordKey, asOfDate: new Date(`${isoDate(date)}T00:00:00Z`),
    contentHash: createHash("sha256").update(JSON.stringify(ordered)).digest("hex"), payload: ordered,
    sourceUrl: `${BASE}${endpoint}` };
}

export async function fetchFiscalRawIncremental(key: string, observationStart: string): Promise<FetchIncrementalResult> {
  const mspd = key === "raw:mspd";
  if (!mspd && key !== "raw:auctions") throw new Error(`未知财政明细订阅：${key}`);
  const floor = mspd ? "2001-01-01" : "1979-01-01";
  const start = observationStart > floor ? observationStart : floor;
  const endpoint = mspd ? MSPD_DETAIL_ENDPOINT : AUCTIONS_ENDPOINT;
  let rows = await fetchTreasuryRows(endpoint, { apiFilters: `record_date:gte:${start}`,
    pageSize: 10000, maxPages: 100, fields: mspd ? undefined : AUCTION_FIELDS });
  const legacyKeys=new Set<string>();
  if(!mspd){
    // 新版仅提供近期记录，旧版仍保存长期历史。保留各自原始字段，重叠业务键以新版为准。
    const legacy=await fetchTreasuryRows(LEGACY_AUCTIONS_ENDPOINT,{apiFilters:`record_date:gte:${start}`,pageSize:10000,maxPages:100,fields:LEGACY_AUCTION_FIELDS});
    const currentKeys=new Set(rows.map(r=>`${r.cusip}|${r.issue_date}`));
    for(const row of legacy){const key=`${row.cusip}|${row.issue_date}`;if(!currentKeys.has(key)){rows.push(row);legacyKeys.add(key);}}
  }
  if (!rows.length) throw new Error(`财政原始明细为空：${key}`);
  const grouped = new Map<string, TreasuryRow[]>();
  for (const row of rows) {
    const date = isoDate(row.record_date);
    const recordKey = mspd ? date : `${row.cusip}|${isoDate(row.issue_date)}`;
    if (!mspd && !/^[A-Z0-9]{9}$/.test(row.cusip ?? "")) throw new Error("国债拍卖CUSIP缺失");
    const list = grouped.get(recordKey) ?? []; list.push(row); grouped.set(recordKey,list);
  }
  const treasurySnapshots = [...grouped].map(([recordKey, payload]) => {
    const date = payload[0]!.record_date!;
    if (mspd) {
      if(payload.length < 10) throw new Error(`MSPD原始报告不完整：${date}`);
    } else if (payload.length !== 1) throw new Error(`国债拍卖业务键重复：${recordKey}`);
    return snapshot(mspd ? "mspd" : "auctions", recordKey, date, payload, legacyKeys.has(recordKey) ? LEGACY_AUCTIONS_ENDPOINT : endpoint);
  });
  // 拍卖记录可含尚未发行的已公告债券；不把未来issue_date当作已实现观测。
  const today = new Date().toISOString().slice(0,10);
  const dates = rows.map(r => r.record_date!).filter(d => d <= today).sort();
  return { points: [], treasurySnapshots, sourceLatestObsDate: dates.length ? new Date(`${dates.at(-1)}T00:00:00Z`) : null,
    skippedInvalid: 0, sourceMetadata: { rawDataset: mspd ? "mspd" : "auctions", nativeRows: rows.length,
      snapshotCount: treasurySnapshots.length, vintageMeaning: "first_system_capture_not_historical_first_release" } };
}

export async function persistTreasurySnapshots(prisma: PrismaClient, snapshots: NonNullable<FetchIncrementalResult["treasurySnapshots"]>): Promise<number> {
  let inserted = 0;
  for (let index=0; index<snapshots.length; index+=100) {
    const result = await prisma.treasurySourceSnapshot.createMany({ data: snapshots.slice(index,index+100), skipDuplicates: true });
    inserted += result.count;
  }
  return inserted;
}

export type MspdSecurity = { cusip: string; type: "bills" | "notes" | "bonds" | "tips" | "frn"; maturityDate: string; outstandingMillions: number };
const SECURITY_CLASSES: Record<string,MspdSecurity["type"]> = { "Bills Maturity Value": "bills", Notes: "notes", Bonds: "bonds", "Inflation-Protected Securities": "tips", "Inflation-Indexed Notes": "tips", "Inflation-Indexed Bonds": "tips", "Floating Rate Notes": "frn" };
/** 同一CUSIP续发行分行：仅合并源表非空outstanding_amt；不把issued_amt再加一遍。 */
export function parseMspdSecurities(rows: TreasuryRow[], asOf: string): MspdSecurity[] {
  isoDate(asOf);
  const byCusip = new Map<string, TreasuryRow[]>();
  for (const row of rows) {
    if (row.record_date !== asOf) throw new Error("MSPD快照混入其他月份");
    if (row.security_type_desc !== "Marketable" || !SECURITY_CLASSES[row.security_class1_desc ?? ""]) continue;
    const cusip = row.security_class2_desc ?? "";
    if (!/^[A-Z0-9]{9}$/.test(cusip)) continue; // 官方汇总/已到期待兑付汇总不当作逐券。
    const maturity = isoDate(row.maturity_date);
    if (maturity <= asOf) continue;
    const list = byCusip.get(cusip) ?? []; list.push(row); byCusip.set(cusip,list);
  }
  const result: MspdSecurity[] = [];
  for (const [cusip, tranches] of byCusip) {
    const totals = tranches.filter(row => parseTreasuryAmount(row.outstanding_amt) != null);
    if (!totals.length) throw new Error(`MSPD ${asOf} ${cusip}余额合计行缺失`);
    if(new Set(totals.map(r=>r.issue_date??"missing")).size!==totals.length)throw new Error(`MSPD ${asOf} ${cusip}余额合计行重复`);
    const row = totals[0]!;
    const amount = totals.reduce((sum,r)=>sum+parseTreasuryAmount(r.outstanding_amt)!,0);
    if (amount < 0 || tranches.some(r => r.maturity_date !== row.maturity_date || r.security_class1_desc !== row.security_class1_desc)) throw new Error(`MSPD ${cusip}口径冲突`);
    result.push({ cusip, type: SECURITY_CLASSES[row.security_class1_desc!]!, maturityDate: row.maturity_date!, outstandingMillions: amount });
  }
  if (!result.length) throw new Error(`MSPD ${asOf}没有可验证的未到期逐券余额`);
  return result;
}

/** 仅用于读取/图表层；未来TIPS本金按快照已知金额，不预测未来通胀，也不假定未来发行。 */
export function maturitySchedule(rows: TreasuryRow[], asOf: string, months = 12) {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error("期限桶数异常");
  const securities = parseMspdSecurities(rows, asOf);
  const anchor = new Date(`${asOf}T00:00:00Z`);
  const buckets = Array.from({length: months},(_,i) => ({ month: new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+i+1,1)).toISOString().slice(0,7), amountMillions: 0 }));
  for (const security of securities) {
    const bucket = buckets.find(b => b.month === security.maturityDate.slice(0,7));
    if (bucket) bucket.amountMillions += security.outstandingMillions;
  }
  const totalUnmaturedMillions = securities.reduce((s,r) => s+r.outstandingMillions,0);
  const dueMillions = buckets.reduce((s,r) => s+r.amountMillions,0);
  return { asOf, buckets, dueMillions, totalUnmaturedMillions, dueSharePercent: totalUnmaturedMillions ? dueMillions/totalUnmaturedMillions*100 : null };
}

export function auctionSecurityType(row: TreasuryRow): MspdSecurity["type"] {
  if (row.inflation_protected === "Yes" || row.inflation_index_security === "Yes") return "tips";
  if (row.floating_rate === "Yes") return "frn";
  const type = ({ Bill: "bills", Note: "notes", Bond: "bonds" } as const)[row.security_type as "Bill"|"Note"|"Bond"];
  if (!type) throw new Error(`未知拍卖券种：${row.security_type}`);
  return type;
}

export function auctionIssuanceByMonth(rows: TreasuryRow[], cutoff: string) {
  isoDate(cutoff);
  const seen = new Set<string>();
  const months = new Map<string, { dollars: Record<MspdSecurity["type"],number>; missingResults: number }>();
  for (const row of rows) {
    const issue = isoDate(row.issue_date);
    if (issue > cutoff) continue;
    const key = `${row.cusip}|${issue}`;
    if (seen.has(key)) throw new Error(`拍卖重复：${key}`); seen.add(key);
    const month = issue.slice(0,7);
    const entry = months.get(month) ?? { dollars: {bills:0,notes:0,bonds:0,tips:0,frn:0}, missingResults: 0 };
    const amount = parseTreasuryAmount("grand_total_par_awarded" in row ? row.grand_total_par_awarded : row.total_accepted);
    // offering_amt为计划发行，结果缺失时不替代实际成交额。
    if (amount == null) entry.missingResults++;
    else entry.dollars[auctionSecurityType(row)] += amount;
    months.set(month,entry);
  }
  return [...months].sort(([a],[b]) => a.localeCompare(b)).map(([month,entry]) => ({month,...entry, complete:entry.missingResults===0, periodComplete:month<cutoff.slice(0,7)}));
}
