import { PrismaClient } from "@prisma/client";

const INPUTS = [
  "nbs_cn_gdp_q_headline_real_yoy",
  "nbs_cn_gdp_q_headline_nominal",
  "nbs_cn_gdp_q_headline_real",
  "nbs_cn_gdp_q_final_consumption_contribution",
  "nbs_cn_gdp_q_capital_formation_contribution",
  "nbs_cn_gdp_q_net_exports_contribution",
  "nbs_cn_mfg_new_orders",
  "nbs_cn_non_mfg_new_orders",
  "nbs_cn_industrial_headline_yoy",
  "nbs_cn_retail_h_yoy",
  "nbs_cn_fai_m_5129067b_7e570cf8",
  "nbs_cn_fai_m_90028595_d1771824",
  "nbs_cn_fai_m_infrastructure_yoy",
  "nbs_cn_realestate_4035448cce98117aa2",
  "mof_cn_fiscal_general_expenditure_amount",
  "mof_cn_fiscal_fund_expenditure_amount",
  "nbs_cn_cpi_headline_yoy",
  "nbs_cn_ppi_headline_yoy",
  "mofcom_cn_trade_cabe8908b163088537",
  "mofcom_cn_trade_a02519f634eb068d5a",
] as const;

function monthKey(date: Date) { return date.toISOString().slice(0, 7); }

async function main() {
  if (!process.argv.includes("--db")) return console.log(`[verify-cn-economy-overview] catalog 通过：raw=${INPUTS.length} derived=3`);
  const prisma = new PrismaClient();
  try {
    const instruments = await prisma.instrument.findMany({ where: { code: { in: [...INPUTS] } }, include: { dataSubscription: true } });
    const byCode = new Map(instruments.map((item) => [item.code, item]));
    let errors = 0;
    for (const code of INPUTS) {
      const item = byCode.get(code);
      const count = item ? await prisma.macroObservation.count({ where: { instrumentId: item.id } }) : 0;
      if (!item || !item.dataSubscription?.enabled || !item.dataSubscription.releasePackageId || count < 2) {
        console.error(`异常 ${code}: observations=${count} package=${item?.dataSubscription?.releasePackageId ?? "none"}`);
        errors++;
      }
    }

    async function points(code: string) {
      const item = byCode.get(code);
      if (!item) return [];
      const rows = await prisma.macroObservation.findMany({ where: { instrumentId: item.id }, orderBy: { obsDate: "asc" }, select: { obsDate: true, value: true } });
      return rows.map((row) => ({ date: row.obsDate, value: Number(row.value) }));
    }

    const nominal = await points("nbs_cn_gdp_q_headline_nominal");
    const real = await points("nbs_cn_gdp_q_headline_real");
    const realMap = new Map(real.map((point) => [monthKey(point.date), point.value]));
    const deflatorLevels = nominal.flatMap((point) => {
      const denominator = realMap.get(monthKey(point.date));
      return denominator && denominator !== 0 ? [{ date: point.date, value: point.value / denominator }] : [];
    });
    const deflatorMap = new Map(deflatorLevels.map((point) => [monthKey(point.date), point.value]));
    const deflatorYoy = deflatorLevels.flatMap((point) => {
      const date = new Date(point.date); date.setUTCFullYear(date.getUTCFullYear() - 1);
      const prior = deflatorMap.get(monthKey(date));
      return prior && prior !== 0 ? [{ date: point.date, value: (point.value / prior - 1) * 100 }] : [];
    });
    if (deflatorYoy.length < 50) { console.error(`异常 GDP 平减指数可计算历史不足：${deflatorYoy.length}`); errors++; }

    const general = await points("mof_cn_fiscal_general_expenditure_amount");
    const fund = await points("mof_cn_fiscal_fund_expenditure_amount");
    const fundMap = new Map(fund.map((point) => [monthKey(point.date), point.value]));
    const broad = general.flatMap((point) => fundMap.has(monthKey(point.date)) ? [{ date: point.date, value: point.value + fundMap.get(monthKey(point.date))! }] : []);
    const broadMap = new Map(broad.map((point) => [monthKey(point.date), point.value]));
    const broadYoy = broad.flatMap((point) => {
      const date = new Date(point.date); date.setUTCFullYear(date.getUTCFullYear() - 1);
      const prior = broadMap.get(monthKey(date));
      return prior && prior !== 0 ? [{ date: point.date, value: (point.value / prior - 1) * 100 }] : [];
    });
    if (broad.length < 90 || broadYoy.length < 70) { console.error(`异常 广义财政覆盖不足：amount=${broad.length} yoy=${broadYoy.length}`); errors++; }
    if (errors) throw new Error(`[verify-cn-economy-overview] 失败：${errors}`);
    console.log(`[verify-cn-economy-overview] 通过：raw=20/20 deflatorYoy=${deflatorYoy.length} broadAmount=${broad.length} broadYoy=${broadYoy.length}`);
    console.log(`[verify-cn-economy-overview] 最新派生：deflator=${deflatorYoy.at(-1)?.date.toISOString().slice(0, 10)} ${deflatorYoy.at(-1)?.value.toFixed(2)}%；broadFiscal=${broadYoy.at(-1)?.date.toISOString().slice(0, 10)} ${broadYoy.at(-1)?.value.toFixed(2)}%`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
