import type { BasicEarningsBrief, BriefEvidence } from "@/lib/equity/basicEarningsBrief";

function EvidenceItem({ item }: { item: BriefEvidence }) {
  return <li className="min-w-0">
    <p>{item.text}</p>
    <details className="text-fs-muted">
      <summary className="w-fit cursor-pointer text-fs-accent-text">{item.kind === "xbrl" ? "数据依据" : "原文依据"}</summary>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text hover:underline">查看来源 ↗</a>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item.evidence}</p>
    </details>
  </li>;
}
export function BasicEarningsBriefView({ brief }: { brief?: BasicEarningsBrief | null }) {
  if (!brief || !(brief.financial.length || brief.business.length || brief.guidance.length || brief.businessExcerpt || brief.guidanceExcerpt)) return null;
  return <section aria-label="基础中文业绩摘要" className="my-2 min-w-0 rounded border border-fs-border bg-fs-bg px-3 py-2 text-xs leading-6">
    <p className="font-medium text-fs-text">基础中文摘要 · 规则提取</p>
    {brief.financial.length ? <ul className="space-y-1 text-fs-text">{brief.financial.map((item, index) => <EvidenceItem key={index} item={item} />)}</ul>
      : <p className="text-fs-muted">尚无与本报告期、申报版本匹配的可核对财务数字。</p>}
    {brief.financialFiledAt ? <p className="text-fs-muted">财务依据：SEC {brief.financialFiledAt} 报表版本，可能晚于业绩新闻稿。</p> : null}
    <p className="mt-1 font-medium text-fs-text">经营表现</p>
    {brief.business.length ? <ul>{brief.business.map((item, index) => <EvidenceItem key={index} item={item} />)}</ul>
      : <><p className="text-fs-muted">未提取到可可靠转述的经营指标。</p>{brief.businessExcerpt ? <ul><EvidenceItem item={brief.businessExcerpt} /></ul> : null}</>}
    <p className="mt-1 font-medium text-fs-text">管理层指引</p>
    {brief.guidance.length ? <ul>{brief.guidance.map((item, index) => <EvidenceItem key={index} item={item} />)}</ul>
      : <><p className="text-fs-muted">未提取到可可靠转述的量化指引，不代表公司未提供指引。</p>{brief.guidanceExcerpt ? <ul><EvidenceItem item={brief.guidanceExcerpt} /></ul> : null}</>}
    <p className="mt-1 text-fs-muted">GAAP 与调整后口径分开；不含市场一致预期比较，不判断是否超预期。</p>
  </section>;
}
