import type { ObservationPoint } from "../types";

const clean = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|\s+/g, "");
/** General economic release publishes these six cumulative facts explicitly.
 * Never derive a standalone quarter or nominal growth from cumulative totals. */
export function parseGdpCumulativeRelease(html: string): Map<string, ObservationPoint> {
  const title = clean(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const quarter = /前三季度/.test(title) ? 3 : /上半年/.test(title) ? 2 : /一季度/.test(title) ? 1 : /^20\d{2}年/.test(title) ? 4 : 0;
  const date = /[（(](20\d{2})年\d{1,2}月\d{1,2}日[）)]/.exec(clean(html));
  const year = Number(/^(20\d{2})年/.exec(title)?.[1] ?? date?.[1]);
  if (!quarter || !year) throw new Error("GDP 首发公告无法确认统计年/季度");
  const output = new Map<string, ObservationPoint>();
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => clean(cell[1]!)));
    const joined = rows.slice(0, 4).flat().join("");
    const endMonth = quarter * 3;
    if (!new RegExp(`1[—－-]${endMonth}月`).test(joined) || !/绝对量/.test(joined) || !/同比增长/.test(joined)) continue;
    let inGdp = false;
    for (const row of rows) {
      if (/^[一1][、.]国内生产总值[（(]亿元[）)]$/.test(row[0] ?? "")) { inGdp = true; continue; }
      if (!inGdp) continue;
      if (/^[二三四五六七八九十][、.]/.test(row[0] ?? "")) break;
      const component = { 第一产业: "primary", 第二产业: "secondary", 第三产业: "tertiary" }[row[0]!];
      if (!component || row.length !== 5) continue;
      for (const [suffix, index] of [["nomcum", 3], ["reaccyoy", 4]] as const) {
        const raw = row[index];
        if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error("GDP 首发公告累计列缺失/变化");
        const code = `nbs_cn_gdp_q_${component}_${suffix}`;
        const point = { obsDate: new Date(Date.UTC(year, (quarter - 1) * 3, 1)), value: Number(raw) };
        const prior = output.get(code);
        if (prior && prior.value !== point.value) throw new Error("GDP 首发重复表冲突");
        output.set(code, point);
      }
    }
  }
  if (output.size !== 6) throw new Error("GDP 首发公告缺少三产业累计值/实际累计同比表，拒绝推算");
  return output;
}
