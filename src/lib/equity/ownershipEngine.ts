import type { InsiderTransactionRow } from "./insiderTransactions";
import type { OwnershipCoverage, OwnershipHolding, OwnershipReviewFact, TradingPlan } from "./ownershipTypes";
import { sharesAtDate, type SplitEvent } from "./priceAdjustment";

export const securityKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const ownerKey = (s: string) => s.replace(/^0+/, "") || "0";
const same = (a: number, b: number) => Math.abs(a-b) <= Math.max(0.01, Math.abs(a)*1e-7);
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>1).sort().join(" ");
/** Only explicit, single-account statements qualify. Advisers/parents listed in a footnote are not accounts. */
export function disclosedAccount(ownership: string | null, owners: {cik:string;name:string}[], footnotes: string[]): string | null {
  if (ownership==="D" && owners.length===1) return `direct:${ownerKey(owners[0].cik)}`;
  const named = [...new Set(footnotes.flatMap(f=>{
    const m=/^(?:These|The reported|The) (?:securities|shares) are (?:held directly|directly held) by (?:the )?([\s\S]+)/i.exec(f.trim());
    if (!m) return [];
    const entity = m[1].split(/,\s+(?:of which|for which|which|an?\s)|\s+\("|,?\s+dba\s|\.\s+They\s/i)[0].replace(/\.$/,"").trim();
    if (!entity || entity.length>200 || /[.;]\s+(?:These|The|This)\b/.test(entity)) return [];
    return [entity.toLowerCase().replace(/[.,]/g,"").replace(/\s+/g," ")];
  }))];
  if (named.length!==1 || /reporting person|^a[n]? |^trust$/.test(named[0])) return null;
  return `entity:${named[0]}`;
}
export type EconomicTransaction = InsiderTransactionRow & {
  security: string; account: string | null; owner: string; economicId: string;
  status: "included" | "pending" | "duplicate" | "superseded" | "excluded";
  reason: string; planStatus: "yes" | "no" | "unknown"; adjustedShares: number;
};
export function latestOwnershipReviews(reviews: OwnershipReviewFact[], asOf: string) {
  const result = new Map<string, OwnershipReviewFact>();
  for (const r of reviews.filter(r => r.availableAt <= asOf).sort((a,b) => a.revision-b.revision)) result.set(r.key,r);
  return [...result.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function resolvePlanDisclosures(plans: TradingPlan[], reviews: OwnershipReviewFact[], asOf: string) {
  const map=new Map<string,TradingPlan>();
  for(const p of plans.filter(p=>p.filedAt<=asOf).sort((a,b)=>a.filedAt.localeCompare(b.filedAt))) map.set(p.id,p);
  for(const f of latestOwnershipReviews(reviews,asOf)) if(f.payload.kind==="plan") map.set(f.payload.plan.id,f.payload.plan);
  return [...map.values()];
}
export function resolveEconomicTransactions(rows: InsiderTransactionRow[], reviews: OwnershipReviewFact[], asOf: string, splits: SplitEvent[]): EconomicTransaction[] {
  const facts = latestOwnershipReviews(reviews, asOf);
  const visible = rows.filter(r => r.filedAt <= asOf && r.transactionDate <= asOf);
  const resolved: EconomicTransaction[] = visible.map(r => {
    const e = r.evidence;
    const owner = ownerKey(e?.owners[0]?.cik || r.filerCik);
    const account = e ? disclosedAccount(e.ownership,e.owners,e.footnotes) : null;
    const security = securityKey(e?.security ?? "");
    return { ...r, security, account, owner, economicId: r.id, adjustedShares: sharesAtDate(r.shares, r.transactionDate, asOf, splits),
      status: e && security && account && !e.derivative && !e.documentType.endsWith("/A") ? "included" : "pending",
      reason: !e ? "旧解析缺少证券/账户证据" : e.derivative ? "衍生证券不计市场股数供给" : e.documentType.endsWith("/A") ? "更正申报待逐行裁定" : !account ? "受益账户待核实" : !security ? "证券类别缺失" : account.startsWith("entity:") ? "脚注明确的直接持有实体" : "单一直接持有账户",
      planStatus: e?.plan === true ? "yes" : e?.plan === false || e?.formPlan===false ? "no" : "unknown" };
  });
  const byId = new Map(resolved.map(r => [r.id,r]));
  const autoDecided = new Set<string>();
  // Whole-filing replacement is allowed ONLY when the amendment explicitly says it restates all transactions.
  for (const accession of new Set(resolved.filter(r=>r.evidence?.documentType.endsWith("/A")).map(r=>r.accession))) {
    const amended=resolved.filter(r=>r.accession===accession), anchor=amended[0];
    const originalDate=anchor.evidence?.originalSubmissionDate, remarks=anchor.evidence?.remarks??"";
    if(!originalDate)continue;
    const ownerSet=(r:EconomicTransaction)=>(r.evidence?.owners??[]).map(o=>ownerKey(o.cik)).sort().join(",");
    const originals=resolved.filter(r=>r.accession!==accession&&r.filedAt===originalDate&&ownerSet(r)===ownerSet(anchor)&&!r.evidence?.documentType.endsWith("/A"));
    if(new Set(originals.map(r=>r.accession)).size!==1)continue;
    const full=/restates? in (?:its|their) entirety|restating the entire (?:initial|original) Form 4.?s transactions/i.test(remarks);
    if(full){
      for(const r of originals){r.status="superseded";r.reason="4/A 原文明确整份重述";r.economicId=accession;autoDecided.add(r.id);}
      for(const r of amended){r.status=r.account&&r.security?"included":"pending";r.reason=r.account?"4/A 明确整份重述后的有效行":"受益账户待核实";autoDecided.add(r.id);}
    } else if(/correct.*code[\s\S]*disposition/i.test(remarks)&&/otherwise unmodified/i.test(remarks)){
      const matches=amended.map(r=>({r,old:originals.filter(o=>o.account===r.account&&o.security===r.security&&o.transactionDate===r.transactionDate&&o.shares===r.shares&&o.pricePerShare===r.pricePerShare&&o.sharesOwnedAfter===r.sharesOwnedAfter&&o.transactionCode===r.transactionCode)}));
      if(matches.every(m=>m.old.length===1&&m.r.account)){
        for(const r of originals){r.status=r.account&&r.security?"included":"pending";r.reason=r.account?"更正声明其余内容不变":"受益账户待核实";autoDecided.add(r.id);}
        for(const {r,old} of matches){old[0].status="superseded";old[0].economicId=r.id;old[0].reason="4/A 明确更正 A/D 方向码";r.status="included";r.reason="已核实方向码更正";autoDecided.add(r.id);}
      }
    }
  }
  // Corrections can change quantities/dates. Quarantine the potential original scope until reviewed.
  for (const amendment of resolved.filter(r => r.evidence?.documentType.endsWith("/A"))) {
    if(autoDecided.has(amendment.id))continue;
    for (const original of resolved) {
      if (original.accession === amendment.accession || original.filedAt > amendment.filedAt) continue;
      const overlap = original.evidence?.owners.some(o => amendment.evidence?.owners.some(a => ownerKey(a.cik) === ownerKey(o.cik)));
      if (overlap && original.security === amendment.security &&
        (!amendment.evidence?.originalSubmissionDate || original.filedAt === amendment.evidence.originalSubmissionDate)) {
        original.status = "pending"; original.reason = "存在相关更正申报，尚未裁定被更正行";
      }
    }
  }
  for (const review of facts) {
    const p = review.payload;
    if (p.kind === "account") for (const id of p.lineIds) {
      const r = byId.get(id); if (!r) continue;
      r.account = p.account; r.security = securityKey(p.security); r.owner = ownerKey(p.ownerCik);
      if (r.reason === "受益账户待核实") { r.status = "included"; r.reason = "账户已审核"; }
    }
  }
  // Matching prices alone never merge: require same confirmed account AND explicit reference to accession.
  const accessionRows=new Map<string,EconomicTransaction[]>();
  for(const r of resolved) accessionRows.set(r.accession,[...(accessionRows.get(r.accession)??[]),r]);
  for (const r of resolved) {
    if (r.status !== "included") continue;
    const referenced = r.evidence?.footnotes.join(" ") ?? "";
    const referencedRows=[...new Set(referenced.match(/\b\d{10}-\d{2}-\d{6}\b/g)??[])].flatMap(a=>accessionRows.get(a)??[]);
    const target = referencedRows.find(t => t.id !== r.id && t.status === "included" && t.accession !== r.accession &&
      t.account === r.account && t.security === r.security && t.transactionDate === r.transactionDate &&
      t.transactionCode === r.transactionCode && t.acquiredDisposedCode === r.acquiredDisposedCode &&
      t.shares === r.shares && t.pricePerShare === r.pricePerShare && t.sharesOwnedAfter === r.sharesOwnedAfter &&
      referenced.includes(t.accession));
    if (target) { r.status = "duplicate"; r.economicId = target.id; r.reason = "同账户同交易，脚注明确引用原 accession"; }
  }
  const decided = new Set<string>(autoDecided);
  for (const review of facts) {
    const p = review.payload; if (p.kind !== "transaction") continue;
    const group = p.lineIds.map(id => byId.get(id)).filter((r): r is EconomicTransaction => !!r);
    if (group.length !== p.lineIds.length) continue; // no future partial application
    for (const r of group) {
      decided.add(r.id);
      if (p.action === "exclude") { r.status = "excluded"; r.reason = "审核排除"; }
      else if (p.action === "separate" || r.id === p.canonicalId) {
        r.status = r.account && r.security ? "included" : "pending"; r.reason = "逐行裁定独立有效"; r.economicId = r.id;
      } else { r.status = p.action === "replace" ? "superseded" : "duplicate"; r.economicId = p.canonicalId!; r.reason = p.action === "replace" ? "已被更正行替代" : "已核实同一经济交易"; }
    }
  }
  // Same security/date/amount across filings with unresolved beneficial chains remains pending.
  const fingerprints = new Map<string, EconomicTransaction[]>();
  for (const r of resolved.filter(r => !["excluded","superseded","duplicate"].includes(r.status))) {
    const key = JSON.stringify([r.security,r.transactionDate,r.transactionCode,r.acquiredDisposedCode,r.shares,r.pricePerShare]);
    fingerprints.set(key,[...(fingerprints.get(key) ?? []),r]);
  }
  for (const group of fingerprints.values()) {
    if (new Set(group.map(r=>r.accession)).size < 2) continue;
    // Distinct direct, single-owner accounts are not evidence of a shared economic trade.
    const distinctDirect = group.every(r => r.account && r.status==="included") && new Set(group.map(r=>r.account)).size === group.length;
    if (distinctDirect) continue;
    for (const r of group) if (!decided.has(r.id)) { r.status = "pending"; r.reason = "跨申报同值且账户关系可能重叠"; }
  }
  return resolved;
}

type HoldingSource = OwnershipHolding & { filedAt: string; sourceUrl: string };
export type OwnershipEngineInput = {
  rows: InsiderTransactionRow[]; reviews: OwnershipReviewFact[]; holdings: HoldingSource[]; plans: TradingPlan[];
  asOf: string; from: string; splits: SplitEvent[]; coverage: OwnershipCoverage | null;
  market: { adv20: number | null; latest: string | null; issue: string | null }; truncated?: boolean;
};
export function calculateOwnershipMonitor(input: OwnershipEngineInput) {
  const { asOf, splits, from } = input;
  const facts = latestOwnershipReviews(input.reviews,asOf);
  const transactions = resolveEconomicTransactions(input.rows,input.reviews,asOf,splits);
  const adjusted = (n: number,d: string) => sharesAtDate(n,d,asOf,splits);
  const cover = (start: string) => !!input.coverage?.complete && input.coverage.since <= start && input.coverage.through >= asOf && !input.truncated;
  const inWindow = (date: string,days: number) => date <= asOf && date >= new Date(Date.parse(asOf)-(days-1)*86400000).toISOString().slice(0,10);
  const securities = [...new Set(transactions.map(t=>t.security).filter(Boolean))].sort();
  const supply = securities.map(security => {
    const all = transactions.filter(t=>t.security === security && !t.evidence?.derivative);
    const start90 = new Date(Date.parse(asOf)-89*86400000).toISOString().slice(0,10);
    const start30 = new Date(Date.parse(asOf)-29*86400000).toISOString().slice(0,10);
    const pending90 = all.filter(t => t.status === "pending" && inWindow(t.transactionDate,90));
    const active = all.filter(t=>t.status === "included");
    const sum = (code: string,days: number) => active.filter(t=> t.transactionCode === code && t.acquiredDisposedCode === (code === "S" ? "D" : "A") && inWindow(t.transactionDate,days)).reduce((s,t)=>s+t.adjustedShares,0);
    const sells90 = sum("S",90), buys90 = sum("P",90), sells30 = sum("S",30);
    const floats = facts.filter(f=>f.payload.kind === "float" && securityKey(f.payload.security) === security && f.payload.date <= asOf)
      .sort((a,b)=>(b.payload as {date:string}).date.localeCompare((a.payload as {date:string}).date));
    const float = floats[0]; const fp = float?.payload;
    const floatShares = fp?.kind === "float" && Date.parse(asOf)-Date.parse(fp.date) <= 120*86400000 ? adjusted(fp.shares,fp.date) : null;
    const missingSecurity = transactions.some(t=>!t.security && inWindow(t.transactionDate,90));
    const complete90 = cover(start90) && !pending90.length && !missingSecurity;
    const complete30 = cover(start30) && !all.some(t=>t.status === "pending" && inWindow(t.transactionDate,30)) && !missingSecurity;
    // The listed symbol's ADV must not normalize a different share class.
    const tradedClasses = securities.filter(s=>transactions.some(t=>t.security===s && ["P","S"].includes(t.transactionCode)));
    const advUsable = tradedClasses.length === 1 && tradedClasses[0] === security;
    return { security, sells90, buys90, netSells90: sells90-buys90, sells30, pending: pending90.length,
      complete90, complete30, floatShares, floatDate: fp?.kind === "float" ? fp.date : null, floatSource: float?.sourceUrl ?? null,
      supplyRatio90: complete90 && floatShares ? (sells90-buys90)/floatShares : null,
      sellingAdv30: complete30 && advUsable && input.market.adv20 ? sells30/input.market.adv20 : null,
      reason: !complete90 ? "覆盖不完整或有待裁定交易，仅展示已确认部分" : !floatShares ? "缺少120日内同证券流通股证据" : null,
      advReason: !advUsable ? "多证券类别需先核实上市类别" : input.market.issue };
  });
  const accountKeys = [...new Set(transactions.filter(t=>t.account).map(t=>JSON.stringify([t.account,t.security,t.owner])))];
  const accounts = accountKeys.map(key => {
    const [account,security,owner] = JSON.parse(key) as string[];
    const rows = transactions.filter(t=>t.account===account && t.security===security && t.owner===owner);
    const active = rows.filter(t=>t.status==="included").sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate) || a.filedAt.localeCompare(b.filedAt) || a.accession.localeCompare(b.accession) || (a.lineIndex??0)-(b.lineIndex??0));
    const latest = active.at(-1);
    const first = active[0];
    const manual = facts.filter(f=>f.payload.kind==="baseline" && f.payload.account===account && securityKey(f.payload.security)===security && ownerKey(f.payload.ownerCik)===owner && f.payload.date <= asOf)
      .sort((a,b)=>(a.payload as {date:string}).date.localeCompare((b.payload as {date:string}).date))[0];
    const holding = input.holdings.filter(h=>h.filedAt<=asOf && h.date<=asOf && account===disclosedAccount(h.ownership,h.owners,h.footnotes) && securityKey(h.security)===security)
      .sort((a,b)=>a.date.localeCompare(b.date))[0];
    const mp = manual?.payload;
    let baseline = mp?.kind==="baseline" ? adjusted(mp.shares,mp.date) : holding ? adjusted(holding.shares,holding.date) : null;
    const baselineDate = mp?.kind==="baseline" ? mp.date : holding?.date ?? first?.transactionDate ?? null;
    let inferred = false;
    if (baseline == null && first?.sharesOwnedAfter != null) {
      const firstBatch = active.filter(t=>t.accession===first.accession && t.transactionDate===first.transactionDate);
      const sharedFinal = firstBatch.length>1 && firstBatch.every(t=>t.sharesOwnedAfter===first.sharesOwnedAfter);
      const movement = (sharedFinal ? firstBatch : [first]).reduce((s,t)=>s+(t.acquiredDisposedCode==="D" ? -t.adjustedShares : t.adjustedShares),0);
      baseline = adjusted(first.sharesOwnedAfter,first.transactionDate) - movement;
      inferred = true;
    }
    const baselineLabel = mp?.kind==="baseline" ? mp.label : holding ? "首次披露持仓（Form 3/4/5）" : "首笔交易前推算持仓";
    const after = active.filter(t=>baselineDate && (inferred ? t.transactionDate>=baselineDate : t.transactionDate>baselineDate));
    const sold = after.filter(t=>t.transactionCode==="S" && t.acquiredDisposedCode==="D").reduce((s,t)=>s+t.adjustedShares,0);
    const issues: string[] = [];
    if (new Set(transactions.filter(t=>t.account===account&&t.security===security).map(t=>t.owner)).size>1) issues.push("同一账户跨申报人披露，需核实归属后统一对账");
    if (baseline == null || baseline < 0) issues.push("无法确定起始持仓");
    if (!baselineDate || !cover(baselineDate)) issues.push("基准之后申报覆盖不完整");
    if (rows.some(t=>t.status==="pending" && (!baselineDate || t.transactionDate>=baselineDate))) issues.push("账户存在未裁定申报");
    // Unknown accounts for the same reporting person could include this account.
    if (transactions.some(t=>t.status==="pending" && !t.account && t.evidence?.owners.some(o=>ownerKey(o.cik)===owner))) issues.push("关联受益账户未完全解析");
    let balance = baseline;
    const points: { date: string; shares: number; source: string }[] = baseline != null && baselineDate ? [{date:baselineDate,shares:baseline,source:baselineLabel}] : [];
    const batches: EconomicTransaction[][] = [];
    for (const t of after) {
      const last = batches.at(-1);
      if (last && last[0].accession===t.accession && last[0].transactionDate===t.transactionDate) last.push(t);
      else batches.push([t]);
    }
    for (const batch of batches) {
      const sharedFinal = batch.length>1 && batch[0].sharesOwnedAfter!=null && batch.every(t=>t.sharesOwnedAfter===batch[0].sharesOwnedAfter);
      const steps = sharedFinal ? [{...batch[0],adjustedShares:batch.reduce((s,t)=>s+(t.acquiredDisposedCode==="D" ? -t.adjustedShares : t.adjustedShares),0),acquiredDisposedCode:"A"}] : batch;
      for (const t of steps) {
      if (balance == null) break;
      const expected: number = balance + (t.acquiredDisposedCode==="D" ? -t.adjustedShares : t.adjustedShares);
      const observed = t.sharesOwnedAfter == null ? null : adjusted(t.sharesOwnedAfter,t.transactionDate);
      if (observed != null && !same(expected,observed)) issues.push(`${t.transactionDate} 持股衔接不一致（可能漏报、转股或账户混合）`);
      balance = observed ?? expected;
      points.push({ date:t.transactionDate,shares:balance,source:t.accession });
      }
    }
    const roleReview = facts.findLast(f=>f.payload.kind==="role" && ownerKey(f.payload.ownerCik)===owner)?.payload;
    const role = roleReview?.kind==="role" ? roleReview.role : latest?.isOfficer ? "Executive" : latest?.isDirector ? "Director" : latest?.isTenPercentOwner ? "10% owner" : "Unclassified";
    const usable = !issues.length && baseline != null && baseline > 0 && balance != null && balance >= 0;
    return { account,security,owner,name:latest?.filerName ?? first?.filerName ?? owner,role,baseline,baselineDate,baselineLabel,inferred,
      current:balance,currentDate:after.at(-1)?.transactionDate ?? baselineDate,sold,
      cumulativeSoldRatio:usable ? sold/baseline! : null, retentionRatio:usable ? balance!/baseline! : null,
      netReductionRatio:usable ? 1-balance!/baseline! : null, issues:[...new Set(issues)],points };
  });
  const planMap = new Map<string,TradingPlan>();
  for (const p of resolvePlanDisclosures(input.plans,input.reviews,asOf)) {
    const ownerMatches = [...new Set(transactions.flatMap(t=>t.evidence?.owners.filter(o=>nameKey(o.name)===nameKey(p.ownerName)).map(o=>ownerKey(o.cik))??[]))];
    const ownerCik = p.ownerCik ?? (ownerMatches.length===1 ? ownerMatches[0] : null);
    const known = accounts.filter(a=>a.owner===ownerCik && (!p.security || a.security===securityKey(p.security)));
    const security = p.security ?? (new Set(known.map(a=>a.security)).size===1 ? known[0]?.security : null) ?? null;
    const account = p.account ?? (known.length===1 ? known[0].account : null);
    planMap.set(p.id,{...p,ownerCik,security,account});
  }
  const plans = [...planMap.values()].map(p => {
    const owner = p.ownerCik ? ownerKey(p.ownerCik) : null;
    const matching = transactions.filter(t=>t.status==="included" && t.planStatus==="yes" && t.evidence?.planAdoptionDate===p.adopted &&
      owner && t.owner===owner && p.security && t.security===securityKey(p.security) && (!p.account || t.account===p.account) && t.transactionCode==="S" && t.acquiredDisposedCode==="D");
    const executed = matching.reduce((s,t)=>s+t.adjustedShares,0);
    const maximum = p.maxShares != null && p.adopted ? adjusted(p.maxShares,p.adopted) : null;
    const state = p.terminated && p.terminated<=asOf ? "已终止" : p.end && p.end<asOf ? "已到期" : p.start && p.start>asOf ? "待执行窗口" : "可能执行中";
    const baseAccount = accounts.find(a=>a.owner===owner && a.account===p.account && a.security===securityKey(p.security??""));
    const overlapping = [...planMap.values()].some(other=>other.id!==p.id && other.ownerCik && ownerKey(other.ownerCik)===owner && other.adopted && p.adopted && (!(other.terminated||other.end) || (other.terminated||other.end)!>=p.adopted) && (!(p.terminated||p.end) || (p.terminated||p.end)!>=other.adopted));
    const unresolvedLifecycle = [...planMap.values()].some(other=>other.ownerCik && ownerKey(other.ownerCik)===owner && other.status==="terminated" && !other.adopted);
    const unresolvedTrades = transactions.some(t=>t.owner===owner && t.transactionDate>=(p.adopted??asOf) && (t.status==="pending" || (t.transactionCode==="S" && t.status==="included" && t.planStatus!=="no" && t.evidence?.planAdoptionDate!==p.adopted)));
    const canCalculate = p.verified && p.rule10b51===true && maximum!=null && owner && p.security && p.account && p.adopted && cover(p.adopted) && !overlapping && !unresolvedLifecycle && !unresolvedTrades && executed<=maximum && !/共享|reduction|重叠/i.test(p.conditions);
    return { ...p, state, adjustedMaximum:maximum, linkedExecuted:executed,
      remainingUpperBound:canCalculate ? (state==="已终止" || state==="已到期" ? 0 : Math.max(0,maximum!-executed)) : null,
      plannedHoldingRatio:baseAccount?.current && !baseAccount.issues.length && maximum!=null ? maximum/baseAccount.current : null,
      calculationNote: canCalculate ? "仅扣除明确关联成交；剩余为条件性上限" : "缺少关联证据、覆盖或存在计划额度重叠；不汇总为剩余供给" };
  });
  const roleSelling = supply.flatMap(({security}) => [...new Set(accounts.filter(a=>a.security===security).map(a=>a.role))].map(role=>{
    const selected=transactions.filter(t=>t.status==="included" && t.security===security && t.transactionDate>=from && accounts.some(a=>a.role===role&&a.account===t.account&&a.security===t.security&&a.owner===t.owner));
    const sells=selected.filter(t=>t.transactionCode==="S"&&t.acquiredDisposedCode==="D").reduce((sum,t)=>sum+t.adjustedShares,0);
    const buys=selected.filter(t=>t.transactionCode==="P"&&t.acquiredDisposedCode==="A").reduce((sum,t)=>sum+t.adjustedShares,0);
    return {security,role,shares:sells,buys,net:sells-buys};
  }));
  return { asOf,from,coverage:input.coverage,market:input.market,truncated:!!input.truncated,
    transactions:transactions.filter(t=>t.transactionDate>=from),supply,accounts,plans,roleSelling,
    auditCount:transactions.filter(t=>t.status==="pending").length,
    reviewFacts:facts.map(f=>({id:f.id,key:f.key,revision:f.revision,kind:f.payload.kind,sourceUrl:f.sourceUrl,availableAt:f.availableAt})) };
}
export type OwnershipMonitorResult = ReturnType<typeof calculateOwnershipMonitor>;
