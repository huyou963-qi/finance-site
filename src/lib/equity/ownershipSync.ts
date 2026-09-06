import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discoverSecFilings, fetchSecText, secDocumentUrl } from "./secEdgar";
import { writeSecFilingIndex } from "./secFilingSync";
import { parseForm4Xml, parseOwnershipHoldings, parseDerivativeTransactions } from "../quant/form4";
import { parseTradingPlans } from "./ownershipPlans";
import type { OwnershipCoverage, OwnershipDocument } from "./ownershipTypes";
import { fetchFmpSharesFloat } from "./fmpEquity";
import { appendOwnershipReview } from "./ownershipReviews";
import { isDay } from "./ownershipReviewValidation";

const OWNERSHIP_FORMS = new Set(["3","3/A","4","4/A","5","5/A"]);
const PLAN_FORMS = new Set(["10-Q","10-Q/A","10-K","10-K/A"]);
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Sole ownership writer: original XML + canonical Table I rows commit together per filing. */
export async function ingestOwnershipDocument(ctx: { cik: string; symbol: string; accession: string; form: string; filedAt: string; primaryDocument: string | null }, text: string) {
  const sourceUrl = secDocumentUrl(ctx.cik,ctx.accession,ctx.primaryDocument,OWNERSHIP_FORMS.has(ctx.form));
  const isOwnership = OWNERSHIP_FORMS.has(ctx.form);
  if (isOwnership && !/<ownershipDocument[\s>]/.test(text)) throw new Error("SEC 返回的不是 ownership XML");
  const rows = isOwnership ? parseForm4Xml(text) : [];
  if(isOwnership && (text.match(/<nonDerivativeTransaction(?:\s|>)/g)?.length??0)!==rows.length) throw new Error("存在无法完整解析的 Table I 交易行");
  if(rows.some(t=>!isDay(t.transactionDate)||!Number.isFinite(t.shares)||t.shares<0||!["A","D"].includes(t.acquiredDisposedCode))) throw new Error("交易日期、股数或方向无效");
  if (rows.some(t=>Number(t.issuerCik)!==Number(ctx.cik))) throw new Error("SEC issuer CIK 不匹配");
  const derivativeRows = isOwnership ? parseDerivativeTransactions(text) : [];
  const document: OwnershipDocument & { derivativeRows: typeof derivativeRows } = {
    version:2,parserVersion:5,sourceHash:createHash("sha256").update(text).digest("hex"),sourceUrl,parsedAt:new Date().toISOString(),
    holdings:isOwnership ? parseOwnershipHoldings(text) : [], plans:isOwnership ? [] : parseTradingPlans(text,sourceUrl,ctx.filedAt),
    warnings:[], derivativeRows, ...(isOwnership ? {rawXml:text} : {}),
  };
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.accession}))`;
    for (const [lineIndex,t] of rows.entries()) {
      const data = { cik:ctx.cik,symbol:ctx.symbol,filerCik:t.filerCik,filerName:t.filerName,isDirector:t.isDirector,isOfficer:t.isOfficer,
        isTenPercentOwner:t.isTenPercentOwner,officerTitle:t.officerTitle,transactionDate:new Date(t.transactionDate),transactionCode:t.transactionCode,
        acquiredDisposedCode:t.acquiredDisposedCode,shares:t.shares,pricePerShare:t.pricePerShare,sharesOwnedAfter:t.sharesOwnedAfter,
        filedAt:new Date(ctx.filedAt),evidence:json({...t.evidence,documentType:ctx.form}) };
      await tx.insiderTransaction.upsert({ where:{accession_lineIndex:{accession:ctx.accession,lineIndex}},
        create:{accession:ctx.accession,lineIndex,...data},update:data });
    }
    const existingCount = await tx.insiderTransaction.count({where:{accession:ctx.accession}});
    if (existingCount>rows.length) throw new Error("新版解析行数减少，需要人工核对；未删除旧事实");
    await tx.secFiling.update({where:{cik_accession:{cik:ctx.cik,accession:ctx.accession}},data:{ownershipData:json(document),ownershipParsedAt:new Date()}});
    return rows.length;
  },{timeout:60000});
}

/** Existing quant:sync-form4 discovers full history + amendments + plan disclosures. */
export async function syncOwnershipSymbol(symbol: string, options: { since: string; maxFilings?: number; force?: boolean; plansOnly?: boolean }) {
  const security = await prisma.equitySecurity.findUnique({where:{symbol}});
  if (!security?.cik) throw new Error("标的不存在或缺少 CIK");
  const cik = security.cik.replace(/\D/g,"").padStart(10,"0");
  const through = new Date().toISOString().slice(0,10);
  const coverage: OwnershipCoverage = {since:options.since,through,checkedAt:new Date().toISOString(),complete:false,discovered:0,parsed:0,failed:0};
  try {
    const index = (await discoverSecFilings(cik,options.since,true)).filter(r=>OWNERSHIP_FORMS.has(r.form)||PLAN_FORMS.has(r.form));
    coverage.discovered = index.length;
    const selected = options.plansOnly ? index.filter(r=>PLAN_FORMS.has(r.form)) : index;
    const targets = options.maxFilings ? selected.slice(-options.maxFilings) : selected;
    for (const row of targets) {
      const filing = await writeSecFilingIndex(cik,symbol,row);
      const cached = filing.ownershipData as unknown as OwnershipDocument | null;
      if (cached?.version===2 && cached.parserVersion===5 && !options.force) { coverage.parsed++; continue; }
      try {
        const text = cached?.rawXml && !options.force ? cached.rawXml : await fetchSecText(secDocumentUrl(cik,row.accession,row.primaryDocument,OWNERSHIP_FORMS.has(row.form)));
        await ingestOwnershipDocument({cik,symbol,...row},text);
        coverage.parsed++;
      } catch(error) {
        coverage.failed++;
        console.warn(`[ownership] ${symbol} ${row.accession}: ${error instanceof Error ? error.message : "解析失败"}`);
      }
    }
    coverage.complete = !options.plansOnly && targets.length===index.length && coverage.failed===0;
  } catch(error) { coverage.failed++; coverage.error = error instanceof Error ? error.message : "SEC 同步失败"; }
  if (!options.plansOnly) await prisma.$executeRaw`UPDATE mds.equity_security SET metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('ownershipCoverage',${JSON.stringify(coverage)}::jsonb) WHERE symbol=${symbol}`;
  if (!options.plansOnly && process.env.FMP_API_KEY) {
    try {
      const float = await fetchFmpSharesFloat(symbol);
      const rows = await prisma.insiderTransaction.findMany({where:{symbol,transactionCode:{in:["P","S"]},evidence:{not:Prisma.DbNull}},select:{evidence:true}});
      const classes = [...new Set(rows.map(r=>(r.evidence as {security?:string})?.security?.trim().toLowerCase()).filter((v):v is string=>!!v))];
      if (float && classes.length===1 && float.date<=through) {
        const key = `float:fmp:${through}`;
        const existing = await prisma.ownershipReview.findFirst({where:{symbol,key},orderBy:{revision:"desc"}});
        if (!existing) await appendOwnershipReview({symbol,key,expectedRevision:0,payload:{kind:"float",security:classes[0],date:float.date,shares:float.shares},
          sourceUrl:float.source,quote:`FMP floatShares=${float.shares}; observation date=${float.date}; fetched=${through}; symbol=${symbol}. This is a vendor float estimate, not outstanding shares.`,availableAt:through},"FMP adapter");
      }
    } catch { console.warn(`[ownership] ${symbol}: FMP 流通股不可用，保留已核实分母`); }
  }
  return coverage;
}
