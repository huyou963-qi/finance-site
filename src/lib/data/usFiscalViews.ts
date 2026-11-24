import {
  auctionIssuanceByMonth,
  maturitySchedule,
  parseMspdSecurities,
  type TreasuryRow,
} from "./scheduler/usFiscalFoundation/raw";
import type {
  UsFiscalView,
  UsFiscalViewId,
  UsFiscalViewsPayload,
} from "./usFiscalViewTypes";

export type FiscalPoint = { date: string; value: number };
export type FiscalViewInput = {
  series: Record<string, FiscalPoint[]>;
  mspd: { date: string; rows: TreasuryRow[] };
  auctions: TreasuryRow[];
  today: string;
};
type Values = Map<string, number | null>;
const colors = [
  "#2383e2",
  "#eb5757",
  "#27a99b",
  "#e5a33e",
  "#9670c5",
  "#64748b",
  "#da76a7",
];
const code = (suffix: string) => `treasury_${suffix}`;
const finite = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);
export function fiscalMonthOffset(month: string, offset: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function fiscalRolling12(values: Values): Values {
  return new Map(
    [...values.keys()].sort().map((month) => {
      const sample = Array.from({ length: 12 }, (_, i) =>
        values.get(fiscalMonthOffset(month, -i)),
      );
      return [
        month,
        sample.every(finite) ? sample.reduce((a, b) => a + b, 0) : null,
      ];
    }),
  );
}
function monthly(points: FiscalPoint[]): Values {
  return new Map(points.map((p) => [p.date.slice(0, 7), p.value]));
}
function combine(
  keys: string[],
  maps: Values[],
  formula: (v: number[]) => number,
): Values {
  return new Map(
    keys.map((k) => {
      const v = maps.map((m) => m.get(k)),
        result = v.every(finite) ? formula(v) : null;
      return [k, finite(result) ? result : null];
    }),
  );
}
function keysOf(...maps: Values[]) {
  return [...new Set(maps.flatMap((m) => [...m.keys()]))].sort();
}
function scale(map: Values, factor: number): Values {
  return new Map([...map].map(([k, v]) => [k, finite(v) ? v * factor : null]));
}
function last(map: Values) {
  return [...map]
    .filter(([, v]) => finite(v))
    .sort(([a], [b]) => a.localeCompare(b))
    .at(-1);
}
function ratio(a: Values, b: Values): Values {
  return combine(keysOf(a, b), [a, b], ([x, y]) =>
    y === 0 ? Number.NaN : (x! / y!) * 100,
  );
}
export function fiscalDailyTransactions(
  input: Record<string, FiscalPoint[]>,
  codes: string[],
  today: string,
): Values[] {
  const byDay = codes.map(
    (c) => new Map((input[c] ?? []).map((p) => [p.date, p.value])),
  );
  const days = [...new Set(byDay.flatMap((m) => [...m.keys()]))].sort();
  const out = codes.map(() => new Map<string, number | null>());
  for (const day of days) {
    const month = day.slice(0, 7);
    if (month >= today.slice(0, 7)) continue;
    const valid = byDay.every((m) => finite(m.get(day)));
    byDay.forEach((m, i) => {
      const old = out[i]!.get(month);
      out[i]!.set(
        month,
        !valid || old === null ? null : (old ?? 0) + m.get(day)!,
      );
    });
  }
  return out;
}
export function buildUsFiscalViews(
  input: FiscalViewInput,
): UsFiscalViewsPayload {
  const views = {} as Record<UsFiscalViewId, UsFiscalView>;
  const points = (suffix: string) => input.series[code(suffix)] ?? [];
  const m = (suffix: string) => monthly(points(suffix));
  const billion = (v: number | null | undefined, fromMillions = false) =>
    finite(v) ? v / (fromMillions ? 1e3 : 1e9) : null;
  type Line = {
    name: string;
    values: Values;
    type?: "line" | "bar";
    stack?: string;
    color?: string;
    dashed?: boolean;
    right?: boolean;
  };
  function view(
    id: UsFiscalViewId,
    title: string,
    unit: string,
    lines: Line[],
    note: string,
    options: {
      keys?: string[];
      max?: number;
      asOf?: string;
      table?: UsFiscalView["table"];
      rightUnit?: string;
    } = {},
  ) {
    const categories = (
      options.keys ?? keysOf(...lines.map((l) => l.values))
    ).slice(-(options.max ?? 120));
    const series = lines.map((l, i) => ({
      name: l.name,
      data: categories.map((k) => {
        const v = l.values.get(k);
        return finite(v) ? v : null;
      }),
      type: l.type ?? ("line" as const),
      stack: l.stack,
      color: l.color ?? colors[i % colors.length]!,
      dashed: l.dashed,
      right: l.right,
    }));
    views[id] = {
      id,
      title,
      unit,
      rightUnit: options.rightUnit,
      asOf: options.asOf ?? categories.at(-1) ?? "",
      categories,
      series,
      note,
      table: options.table ?? {
        columns: ["期间", ...lines.map((l) => l.name)],
        rows: categories.slice(-12).map((k) => [
          k,
          ...lines.map((l) => {
            const v = l.values.get(k);
            return finite(v) ? v : null;
          }),
        ]),
      },
    };
  }
  const total = new Map(
    points("debt_penny_total_daily").map((p) => [p.date, p.value]),
  );
  const pub = new Map(
    points("debt_penny_held_public_daily").map((p) => [p.date, p.value]),
  );
  view(
    "A1",
    "公共债务存量",
    "十亿美元",
    [
      { name: "公共债务总额", values: scale(total, 1e-9) },
      { name: "公众持有", values: scale(pub, 1e-9), color: colors[2] },
    ],
    "每日面值余额；总债务包括公众持有和政府内部持有。债务余额上升不等于同期发债融资额。",
    { max: 2600 },
  );
  function monthEnd(values: Values) {
    const out = new Map<string, number | null>();
    for (const [day, value] of [...values].sort(([a], [b]) =>
      a.localeCompare(b),
    ))
      if (day.slice(0, 7) < input.today.slice(0, 7))
        out.set(day.slice(0, 7), value);
    return out;
  }
  const endTotal = monthEnd(total),
    endPub = monthEnd(pub),
    debtMonths = keysOf(endTotal, endPub);
  const delta = (values: Values, lag: number) =>
    new Map(
      [...values].map(([k, v]) => {
        const previous = values.get(fiscalMonthOffset(k, -lag));
        return [k, finite(v) && finite(previous) ? (v - previous) / 1e9 : null];
      }),
    );
  view(
    "A2",
    "债务余额变化",
    "十亿美元",
    [
      { name: "总债务月增量", values: delta(endTotal, 1), type: "bar" },
      {
        name: "公众持有月增量",
        values: delta(endPub, 1),
        type: "bar",
        color: colors[2],
      },
      {
        name: "总债务较上年同月增加",
        values: delta(endTotal, 12),
        dashed: true,
        color: colors[3],
      },
      {
        name: "公众持有较上年同月变化",
        values: delta(endPub, 12),
        dashed: true,
        color: colors[4],
      },
    ],
    "只用完整自然月的最后一个可得余额，分别减上月末、上年同月末；不是发行额或交易资金流。",
    { keys: debtMonths },
  );
  const quarterly = (id: string) =>
    new Map(
      (input.series[id] ?? []).map((p) => [
        `${p.date.slice(0, 4)}Q${Math.floor((Number(p.date.slice(5, 7)) - 1) / 3) + 1}`,
        p.value,
      ]),
    );
  view(
    "A3",
    "官方债务率",
    "%",
    [
      { name: "总债务／GDP", values: quarterly("fred:GFDEGDQ188S") },
      {
        name: "公众持有债务／GDP",
        values: quarterly("fred:FYGFGDQ188S"),
        color: colors[2],
      },
    ],
    "采用官方季度债务／GDP，不用最新日债务除以滞后 GDP；季度数据不向日频填充。",
    { max: 60 },
  );
  const commonDays = keysOf(total, pub).filter(
    (k) => finite(total.get(k)) && finite(pub.get(k)),
  );
  const inside = combine(commonDays, [total, pub], ([t, p]) => t! - p!);
  const heldShares = ratio(pub, total),
    insideShares = ratio(inside, total),
    debtDate = commonDays.at(-1) ?? "";
  view(
    "A4",
    "公众与政府内部持有",
    "%",
    [
      {
        name: "公众持有占比",
        values: heldShares,
        stack: "holders",
        type: "bar",
        color: colors[2],
      },
      {
        name: "政府内部占比",
        values: insideShares,
        stack: "holders",
        type: "bar",
        color: colors[5],
      },
    ],
    "政府内部持有＝总债务－公众持有。政府内部包括信托基金等账户，与公众持有互斥。",
    {
      keys: commonDays,
      max: 2600,
      table: {
        columns: ["持有部门", "日期", "余额（十亿美元）", "占比（%）"],
        rows: [
          [
            "公众持有",
            debtDate,
            billion(pub.get(debtDate)),
            heldShares.get(debtDate) ?? null,
          ],
          [
            "政府内部",
            debtDate,
            billion(inside.get(debtDate)),
            insideShares.get(debtDate) ?? null,
          ],
        ],
      },
    },
  );
  const fed = quarterly("fred:FDHBFRBN"),
    foreign = quarterly("fred:FDHBFIN"),
    privateHolders = quarterly("fred:FDHBPIN");
  const commonQuarters = keysOf(fed, foreign, privateHolders).filter((k) =>
    [fed, foreign, privateHolders].every((v) => finite(v.get(k))),
  );
  const domestic = combine(
    commonQuarters,
    [privateHolders, foreign],
    ([p, f]) => p! - f!,
  );
  const holderMaps = [fed, foreign, domestic],
    holderNames = ["美联储", "境外及国际投资者", "国内其他投资者"],
    holderDate = commonQuarters.at(-1) ?? "";
  const holderTotal = holderMaps.reduce(
    (sum, v) => sum + (v.get(holderDate) ?? 0),
    0,
  );
  view(
    "A5",
    "公众持有人构成",
    "十亿美元",
    holderMaps.map((values, i) => ({
      name: holderNames[i]!,
      values,
      type: "bar",
      stack: "holders",
    })),
    "三类均取共同可用季度。国内其他＝私人投资者－境外；私人投资者原值已含境外，不能直接当作国内持有。",
    {
      keys: commonQuarters,
      max: 60,
      table: {
        columns: [
          "持有部门",
          "共同季度",
          "余额（十亿美元）",
          "三类合计占比（%）",
        ],
        rows: holderMaps.map((v, i) => [
          holderNames[i]!,
          holderDate,
          v.get(holderDate) ?? null,
          holderTotal ? ((v.get(holderDate) ?? 0) / holderTotal) * 100 : null,
        ]),
      },
    },
  );
  const priorQuarter = (q: string) =>
    `${Number(q.slice(0, 4)) - 1}${q.slice(4)}`;
  view(
    "A6",
    "谁在增持或减持",
    "十亿美元",
    holderMaps.map((values, i) => ({
      name: `${holderNames[i]}：四季度余额变化`,
      values: new Map(
        commonQuarters.map((k) => {
          const a = values.get(k),
            b = values.get(priorQuarter(k));
          return [k, finite(a) && finite(b) ? a - b : null];
        }),
      ),
      type: "bar",
    })),
    "以同季度余额减上年同季度余额，反映持有余额变化；不把估值、分类或存量变化解释为债券交易净资金流。",
    { keys: commonQuarters, max: 60 },
  );
  const receipts = m("mts_m01_receipts"),
    outlays = m("mts_m01_outlays"),
    deficit = m("mts_m01_deficit"),
    interest = m("mts_m09_outlay_interest");
  const receiptTTM = fiscalRolling12(receipts),
    outlayTTM = fiscalRolling12(outlays),
    deficitTTM = fiscalRolling12(deficit),
    interestTTM = fiscalRolling12(interest);
  const budgetMonths = keysOf(receipts, outlays, deficit);
  view(
    "B1",
    "财政收入与支出",
    "十亿美元",
    [
      {
        name: "收入：过去12个月",
        values: scale(receiptTTM, 1e-9),
        color: colors[2],
      },
      {
        name: "支出：过去12个月",
        values: scale(outlayTTM, 1e-9),
        color: colors[1],
      },
    ],
    "美国联邦现金制收支。仅在连续12个自然月完整时求和；缺月不补零，避免缴税季节性掩盖趋势。",
  );
  const yoy = (values: Values) =>
    new Map(
      [...values].map(([k, v]) => {
        const p = values.get(fiscalMonthOffset(k, -12));
        return [
          k,
          finite(v) && finite(p) && p !== 0
            ? ((v - p) / Math.abs(p)) * 100
            : null,
        ];
      }),
    );
  const receiptTtmYoy = yoy(receiptTTM),
    outlayTtmYoy = yoy(outlayTTM);
  const receiptMonthlyYoy = yoy(receipts),
    outlayMonthlyYoy = yoy(outlays);
  view(
    "B2",
    "收支趋势变化",
    "%",
    [
      { name: "收入TTM同比", values: receiptTtmYoy, color: colors[2] },
      { name: "支出TTM同比", values: outlayTtmYoy, color: colors[1] },
    ],
    "本期过去12个月合计与上年同期过去12个月合计比较。不是财年累计环比，也不是用单月增速外推全年。",
    {
      table: {
        columns: [
          "月份",
          "收入TTM同比（%）",
          "支出TTM同比（%）",
          "收入单月同比（%）",
          "支出单月同比（%）",
        ],
        rows: budgetMonths
          .slice(-12)
          .map((month) => [
            month,
            ...[
              receiptTtmYoy,
              outlayTtmYoy,
              receiptMonthlyYoy,
              outlayMonthlyYoy,
            ].map((values) => values.get(month) ?? null),
          ]),
      },
    },
  );
  const primary = combine(
    budgetMonths,
    [deficitTTM, interestTTM],
    ([d, i]) => d! - i!,
  );
  view(
    "B3",
    "赤字、初级赤字与净利息",
    "十亿美元",
    [
      {
        name: "初级赤字TTM",
        values: scale(primary, 1e-9),
        type: "bar",
        stack: "deficit",
        color: colors[1],
      },
      {
        name: "净利息TTM",
        values: scale(interestTTM, 1e-9),
        type: "bar",
        stack: "deficit",
        color: colors[3],
      },
      { name: "总赤字TTM", values: scale(deficitTTM, 1e-9), color: colors[0] },
    ],
    "正数为赤字、负数为盈余。初级赤字＝总赤字－净利息；两部分相加回到总赤字，用以区分利息与非利息财政压力。",
  );
  const fyMaps = [
    m("mts_m01_receipts_fytd"),
    m("mts_m01_outlays_fytd"),
    m("mts_m01_deficit_fytd"),
  ];
  const fyMonth = last(fyMaps[0]!)?.[0] ?? "",
    fyAnchor = fyMonth || input.today.slice(0, 7),
    fy =
      Number(fyAnchor.slice(0, 4)) +
      (Number(fyAnchor.slice(5, 7)) >= 10 ? 1 : 0);
  const fiscalMonths = Array.from(
      { length: 12 },
      (_, i) => `${((i + 9) % 12) + 1}月`,
    ),
    fyNames = ["收入", "支出", "赤字"];
  const fyLines: Line[] = fyMaps.flatMap((values, i) =>
    [fy, fy - 1].map((year, j) => ({
      name: `${year}财年${fyNames[i]}`,
      values: new Map(
        fiscalMonths.map((label, index) => {
          const month = fiscalMonthOffset(`${year - 1}-10`, index);
          return [
            label,
            values.get(month) != null ? values.get(month)! / 1e9 : null,
          ];
        }),
      ),
      color: [colors[2], colors[1], colors[3]][i],
      dashed: j === 1,
    })),
  );
  view(
    "B4",
    "本财年进展",
    "十亿美元",
    fyLines,
    "财政年度为10月至次年9月，使用官方财年累计。与上财年相同财年月份比较；10月重置不是财政改善，尚未公布月份留空。",
    {
      keys: fiscalMonths,
      asOf: fyMonth,
      table: {
        columns: [
          "项目",
          "本期月份",
          "本财年累计（十亿美元）",
          "上财年同期（十亿美元）",
          "同比（%）",
        ],
        rows: fyMaps.map((values, i) => {
          const a = values.get(fyMonth),
            b = values.get(fiscalMonthOffset(fyMonth, -12));
          return [
            fyNames[i]!,
            fyMonth,
            billion(a),
            billion(b),
            finite(a) && finite(b) && b !== 0
              ? ((a - b) / Math.abs(b)) * 100
              : null,
          ];
        }),
      },
    },
  );
  const taxKeys = [
    "individual",
    "corporate",
    "payroll",
    "unemployment",
    "other_retirement",
    "excise",
    "estate_gift",
    "customs",
    "misc",
  ];
  const tax = taxKeys.map((k) => fiscalRolling12(m(`mts_m09_rcpt_${k}`)));
  const social = combine(
    budgetMonths,
    tax.slice(2, 5),
    ([a, b, c]) => a! + b! + c!,
  );
  const income = [tax[0]!, tax[1]!, social, ...tax.slice(5)],
    incomeNames = [
      "个人所得税",
      "企业所得税",
      "社保与退休税",
      "消费税",
      "遗产与赠与税",
      "关税",
      "其他收入",
    ];
  const structureTable = (
    names: string[],
    values: Values[],
    totalValues: Values,
  ) => {
    const date = last(totalValues)?.[0] ?? "";
    return {
      columns: ["项目", "TTM截至", "金额（十亿美元）", "占比（%）"],
      rows: names.map((name, i) => [
        name,
        date,
        billion(values[i]!.get(date)),
        ratio(values[i]!, totalValues).get(date) ?? null,
      ]),
    };
  };
  view(
    "B5",
    "财政收入结构",
    "%",
    income.map((v, i) => ({
      name: incomeNames[i]!,
      values: ratio(v, receiptTTM),
      stack: "income",
      type: "bar",
    })),
    "按过去12个月合计计算收入份额。社保与退休税合并就业退休税、失业保险和其他退休税；表格保留金额，避免把份额上升误判为金额增长。",
    { table: structureTable(incomeNames, income, receiptTTM) },
  );
  const spendNames = [
    "社会保障",
    "Medicare",
    "其他医疗卫生",
    "国防",
    "净利息",
    "其他及抵销",
  ];
  const spend = [
    "social_security",
    "medicare",
    "health",
    "defense",
    "interest",
  ].map((k) => fiscalRolling12(m(`mts_m09_outlay_${k}`)));
  spend.push(
    combine(
      budgetMonths,
      [outlayTTM, ...spend],
      (v) => v[0]! - v.slice(1).reduce((s, n) => s + n, 0),
    ),
  );
  view(
    "B6",
    "财政支出结构",
    "%",
    spend.map((v, i) => ({
      name: spendNames[i]!,
      values: ratio(v, outlayTTM),
      stack: "spend",
      type: "bar",
    })),
    "功能支出分为社会保障、Medicare、其他医疗、国防、净利息及其他。其他＝总支出－已列项目，保留负的抵销；不冒充法定强制／自主支出划分。",
    { table: structureTable(spendNames, spend, outlayTTM) },
  );
  const txKeys = [
    "issue_bills_regular",
    "issue_bills_cash",
    "issue_notes",
    "issue_bonds",
    "redeem_bills",
    "redeem_notes",
    "redeem_bonds",
  ].map((k) => code(`dts_${k}`));
  const tx = fiscalDailyTransactions(input.series, txKeys, input.today),
    txMonths = keysOf(...tx);
  const issued = combine(txMonths, tx.slice(0, 4), (v) =>
      v.reduce((a, b) => a + b, 0),
    ),
    redeemed = combine(txMonths, tx.slice(4), (v) =>
      v.reduce((a, b) => a + b, 0),
    );
  const net = combine(txMonths, [issued, redeemed], ([a, b]) => a! - b!);
  view(
    "C1",
    "发行、偿还与净发行",
    "十亿美元",
    [
      {
        name: "发行面值",
        values: scale(issued, 1e-3),
        type: "bar",
        color: colors[0],
      },
      {
        name: "偿还面值",
        values: scale(redeemed, 1e-3),
        type: "bar",
        color: colors[5],
      },
      { name: "净发行", values: scale(net, 1e-3), color: colors[1] },
    ],
    "DTS七条日度面值交易先按完整自然月汇总，再以发行减偿还。任一共同交易日缺分类值时该月留空；排除FFB及单列通胀调整，不等同现金借款。",
    { keys: txMonths },
  );
  const billNet = combine(
    txMonths,
    [tx[0]!, tx[1]!, tx[4]!],
    ([a, b, c]) => a! + b! - c!,
  );
  view(
    "C2",
    "短债与中长债净发行",
    "十亿美元",
    [
      {
        name: "Bills",
        values: scale(billNet, 1e-3),
        type: "bar",
        stack: "net",
      },
      {
        name: "DTS Notes分类",
        values: scale(
          combine(txMonths, [tx[2]!, tx[5]!], ([a, b]) => a! - b!),
          1e-3,
        ),
        type: "bar",
        stack: "net",
        color: colors[2],
      },
      {
        name: "DTS Bonds分类",
        values: scale(
          combine(txMonths, [tx[3]!, tx[6]!], ([a, b]) => a! - b!),
          1e-3,
        ),
        type: "bar",
        stack: "net",
        color: colors[3],
      },
    ],
    "同一DTS口径的发行减偿还。Notes／Bonds分类包含相应TIPS、浮息债交易，不能解读为五券种净现金融资。正负值均保留。",
    { keys: txMonths },
  );
  const auctionRows = auctionIssuanceByMonth(
    input.auctions,
    input.today,
  ).filter((r) => r.periodComplete);
  const types = ["bills", "notes", "bonds", "tips", "frn"] as const,
    typeNames = ["Bills", "固定利率Notes", "固定利率Bonds", "TIPS", "FRN"];
  const auctionMaps = types.map(
      (type) =>
        new Map(
          auctionRows.map((r) => [
            r.month,
            r.complete ? r.dollars[type] / 1e9 : null,
          ]),
        ),
    ),
    latestAuction = auctionRows.filter((r) => r.complete).at(-1);
  const auctionTotal = latestAuction
    ? Object.values(latestAuction.dollars).reduce((a, b) => a + b, 0)
    : 0;
  view(
    "C3",
    "五券种拍卖发行结构",
    "十亿美元",
    auctionMaps.map((values, i) => ({
      name: typeNames[i]!,
      values,
      type: "bar",
      stack: "auctions",
    })),
    "按实际发行日汇总拍卖获配面值，只显示已完整结束月份。含外部配售等口径，与DTS现金或面值交易并非一一对应；结果缺失时整月留空，不以计划发行量补值。",
    {
      table: {
        columns: [
          "券种",
          "最近完整月",
          "实际获配面值（十亿美元）",
          "占比（%）",
        ],
        rows: types.map((type, i) => [
          typeNames[i]!,
          latestAuction?.month ?? "",
          latestAuction ? latestAuction.dollars[type] / 1e9 : null,
          latestAuction && auctionTotal
            ? (latestAuction.dollars[type] / auctionTotal) * 100
            : null,
        ]),
      },
    },
  );
  const ladder = maturitySchedule(input.mspd.rows, input.mspd.date),
    securities = parseMspdSecurities(input.mspd.rows, input.mspd.date);
  const maturityMaps = types.map(
    (type) =>
      new Map(
        ladder.buckets.map((b) => [
          b.month,
          securities
            .filter(
              (s) => s.type === type && s.maturityDate.slice(0, 7) === b.month,
            )
            .reduce((n, s) => n + s.outstandingMillions, 0) / 1e3,
        ]),
      ),
  );
  view(
    "C4",
    "未来12个月到期分布",
    "十亿美元",
    maturityMaps.map((values, i) => ({
      name: typeNames[i]!,
      values,
      type: "bar",
      stack: "maturity",
    })),
    `截至${input.mspd.date}，未来12个自然月到期余额占同范围未到期余额${ladder.dueSharePercent?.toFixed(1) ?? "N/A"}%。按CUSIP合并非空余额，排除FFB和已到期待兑付；不是未来净融资预测，TIPS不预测未来通胀本金。`,
    {
      asOf: input.mspd.date,
      keys: ladder.buckets.map((b) => b.month),
      table: {
        columns: ["到期月份", "到期余额（十亿美元）", "占同范围余额（%）"],
        rows: ladder.buckets.map((b) => [
          b.month,
          b.amountMillions / 1e3,
          ladder.totalUnmaturedMillions
            ? (b.amountMillions / ladder.totalUnmaturedMillions) * 100
            : null,
        ]),
      },
    },
  );
  const financing = m("mts_m06_financing_total"),
    borrowing = m("mts_m06_borrowing_public"),
    cash = m("mts_m06_cash_change"),
    other = combine(
      budgetMonths,
      [financing, borrowing, cash],
      ([f, b, c]) => f! - b! + c!,
    );
  const financeDate = last(financing)?.[0] ?? "",
    cashBalance = last(
      new Map(points("dts_tga_balance").map((p) => [p.date, p.value])),
    ),
    deposits = last(
      new Map(points("dts_tga_deposits").map((p) => [p.date, p.value])),
    ),
    withdrawals = last(
      new Map(points("dts_tga_withdrawals").map((p) => [p.date, p.value])),
    );
  const financeTable: UsFiscalView["table"] = {
    columns: ["项目", "期间", "数值", "单位"],
    rows: [
      ["现金赤字", financeDate, billion(deficit.get(financeDate)), "十亿美元"],
      [
        "融资总额",
        financeDate,
        billion(financing.get(financeDate)),
        "十亿美元",
      ],
      [
        "源表差额：赤字－融资",
        financeDate,
        billion(
          combine(budgetMonths, [deficit, financing], ([d, f]) => d! - f!).get(
            financeDate,
          ),
        ),
        "十亿美元",
      ],
      ...[
        "borrowing_public",
        "treasury_public",
        "cash_change",
        "total_liabilities",
        "total_assets",
        "other_budget",
      ].map((k, i) => [
        [
          "向公众净借款",
          "公众持有Treasury证券面值净变化",
          "现金账户增加",
          "融资负债净变化",
          "融资资产净变化",
          "未计预算交易",
        ][i]!,
        financeDate,
        billion(m(`mts_m06_${k}`).get(financeDate)),
        "十亿美元",
      ]),
      [
        "TGA余额",
        cashBalance?.[0] ?? "",
        billion(cashBalance?.[1], true),
        "十亿美元",
      ],
      [
        "TGA当日总存入",
        deposits?.[0] ?? "",
        billion(deposits?.[1], true),
        "十亿美元",
      ],
      [
        "TGA当日总支取",
        withdrawals?.[0] ?? "",
        billion(withdrawals?.[1], true),
        "十亿美元",
      ],
      [
        "TGA当日净现金流",
        deposits?.[0] ?? "",
        deposits && withdrawals && deposits[0] === withdrawals[0]
          ? billion(deposits[1]! - withdrawals[1]!, true)
          : null,
        "十亿美元",
      ],
    ],
  };
  view(
    "C5",
    "赤字与融资衔接",
    "十亿美元",
    [
      {
        name: "向公众净借款",
        values: scale(borrowing, 1e-9),
        type: "bar",
        stack: "finance",
      },
      {
        name: "现金账户减少（融资来源）",
        values: scale(cash, -1e-9),
        type: "bar",
        stack: "finance",
        color: colors[2],
      },
      {
        name: "其他资产负债与表外调整",
        values: scale(other, 1e-9),
        type: "bar",
        stack: "finance",
        color: colors[5],
      },
      { name: "月度现金赤字", values: scale(deficit, 1e-9), color: colors[1] },
    ],
    "MTS融资总额＝负债净变化－资产净变化＋未计预算交易；图中以公众借款、现金账户减少和其他调整衔接。保留赤字与融资源表差额，不强凑DTS面值交易。TGA日余额和日存入／支取另标日期。",
    { table: financeTable },
  );
  const burden = ratio(interestTTM, receiptTTM),
    rateTotal = m("avg_rate_total"),
    rateMarket = m("avg_rate_marketable");
  const rateKeys = [
      "bills",
      "notes",
      "bonds",
      "tips",
      "frn",
      "marketable",
      "total",
    ],
    rateNames = [
      "Bills平均利率",
      "Notes平均利率",
      "Bonds平均利率",
      "TIPS实际票息",
      "FRN平均利率",
      "可交易债平均利率（不含TIPS/FRN）",
      "总债务平均利率（不含TIPS/FRN）",
    ],
    rateDate = last(rateTotal)?.[0] ?? "";
  view(
    "C6",
    "利息负担与存量成本",
    "收入占比（%）",
    [
      { name: "净利息TTM／收入TTM", values: burden, color: colors[1] },
      {
        name: "可交易债平均利率",
        values: rateMarket,
        right: true,
        color: colors[0],
      },
      {
        name: "总债务平均利率",
        values: rateTotal,
        right: true,
        dashed: true,
        color: colors[5],
      },
    ],
    "左轴为过去12月净利息占收入比，右轴为官方存量平均利率。官方总平均和可交易债平均排除TIPS／FRN；TIPS分项是实际票息，不当作名义总融资成本。",
    {
      keys: budgetMonths,
      rightUnit: "平均利率（%）",
      table: {
        columns: ["项目", "截至", "数值", "单位"],
        rows: [
          [
            "净利息TTM",
            last(interestTTM)?.[0] ?? "",
            billion(last(interestTTM)?.[1]),
            "十亿美元",
          ],
          [
            "财政收入TTM",
            last(receiptTTM)?.[0] ?? "",
            billion(last(receiptTTM)?.[1]),
            "十亿美元",
          ],
          ...rateKeys.map((k, i) => [
            rateNames[i]!,
            rateDate,
            m(`avg_rate_${k}`).get(rateDate) ?? null,
            "%",
          ]),
        ],
      },
    },
  );
  return {
    computedAt: new Date().toISOString(),
    attribution: "来源：美国财政部；美联储／FRED。",
    views,
  };
}
