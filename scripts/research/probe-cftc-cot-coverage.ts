/**
 * Probe CFTC kh3c-gbw2 coverage for Managed Money dashboard commodities
 * npx tsx scripts/research/probe-cftc-cot-coverage.ts
 */
const BASE = "https://publicreporting.cftc.gov/resource/kh3c-gbw2.json";

async function fetchRows(where: string, limit = 500): Promise<Record<string, unknown>[]> {
  const url =
    `${BASE}?` +
    `$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent("report_date_as_yyyy_mm_dd DESC")}` +
    `&$limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

const SCREENSHOT_ROWS = [
  { label: "WTI Crude (CME)", patterns: [/CRUDE OIL/i, /LIGHT SWEET/i], exchange: /NYMEX|NEW YORK MERC/i },
  { label: "WTI Crude (ICE)", patterns: [/CRUDE OIL/i], exchange: /ICE/i },
  { label: "Brent Crude (ICE)", patterns: [/BRENT CRUDE|CRUDE OIL.*BRENT/i], exchange: /ICE FUTURES EUROPE/i },
  { label: "Gas Oil (ICE)", patterns: [/FUEL OIL/i], exchange: /ICE FUTURES EUROPE/i },
  { label: "RBOB Gasoline", patterns: [/GASOLINE RBOB/i], exchange: /NEW YORK MERCANTILE/i },
  { label: "NY Harbor ULSD", patterns: [/NY HARBOR ULSD/i], exchange: /NEW YORK MERCANTILE/i },
  { label: "NatGas (4 contr.)", patterns: [/NATURAL GAS/i], exchange: null },
  { label: "Gold", patterns: [/^GOLD$/i], exchange: /COMMODITY EXCHANGE/i, exclude: /MICRO/i },
  { label: "Silver", patterns: [/SILVER/i], exchange: /COMMODITY EXCHANGE/i },
  { label: "Platinum", patterns: [/PLATINUM/i], exchange: /NEW YORK MERCANTILE/i },
  { label: "Palladium", patterns: [/PALLADIUM/i], exchange: /NEW YORK MERCANTILE/i },
  { label: "HG Copper", patterns: [/COPPER/i], exchange: /COMMODITY EXCHANGE/i },
  { label: "Soybeans", patterns: [/SOYBEANS/i], exchange: /CHICAGO BOARD/i },
  { label: "Soybean Meal", patterns: [/SOYBEAN MEAL/i], exchange: /CHICAGO BOARD/i },
  { label: "Soybean Oil", patterns: [/SOYBEAN OIL/i], exchange: /CHICAGO BOARD/i },
  { label: "Corn", patterns: [/^CORN$/i], exchange: /CHICAGO BOARD/i },
  { label: "Wheat (CBOT)", patterns: [/WHEAT-SRW/i], exchange: /CHICAGO BOARD/i },
  { label: "Wheat (KCBT)", patterns: [/WHEAT-HRW/i], exchange: /CHICAGO BOARD/i },
  { label: "Sugar", patterns: [/SUGAR/i], exchange: /ICE/i },
  { label: "Cocoa NYBOT", patterns: [/COCOA/i], exchange: /ICE/i },
  { label: "Coffee Arabica", patterns: [/COFFEE/i], exchange: /ICE/i },
  { label: "Cotton", patterns: [/COTTON/i], exchange: /ICE/i },
  { label: "Live Cattle", patterns: [/LIVE CATTLE/i], exchange: /CHICAGO MERC/i },
  { label: "Feeder Cattle", patterns: [/FEEDER CATTLE/i], exchange: /CHICAGO MERC/i },
  { label: "Lean Hogs", patterns: [/LEAN HOGS|HOGS/i], exchange: /CHICAGO MERC/i },
];

function matchRow(
  row: Record<string, unknown>,
  spec: (typeof SCREENSHOT_ROWS)[number],
): boolean {
  const commodity = String(row.commodity ?? "");
  const market = String(row.market_and_exchange_names ?? "");
  if (spec.exclude && spec.exclude.test(market)) return false;
  if (!spec.patterns.some((p) => p.test(commodity) || p.test(market))) return false;
  if (spec.exchange && !spec.exchange.test(market)) return false;
  return true;
}

async function main() {
  const rows = await fetchRows("report_date_as_yyyy_mm_dd = '2026-06-16T00:00:00.000'", 800);
  const latestDate = String(rows[0]?.report_date_as_yyyy_mm_dd ?? "").slice(0, 10);
  console.log(`Sample report_date: ${latestDate}, rows: ${rows.length}\n`);

  console.log("| 截图品种 | CFTC 匹配市场 | MM Long | MM Short | Net | 备注 |");
  console.log("|----------|---------------|---------|----------|-----|------|");

  for (const spec of SCREENSHOT_ROWS) {
    const matched = rows.filter((r) => matchRow(r, spec));
    if (!matched.length) {
      console.log(`| ${spec.label} | — | — | — | — | API 未匹配 |`);
      continue;
    }
    const best = matched.reduce((a, b) =>
      Number(b.open_interest_all ?? 0) > Number(a.open_interest_all ?? 0) ? b : a,
    );
    const lng = Number(best.m_money_positions_long_all ?? 0);
    const sht = Number(best.m_money_positions_short_all ?? 0);
    const market = String(best.market_and_exchange_names ?? "").slice(0, 55);
    const note =
      spec.label === "NatGas (4 contr.)" && matched.length > 1
        ? `共 ${matched.length} 个合约，需自行加总`
        : matched.length > 1
          ? `${matched.length} 行，已取最大 OI`
          : "OK";
    console.log(
      `| ${spec.label} | ${market} | ${lng.toLocaleString()} | ${sht.toLocaleString()} | ${(lng - sht).toLocaleString()} | ${note} |`,
    );
  }

  const ice = rows.filter((r) => /ICE/i.test(String(r.market_and_exchange_names)));
  console.log(`\n样本中 ICE 市场行数: ${ice.length}`);
  console.log("ICE 品种:", [...new Set(ice.map((r) => r.commodity))].sort().join(", "));

  const europe = rows.filter((r) => /ICE FUTURES EUROPE/i.test(String(r.market_and_exchange_names)));
  console.log(`\nICE FUTURES EUROPE 行数: ${europe.length}`);
  for (const r of europe.slice(0, 25)) {
    console.log(`  ${r.commodity} | ${String(r.market_and_exchange_names).slice(0, 80)}`);
  }
}

main().catch(console.error);
