/** Official Word-export HTML tables: first column item, explicit 决算数 column.
 * Keep blank cells to avoid shifting budget/actual/% columns; repeated fiscal-subsidy
 * rows are identified by their preceding insurance-fund heading, never first-match.
 */
import { BUDGET_SCOPES, BUDGET_TABLE_NAMES, type BudgetAccountSeries, type BudgetScope, type BudgetTable } from "./catalog";
export function cleanText(s: string): string { return s.replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160);/gi," ").replace(/&amp;/g,"&").replace(/&#(\d+);/g,(_,n:string)=>String.fromCharCode(Number(n))).replace(/[\s\u3000]+/g,"").replace(/^[一二三四五六七八九十]+[、．.]/,"").replace(/^其中[：:]/,"").trim(); }
export function extractLinks(html: string, base: string) { return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:new URL(m[1]!,base).href.replace(/^http:/,"https:"),title:cleanText(m[2]!)})); }
export function findBudgetTableLinks(html: string, base: string, year: number) {
 const links=extractLinks(html,base); const result: {url:string;scope:BudgetScope;table:BudgetTable;year:number}[]=[];
 for(const scope of Object.keys(BUDGET_SCOPES) as BudgetScope[]) for(const table of Object.keys(BUDGET_TABLE_NAMES) as BudgetTable[]) {
  const title=`${year}年${BUDGET_SCOPES[scope]}${BUDGET_TABLE_NAMES[table]}`;
  const match=links.find(x=>x.title.startsWith(title));
  if(match) result.push({...match,scope,table,year});
 }
 if(result.length !== 15) throw new Error(`财政部 ${year} 年第三第四本账目录不完整：应有15表，实际${result.length}，不能把未发现表当作停止披露`);
 return result;
}
export type BudgetRow = { label:string; value:number|null; parent:string; numbered?: boolean; child?: boolean; section?: "base" | "pooling" };
export function parseBudgetTable(html: string, year: number, scope: BudgetScope, table: BudgetTable): BudgetRow[] {
 if(!Number.isInteger(year)||year<2010||year>=new Date().getUTCFullYear()) throw new Error("年度决算年份异常");
 const title=`${year}年${BUDGET_SCOPES[scope]}${BUDGET_TABLE_NAMES[table]}`;
 if(!cleanText(html).includes(title)) throw new Error(`决算页面标题不匹配：${title}`);
 if(!/单位[：:]\s*(?:<[^>]+>\s*)*亿元/.test(cleanText(html))) throw new Error("年度决算单位不是亿元");
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
 for(const t of tables) {
  const rawRows=[...t[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>c[1]!));
  const rows=rawRows.map(r=>r.map(cleanText));
  const hi=rows.findIndex(r=>r.some(c=>/^(?:20\d{2}年)?决算数$/.test(c)));
  if(hi<0) continue;
  const vi=rows[hi]!.findIndex(c=>/^(?:20\d{2}年)?决算数$/.test(c));
  let parent=""; let section:"base"|"pooling"="base"; const output:BudgetRow[]=[];
  for(let ri=hi+1;ri<rows.length;ri++) {
   const r=rows[ri]!;
   const label=r[0]??""; if(!label||label.startsWith("注"))continue;
   if(/^(?:中央调剂基金[收支]|地方上解全国统筹调剂资金|中央下拨全国统筹调剂资金|中央调剂资金[收支])/.test(label))section="pooling";
   if(/基金收入$/.test(label)||/社会保险基金收入[合小]计$/.test(label))parent=label;
   const raw=r[vi]??""; let value:number|null=null;
   if(raw&&!/^(?:[-—–]|不适用)$/.test(raw)) { if(!/^-?[\d,]+(?:\.\d+)?$/.test(raw)) throw new Error(`决算数非数字 ${label}: ${raw}`); value=Number(raw.replace(/,/g,"")); }
   const originalLabel=(rawRows[ri]?.[0]??"").replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160);/gi," ").trim();
   output.push({label,value,parent,section,numbered:/^[一二三四五六七八九十]+[、．.]/.test(originalLabel),child:/^其中[：:]/.test(originalLabel)});
  }
  if(!output.some(r=>r.value!==null))throw new Error("年度决算表没有有效数据");
  return output;
 }
 throw new Error("年度决算表缺少明确决算数列");
}
export function valueForSeries(rows: BudgetRow[], series: BudgetAccountSeries): number|null {
 let matches=rows.filter(r=>series.labels.some(x=>cleanText(x)===r.label)&&(!series.parent||series.parent.some(x=>cleanText(x)===r.parent))&&(!series.section||series.section===r.section));
 // Some old capital tables repeat a numbered total as a single 其中 child.
 // Select the explicitly numbered parent, using source hierarchy, never position.
 if(series.account==="capital"&&matches.some(r=>r.numbered)) matches=matches.filter(r=>r.numbered);
 if(matches.length>1)throw new Error(`决算指标行重复：${series.key}`);
 return matches[0]?.value??null;
}
