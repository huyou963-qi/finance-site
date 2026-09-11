/**
 * 全市场内部人情绪序列（Tier B / DERA）——落成宏观序列供图表与 regime 消费。
 *
 * npm run equity:build-insider-sentiment
 *
 * 口径：按 **filedAt** 归月（交易日的信息当时并不公开，用它会前视），
 * 统计公开市场买入申报份数占买卖申报总数的比例。用**申报份数**而非股数或金额：
 * - 股数/金额会被个别巨额交易主导（Bezos 单人即可扭曲整月）；
 * - 份数衡量的是「有多少内部人在买」，正是情绪指标要的广度含义。
 * 只取 P/S——A(授予)/F(代扣税)/M(行权) 是薪酬机制的机械产物（AGENTS.md 实测口径）。
 *
 * ⚠ 与因子同源的实现层滞后：DERA 季度包出版很晚（实测 2026-09 时 2026q2 仍 404）。
 * 本序列按 filedAt 归月故不含前视，但**不代表当月月末就能拿到**。做 regime 联动或
 * 回测时，可见性须按 DERA 出版日而非 obsDate，否则高估可用性。
 *
 * 实证（2006-01 起 243 个月）：买入占比最高的 10 个月全部落在公认市场底部或重挫——
 * 2008-11(72.3%)、2008-10、2009-03(标普见底月)、2020-03(标普见底月)、2011-08、2018-12；
 * 最低的几个月是 2021-02/03/06(17-18%)，即后疫情狂热顶部。形态上像逆向情绪，但见下条。
 *
 * ⚠ **同步不等于领先——本序列不是择时信号**（2026-09-11 实测，SPY 前瞻收益）：
 * 1/3/6/12 个月各前瞻期秩相关 ρ≈0，非重叠样本 |t|<1.4；信号最强的 20% 月份，后续 3/6/12 个月
 * 收益反而低于其余月份（12 个月 9.8% vs 12.5%）。滞后 5 个月（DERA 可交易口径）同样无效，
 * 剔除 2008-07~2009-06 后结论不变。原因：高买入占比多出现在暴跌途中（2008-10/11 之后市场
 * 又跌了四个月），它复述的是「正在崩盘」，这从价格上本就可见。可作描述性的情绪/regime 背景读数，
 * **不要**据此做仓位或择时决策。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 派生序列不占 fredSeriesId（见 [[instrument-fredseriesid-dedup-rule]]），保持 null。 */
const SERIES = [
  {
    code: "sec_us_insider_buy_share_monthly",
    name: "美国：内部人买入申报占比（全市场，月）",
    nameEn: "US Insider Buy Share of Open-Market Filings (Monthly)",
    unit: "%",
    description:
      "SEC DERA 全市场 Form 4：含公开市场买入(P)的申报份数 / (含 P + 含 S 的申报份数)。按申报日归月。高=内部人整体偏买入，历史上集中出现在市场底部。",
  },
  {
    code: "sec_us_insider_buy_filings_monthly",
    name: "美国：内部人买入申报份数（全市场，月）",
    nameEn: "US Insider Open-Market Buy Filings (Monthly)",
    unit: "份",
    description:
      "SEC DERA 全市场 Form 4：含公开市场买入(P)的申报份数。为占比序列提供绝对量级背景——占比走高可能来自买入增加，也可能来自卖出萎缩。",
  },
] as const;

const FIRST_MONTH = "2006-01-01";

async function main() {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT to_char(date_trunc('month', t.filed_at), 'YYYY-MM-DD') AS month,
            count(DISTINCT t.accession) FILTER (WHERE t.transaction_code = 'P')::int AS buy_filings,
            count(DISTINCT t.accession) FILTER (WHERE t.transaction_code = 'S')::int AS sell_filings
       FROM mds.dera_insider_transaction t
      WHERE t.anomaly IS NULL AND t.transaction_code IN ('P','S') AND t.shares > 0
        AND t.filed_at >= $1::date
      GROUP BY 1 ORDER BY 1`,
    FIRST_MONTH,
  )) as { month: string; buy_filings: number; sell_filings: number }[];

  if (!rows.length) {
    console.error("[insider-sentiment] dera_insider_transaction 无数据，先跑 equity:sync-dera-insider");
    process.exit(1);
  }

  for (const def of SERIES) {
    const inst = await prisma.instrument.upsert({
      where: { code: def.code },
      update: { name: def.name, nameEn: def.nameEn, unit: def.unit, description: def.description },
      create: {
        code: def.code, kind: "MACRO_SERIES", name: def.name, nameEn: def.nameEn,
        freqLabel: "月", unit: def.unit, description: def.description,
      },
    });

    // 月末作为观测日：该月全部申报在月末均已可见（不含前视，实现层滞后见文件头）。
    const points = rows.map((r) => {
      const [y, m] = r.month.split("-").map(Number);
      const obsDate = new Date(Date.UTC(y!, m!, 0));
      const gross = r.buy_filings + r.sell_filings;
      const value =
        def.code === "sec_us_insider_buy_share_monthly"
          ? gross > 0 ? (r.buy_filings / gross) * 100 : null
          : r.buy_filings;
      return value == null ? null : { instrumentId: inst.id, obsDate, value };
    }).filter((x): x is { instrumentId: string; obsDate: Date; value: number } => x !== null);

    let written = 0;
    for (let i = 0; i < points.length; i += 500) {
      const batch = points.slice(i, i + 500);
      await prisma.$transaction(
        batch.map((pt) =>
          prisma.macroObservation.upsert({
            where: { instrumentId_obsDate: { instrumentId: pt.instrumentId, obsDate: pt.obsDate } },
            update: { value: pt.value },
            create: pt,
          }),
        ),
      );
      written += batch.length;
    }
    console.log(`  ✓ ${def.code}：${written} 个月（${rows[0]!.month.slice(0, 7)} → ${rows[rows.length - 1]!.month.slice(0, 7)}）`);
  }
  console.log("[insider-sentiment] 完成");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
