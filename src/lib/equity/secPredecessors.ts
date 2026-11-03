import type { SecFactPoint } from "./secFundamentals";

/** 仅注册法定/会计前身；不把收购对象或拆分前完整母公司当作历史。 */
export const SEC_PREDECESSORS = [
  { current: 2115436, predecessor: 34088, before: "2026-07-01", source: "https://www.sec.gov/Archives/edgar/data/2115436/000119312526291990/d71068d8k12b.htm" },
  { current: 2012383, predecessor: 1364742, before: "2024-10-01", source: "https://www.sec.gov/Archives/edgar/data/2012383/000119312524229601/d856271d8k12b.htm" },
  { current: 1841666, predecessor: 6769, before: "2021-03-01", source: "https://www.sec.gov/Archives/edgar/data/1841666/000119312521063695/d127090d8k12b.htm" },
  { current: 1835632, predecessor: 1058057, before: "2021-04-20", source: "https://www.sec.gov/Archives/edgar/data/1835632/000119312521122938/d136815d8k12b.htm" },
  { current: 1996862, predecessor: 1144519, before: "2023-11-01", source: "https://www.sec.gov/Archives/edgar/data/1996862/000110465923113123/tm2329005d3_8k12g3.htm" },
  { current: 1730168, predecessor: 1649338, before: "2018-04-05", source: "https://www.sec.gov/Archives/edgar/data/1730168/000173016818000084/avgo-11042018x10k.htm" },
  { current: 1730168, predecessor: 1441634, before: "2016-02-01", source: "https://www.sec.gov/Archives/edgar/data/1730168/000173016818000084/avgo-11042018x10k.htm" },
  { current: 1707925, predecessor: 884905, before: "2018-10-31", source: "https://www.sec.gov/Archives/edgar/data/1707925/000170792519000076/R10.htm" },
  { current: 1744489, predecessor: 1001039, before: "2019-03-20", source: "https://www.sec.gov/Archives/edgar/data/1744489/000095015719000301/form8k-12b.htm" },
  { current: 1811074, predecessor: 97517, before: "2021-01-11", source: "https://www.sec.gov/Archives/edgar/data/1811074/000121390021001303/ea133016-8k_texaspacific.htm" },
  { current: 1739940, predecessor: 701221, before: "2018-12-20", source: "https://www.sec.gov/Archives/edgar/data/1739940/000114036118045479/form8k12b.htm" },
  { current: 1858681, predecessor: 1411494, before: "2022-01-01", source: "https://www.sec.gov/Archives/edgar/data/1858681/000119312522000274/d285518d8k12b.htm" },
  { current: 2011641, predecessor: 1832433, before: "2024-08-01", source: "https://www.sec.gov/Archives/edgar/data/2011641/000119312524190512/d866383d8k12b.htm" },
] as const;

type CompanyFacts = { cik?: number | string; facts?: Record<string, Record<string, { units?: Record<string, SecFactPoint[]> }>> };

/** 本期披露优先：同标签/单位/区间已有值时，不让旧子公司后续申报覆盖集团重述。 */
export function mergeSecPredecessorFacts(current: unknown, predecessor: unknown): unknown {
  const now = current as CompanyFacts, old = predecessor as CompanyFacts;
  const rule = SEC_PREDECESSORS.find(r => r.current === Number(now?.cik) && r.predecessor === Number(old?.cik));
  if (!rule) return current;
  const gaap = { ...now.facts?.["us-gaap"] };
  for (const [name, concept] of Object.entries(old.facts?.["us-gaap"] ?? {})) {
    const units = { ...gaap[name]?.units };
    for (const [unit, points] of Object.entries(concept.units ?? {})) {
      const spans = new Set((units[unit] ?? []).filter(p => Number.isFinite(p.val)).map(p => `${p.start ?? ""}|${p.end}`));
      units[unit] = [...points.filter(p => typeof p.end === "string" && p.end < rule.before
        && !spans.has(`${p.start ?? ""}|${p.end}`)), ...(units[unit] ?? [])];
    }
    gaap[name] = { ...concept, ...gaap[name], units };
  }
  return { ...now, facts: { ...now.facts, "us-gaap": gaap } };
}
