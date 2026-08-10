import type { ObservationPoint } from "../types";

export type PbcParsedPage = Map<string, ObservationPoint>;

function text(html: string) {
  // Legacy PBC pages insert spaces/newlines inside “M2)余额” and between a
  // number and its unit. Chinese prose has no semantic whitespace here, so
  // remove it before applying the phrase-based official-release parser.
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, "").trim();
}
function number(raw: string, unit: string, direction?: string): number | null { const value = Number(raw.replace(/,/g, "")); if (!Number.isFinite(value)) return null; const scale = unit === "万亿元" ? 10_000 : 1; const signed = direction === "减少" || direction === "下降" ? -value * scale : value * scale; return Number(signed.toFixed(8)); }
function first(source: string, expression: RegExp): number | null { const match = expression.exec(source); return match ? number(match[2]!, match[3]!, match[1]) : null; }
function dateOf(html: string, body: string): Date {
  const titleText = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ") ?? body;
  const monthly = /(20\d{2})年\s*(\d{1,2})月/.exec(titleText) ?? /(20\d{2})年\s*(\d{1,2})月/.exec(body);
  const yearOnly = /(20\d{2})年/.exec(titleText) ?? /(20\d{2})年/.exec(body);
  if (!monthly && !yearOnly) throw new Error("人民银行公告缺少观测期");
  const year = Number((monthly ?? yearOnly)![1]);
  const month = monthly ? Number(monthly[2]) : /一季度/.test(titleText) ? 3 : /二季度|上半年/.test(titleText) ? 6 : /前三季度/.test(titleText) ? 9 : 12;
  if (month < 1 || month > 12) throw new Error(`人民银行公告月份异常：${year}-${month}`);
  return new Date(Date.UTC(year, month - 1, 1));
}
function balancePair(body: string, key: string, labels: readonly string[], out: PbcParsedPage, date: Date) {
  const label = labels.join("|");
  const match = new RegExp(`(?:${label})余额(?:为)?([0-9,.]+)(万亿元|亿元)[，,。；;]?(?:同比)?(增长|下降)([0-9.]+)%`).exec(body);
  if (!match) return;
  const amount = number(match[1]!, match[2]!); const yoy = number(match[4]!, "亿元", match[3]);
  if (amount !== null) out.set(`${key}_amount`, { obsDate: date, value: amount });
  if (yoy !== null) out.set(`${key}_yoy`, { obsDate: date, value: yoy });
}
function increase(body: string, key: string, labels: readonly string[], out: PbcParsedPage, date: Date) {
  const label = labels.join("|");
  const value = first(body, new RegExp(`(?:${label})(增加|减少|净融资|为)([0-9,.]+)(万亿元|亿元)`));
  if (value !== null) out.set(key, { obsDate: date, value });
}
function financing(body: string, key: string, labels: readonly string[], out: PbcParsedPage, date: Date) {
  const match = new RegExp(`(?:${labels.join("|")})(增加|减少|为)?([0-9,.]+)(万亿元|亿元)`).exec(body);
  if (!match) return; const value = number(match[2]!, match[3]!, match[1]);
  if (value !== null) out.set(key, { obsDate: date, value });
}
function nestedIncrease(body: string, key: string, parent: string, child: string, out: PbcParsedPage, date: Date) {
  const value = first(body, new RegExp(`${parent}[\\s\\S]{0,180}?${child}(增加|减少)([0-9,.]+)(万亿元|亿元)`));
  if (value !== null) out.set(key, { obsDate: date, value });
}

/** Parses public PBC release prose; all monetary amounts are normalized to 亿元. */
export function parsePbcMonetaryPage(html: string): PbcParsedPage {
  const body = text(html); const date = dateOf(html, body); const out: PbcParsedPage = new Map();
  balancePair(body, "m2", ["广义货币\\(M2\\)", "广义货币（M2）", "广义货币供应量\\(M2\\)"], out, date); balancePair(body, "m1", ["狭义货币\\(M1\\)", "狭义货币（M1）", "狭义货币供应量\\(M1\\)"], out, date); balancePair(body, "m0", ["流通中货币\\(M0\\)", "流通中货币（M0）", "流通中货币供应量\\(M0\\)"], out, date);
  balancePair(body, "rmb_loan", ["人民币贷款", "人民币各项贷款"], out, date); balancePair(body, "rmb_deposit", ["人民币存款", "人民币各项存款"], out, date);
  increase(body, "rmb_loan_cumulative", ["人民币各项贷款", "人民币贷款"], out, date); increase(body, "household_loan_cumulative", ["住户贷款"], out, date); increase(body, "household_short_loan_cumulative", ["住户短期贷款"], out, date); increase(body, "household_medium_long_loan_cumulative", ["住户中长期贷款"], out, date);
  increase(body, "corporate_loan_cumulative", ["企\\(事\\)业单位贷款", "企（事）业单位贷款"], out, date); increase(body, "corporate_short_loan_cumulative", ["企\\(事\\)业单位短期贷款", "企（事）业单位短期贷款"], out, date); increase(body, "corporate_medium_long_loan_cumulative", ["企\\(事\\)业单位中长期贷款", "企（事）业单位中长期贷款"], out, date); increase(body, "bill_financing_cumulative", ["票据融资"], out, date); increase(body, "nonbank_loan_cumulative", ["非银行业金融机构贷款"], out, date);
  nestedIncrease(body, "household_short_loan_cumulative", "住户贷款", "短期贷款", out, date); nestedIncrease(body, "household_medium_long_loan_cumulative", "住户贷款", "中长期贷款", out, date); nestedIncrease(body, "corporate_short_loan_cumulative", "企（事）业单位贷款", "短期贷款", out, date); nestedIncrease(body, "corporate_medium_long_loan_cumulative", "企（事）业单位贷款", "中长期贷款", out, date);
  increase(body, "rmb_deposit_cumulative", ["人民币存款"], out, date); increase(body, "household_deposit_cumulative", ["住户存款"], out, date); increase(body, "corporate_deposit_cumulative", ["非金融企业存款"], out, date); increase(body, "fiscal_deposit_cumulative", ["财政性存款"], out, date); increase(body, "nonbank_deposit_cumulative", ["非银行业金融机构存款"], out, date);
  const stock = /社会融资规模存量为([0-9,.]+)(万亿元|亿元)[，,。；;]?(?:同比)?(增长|下降)([0-9.]+)%/.exec(body);
  if (stock) { const amount = number(stock[1]!, stock[2]!); const yoy = number(stock[4]!, "亿元", stock[3]); if (amount !== null) out.set("social_financing_stock_amount", { obsDate: date, value: amount }); if (yoy !== null) out.set("social_financing_stock_yoy", { obsDate: date, value: yoy }); }
  increase(body, "social_financing_cumulative", ["社会融资规模增量"], out, date); increase(body, "social_financing_rmb_loan_cumulative", ["对实体经济发放的人民币贷款"], out, date); increase(body, "social_financing_foreign_loan_cumulative", ["对实体经济发放的外币贷款折合人民币", "对实体经济发放的外币贷款"], out, date); increase(body, "entrusted_loan_cumulative", ["委托贷款"], out, date); increase(body, "trust_loan_cumulative", ["信托贷款"], out, date); increase(body, "bank_acceptance_cumulative", ["未贴现的银行承兑汇票"], out, date); increase(body, "corporate_bond_financing_cumulative", ["企业债券融资"], out, date); increase(body, "government_bond_financing_cumulative", ["政府债券融资"], out, date); increase(body, "domestic_equity_financing_cumulative", ["非金融企业境内股票融资"], out, date);
  financing(body, "social_financing_cumulative", ["社会融资规模增量累计", "社会融资规模增量"], out, date); financing(body, "corporate_bond_financing_cumulative", ["企业债券净融资", "企业债券融资"], out, date); financing(body, "government_bond_financing_cumulative", ["政府债券净融资", "政府债券融资"], out, date); financing(body, "domestic_equity_financing_cumulative", ["非金融企业境内股票融资"], out, date);
  // PBC has used both “加权平均利率” and “月加权平均利率”, and some
  // releases abbreviate “质押式债券回购” to “质押式回购”. Keep the anchor
  // specific to the official market-rate phrases while accepting those stable
  // wording variants; the previous exact match silently dropped most repo rows.
  const interbank = /同业拆借(?:月)?加权平均利率为([0-9.]+)%/.exec(body); if (interbank) out.set("interbank_lending_rate", { obsDate: date, value: Number(interbank[1]) });
  const repo = /质押式(?:债券)?回购(?:月)?加权平均利率为([0-9.]+)%/.exec(body); if (repo) out.set("repo_rate", { obsDate: date, value: Number(repo[1]) });
  if (!out.size) throw new Error("人民银行公告未识别到货币信贷或社融指标");
  return out;
}
