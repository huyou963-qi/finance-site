import type { ObservationPoint } from "../types";
import { fetchGaccMonthlyIndex, fetchGaccCommodityTable } from "../gaccCommodity/client";
import { parseGaccMonthlyTableIndex } from "../gaccCommodity/parseMonthlyIndex";
export type GaccTotalPoint = { key: string; point: ObservationPoint };
const text = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
/** Source publishes USD millions, both monthly and YTD; never derive YoY from revised levels. */
export function parseGaccUsdMonthlySummary(html: string): GaccTotalPoint[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1]!)));
  if (!rows.some(r => /Summary of Imports and Exports.*\(In USD\).*B[：:]?\s*Monthly/i.test(r.join(" "))) || !rows.some(r => /Unit:\s*US\$ million/i.test(r.join(" ")))) throw new Error("GACC USD monthly summary title/unit changed");
  const header = rows.find(r => r[0]?.replace(/\s/g, "") === "Year&Month");
  if (!header || header.slice(1,5).join("|") !== "Total|Export|Import|Balance") throw new Error("GACC USD monthly summary columns changed");
  const totals: GaccTotalPoint[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const date = /^(20\d{2})[.](0?[1-9]|1[0-2])$/.exec(r[0] ?? "");
    if (!date) continue;
    if (r.length !== 9 || seen.has(r[0]!)) throw new Error("GACC USD summary row length/duplicate changed");
    seen.add(r[0]!);
    const obsDate = new Date(Date.UTC(Number(date[1]),Number(date[2])-1,1));
    for (const [offset, measure] of [[1,"amount"],[5,"cumulative_amount"]] as const) {
      for (const [n,kind] of ["total","export","import","balance"].entries()) {
        const raw = r[offset+n]!.replace(/,/g, "");
        if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error("GACC USD summary invalid numeric value");
        totals.push({key:`total|${kind}|${measure}`,point:{obsDate,value:Number((Number(raw)/100).toFixed(10))}});
      }
    }
  }
  if (!totals.length) throw new Error("GACC USD summary has no monthly rows");
  return totals;
}
export async function fetchGaccUsdMonthlySummary(): Promise<GaccTotalPoint[]> {
  const year = new Date().getUTCFullYear();
  const links = parseGaccMonthlyTableIndex(await fetchGaccMonthlyIndex(year,year),
    {no:1,keyword:"summary of imports and exports",titlePattern:/\(in usd\).*b[：:]?\s*monthly/i});
  const latest=links.at(-1)!;
  const url=new URL(latest.url);
  if(url.hostname!=="english.customs.gov.cn"||url.protocol!=="http:")throw new Error("Unexpected GACC official summary URL");
  return parseGaccUsdMonthlySummary(await fetchGaccCommodityTable(url.toString()));
}
