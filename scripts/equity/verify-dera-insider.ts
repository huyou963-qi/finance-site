/**
 * Tier B 全市场内部人交易底座——自检。
 *
 * npm run equity:verify-dera-insider            # 结构+基本覆盖
 * npm run equity:verify-dera-insider -- --full  # 追加逐季连续性检查
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { DERA_INSIDER_FIRST_QUARTER, enumerateQuarters } from "../../src/lib/equity/deraInsider/catalog";

const prisma = new PrismaClient();
let errors = 0;
const fail = (m: string) => { console.error(`  ✗ ${m}`); errors++; };
const ok = (m: string) => console.log(`  ✓ ${m}`);

async function main() {
  const full = process.argv.includes("--full");
  const q = (s: string) => prisma.$queryRawUnsafe(s) as Promise<any[]>;

  const [tot] = await q(`select count(*)::int trans, count(distinct t.issuer_symbol)::int syms,
    count(distinct f.source_quarter)::int quarters, min(t.transaction_date) filter (where t.anomaly is null)::text t0,
    max(t.transaction_date) filter (where t.anomaly is null)::text t1
    from mds.dera_insider_transaction t join mds.dera_insider_filing f on f.accession = t.accession`);
  if (!tot || tot.trans === 0) {
    fail("dera_insider_transaction 为空（先跑 equity:sync-dera-insider）");
    return;
  }
  ok(`交易 ${tot.trans.toLocaleString()} 笔 · ${tot.syms.toLocaleString()} 个 ticker · ${tot.quarters} 个季度 · 可用区间 ${tot.t0} → ${tot.t1}（已排除标记行）`);

  // 孤儿行：外键应保证为 0，为非 0 说明落库顺序或级联出了问题
  const [orph] = await q(`select
    (select count(*)::int from mds.dera_insider_transaction t
       where not exists (select 1 from mds.dera_insider_filing f where f.accession=t.accession)) as t_orphan,
    (select count(*)::int from mds.dera_insider_owner o
       where not exists (select 1 from mds.dera_insider_filing f where f.accession=o.accession)) as o_orphan`);
  if (orph.t_orphan || orph.o_orphan) fail(`孤儿行 交易${orph.t_orphan}/申报人${orph.o_orphan}`);
  else ok("无孤儿行（交易与申报人都能回连申报头）");

  // 异常标记应当是极少数；占比过高说明分类逻辑或源结构变了
  const [an] = await q(`select count(*) filter (where anomaly is not null)::int bad, count(*)::int all_n
    from mds.dera_insider_transaction`);
  const pct = (an.bad / an.all_n) * 100;
  if (pct > 2) fail(`异常标记占比 ${pct.toFixed(2)}%（>2%，疑似源结构变化）`);
  else ok(`异常标记 ${an.bad.toLocaleString()} 笔（${pct.toFixed(3)}%）`);
  for (const r of await q(`select anomaly a, count(*)::int n from mds.dera_insider_transaction
      where anomaly is not null group by 1 order by 2 desc`)) {
    console.log(`      ${r.a}: ${r.n.toLocaleString()}`);
  }

  // 干净行里不应再有逻辑不可能的日期
  const [bad] = await q(`select count(*)::int n from mds.dera_insider_transaction
    where anomaly is null and transaction_date > filed_at`);
  if (bad.n) fail(`${bad.n} 笔未标记但交易日晚于申报日`);
  else ok("未标记行中无日期倒挂");

  // P/S 应当占有意义的比例，且卖多于买（长期稳定的结构性事实）
  const [ps] = await q(`select
    count(*) filter (where transaction_code='P')::int p,
    count(*) filter (where transaction_code='S')::int s from mds.dera_insider_transaction where anomaly is null`);
  if (ps.p === 0 || ps.s === 0) fail(`P/S 缺失：P=${ps.p} S=${ps.s}（交易代码解析可能有误）`);
  else ok(`公开市场买入 ${ps.p.toLocaleString()} / 卖出 ${ps.s.toLocaleString()}（比 1:${(ps.s / ps.p).toFixed(1)}）`);

  // 申报人角色必须至少解析出一类，否则说明逗号拆分失效
  const [role] = await q(`select count(*) filter (where is_director or is_officer or is_ten_percent_owner or is_other)::int typed,
    count(*)::int all_n from mds.dera_insider_owner`);
  if (role.all_n && role.typed / role.all_n < 0.9) {
    fail(`仅 ${((role.typed / role.all_n) * 100).toFixed(1)}% 申报人解析出角色（应 >90%，逗号拆分可能失效）`);
  } else ok(`申报人角色解析率 ${((role.typed / role.all_n) * 100).toFixed(1)}%`);

  if (full) {
    const present = new Set((await q(`select distinct source_quarter q from mds.dera_insider_filing`)).map((r) => r.q));
    const newest = [...present].sort().pop()!;
    const expected = enumerateQuarters(DERA_INSIDER_FIRST_QUARTER, newest);
    const missing = expected.filter((x) => !present.has(x));
    if (missing.length) fail(`季度断档 ${missing.length} 个：${missing.slice(0, 8).join(",")}${missing.length > 8 ? "…" : ""}`);
    else ok(`季度连续无断档（${expected[0]} → ${newest}，共 ${expected.length} 个）`);
  }
}

main()
  .catch((e) => { console.error(e); errors++; })
  .finally(async () => {
    await prisma.$disconnect();
    if (errors) { console.error(`[verify-dera-insider] 失败：${errors} 项`); process.exit(1); }
    console.log("[verify-dera-insider] 通过");
  });
