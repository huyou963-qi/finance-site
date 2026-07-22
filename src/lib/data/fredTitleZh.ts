/**
 * FRED / 宏观英文标题 → 中文弱翻译（规则词典，不调用外部翻译 API）。
 */
import { fredDisplayLabel, worldBankIndicatorLabel } from "@/lib/data/fredCatalog";

export type WeakTitleZh = {
  labelZh: string;
  labelEn: string;
  /** true = 词典弱译；false = 命中静态目录正式中文名 */
  weak: boolean;
};

/** 长短语优先；匹配时大小写不敏感 */
const PHRASE_DICT: readonly [string, string][] = [
  ["not seasonally adjusted", "未季调"],
  ["seasonally adjusted annual rate", "季调年率"],
  ["seasonally adjusted", "季调"],
  ["consumer price index", "消费者物价指数"],
  ["personal consumption expenditures", "个人消费支出"],
  ["producer price index", "生产者物价指数"],
  ["gross domestic product", "国内生产总值"],
  ["real gross domestic product", "实际国内生产总值"],
  ["industrial production", "工业生产"],
  ["capacity utilization", "产能利用率"],
  ["unemployment rate", "失业率"],
  ["civilian unemployment rate", "失业率（平民）"],
  ["labor force participation rate", "劳动参与率"],
  ["nonfarm payrolls", "非农就业"],
  ["all employees", "全部雇员"],
  ["average hourly earnings", "平均时薪"],
  ["average weekly hours", "平均每周工时"],
  ["housing starts", "新屋开工"],
  ["building permits", "建筑许可"],
  ["existing home sales", "成屋销售"],
  ["new home sales", "新屋销售"],
  ["retail sales", "零售销售"],
  ["durable goods", "耐用品"],
  ["federal funds", "联邦基金"],
  ["effective federal funds rate", "有效联邦基金利率"],
  ["treasury constant maturity", "国债固定期限"],
  ["market yield", "市场收益率"],
  ["interest rate", "利率"],
  ["money supply", "货币供应量"],
  ["monetary base", "货币基数"],
  ["commercial bank", "商业银行"],
  ["commercial paper", "商业票据"],
  ["balance sheet", "资产负债表"],
  ["assets", "资产"],
  ["liabilities", "负债"],
  ["total reserves", "总准备金"],
  ["excess reserves", "超额准备金"],
  ["imports", "进口"],
  ["exports", "出口"],
  ["trade balance", "贸易差额"],
  ["current account", "经常账户"],
  ["exchange rate", "汇率"],
  ["real estate", "房地产"],
  ["construction", "建筑"],
  ["manufacturing", "制造业"],
  ["services", "服务业"],
  ["all items", "全部项目"],
  ["less food and energy", "剔除食品与能源"],
  ["food and beverages", "食品与饮料"],
  ["energy", "能源"],
  ["shelter", "住房"],
  ["owners' equivalent rent", "业主等价租金"],
  ["medical care", "医疗"],
  ["transportation", "交通"],
  ["apparel", "服装"],
  ["education", "教育"],
  ["communication", "通讯"],
  ["recreation", "娱乐"],
  ["city average", "城市平均"],
  ["urban consumers", "城镇消费者"],
  ["urban wage earners", "城镇工薪阶层"],
  ["chain-type", "链式"],
  ["chained", "链式"],
  ["price index", "价格指数"],
  ["price deflator", "平减指数"],
  ["unit labor cost", "单位劳动力成本"],
  ["productivity", "生产率"],
  ["compensation", "薪酬"],
  ["personal income", "个人收入"],
  ["disposable personal income", "可支配个人收入"],
  ["personal saving", "个人储蓄"],
  ["household", "家庭"],
  ["debt service", "偿债"],
  ["delinquency", "逾期"],
  ["charge-off", "核销"],
  ["loan", "贷款"],
  ["mortgage", "按揭"],
  ["credit card", "信用卡"],
  ["automobile", "汽车"],
  ["motor vehicle", "机动车"],
  ["crude oil", "原油"],
  ["west texas intermediate", "WTI"],
  ["brent", "布伦特"],
  ["gold", "黄金"],
  ["silver", "白银"],
  ["copper", "铜"],
  ["natural gas", "天然气"],
  ["thousands of persons", "千人"],
  ["thousands of units", "千套"],
  ["millions of dollars", "百万美元"],
  ["billions of dollars", "十亿美元"],
  ["percent change", "变动百分比"],
  ["percentage points", "百分点"],
  ["percent", "%"],
  ["index", "指数"],
  ["ratio", "比率"],
  ["level", "水平值"],
  ["monthly", "月"],
  ["quarterly", "季"],
  ["weekly", "周"],
  ["daily", "日"],
  ["annual", "年"],
  ["united states", "美国"],
  ["u.s.", "美国"],
  ["usa", "美国"],
];

const SORTED_PHRASES = [...PHRASE_DICT].sort((a, b) => b[0].length - a[0].length);

function applyPhraseDict(title: string): { text: string; replacedChars: number } {
  let remaining = title;
  let out = "";
  let replacedChars = 0;

  // 逐段扫描：每次在剩余串中找最长可匹配短语
  while (remaining.length > 0) {
    const lower = remaining.toLowerCase();
    let matched = false;
    for (const [en, zh] of SORTED_PHRASES) {
      if (lower.startsWith(en)) {
        out += zh;
        replacedChars += en.length;
        remaining = remaining.slice(en.length);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 跳过分隔符/空白原样保留（中文化后常用空格压缩）
    const ch = remaining[0]!;
    if (/[\s,;:/|_\-().]/.test(ch)) {
      // 空格：若输出末尾已是中文或空格则跳过多余空格
      if (ch === " " || ch === "\t") {
        if (out.length > 0 && !/[\s（]/.test(out[out.length - 1]!)) {
          out += "";
        }
      } else if (ch === "(") {
        out += "（";
      } else if (ch === ")") {
        out += "）";
      } else if (ch === "," || ch === ";") {
        out += "，";
      } else {
        out += ch;
      }
      remaining = remaining.slice(1);
      continue;
    }

    // 吃掉一个英文单词（保留未译词）
    const wordMatch = remaining.match(/^[A-Za-z0-9.+%=]+/);
    if (wordMatch) {
      out += (out && !/[\s（]$/.test(out) ? " " : "") + wordMatch[0];
      remaining = remaining.slice(wordMatch[0].length);
      continue;
    }

    out += ch;
    remaining = remaining.slice(1);
  }

  return { text: out.replace(/\s+/g, " ").trim(), replacedChars };
}

function hasSignificantChinese(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

export function weakTranslateTitle(options: {
  titleEn: string;
  seriesId?: string | null;
  units?: string | null;
  /** fred | worldbank */
  source?: "fred" | "worldbank";
}): WeakTitleZh {
  const labelEn = options.titleEn.trim() || options.seriesId?.trim() || "";
  const seriesId = options.seriesId?.trim() ?? "";

  if (options.source !== "worldbank" && seriesId) {
    const staticLabel = fredDisplayLabel(seriesId);
    if (staticLabel && staticLabel.toUpperCase() !== seriesId.toUpperCase()) {
      return { labelZh: staticLabel, labelEn: labelEn || seriesId, weak: false };
    }
  }

  if (options.source === "worldbank" && seriesId) {
    const wb = worldBankIndicatorLabel(seriesId);
    if (wb && wb !== seriesId && hasSignificantChinese(wb)) {
      return { labelZh: wb, labelEn: labelEn || seriesId, weak: false };
    }
  }

  if (!labelEn) {
    return {
      labelZh: seriesId || "未命名指标",
      labelEn: seriesId,
      weak: true,
    };
  }

  const { text, replacedChars } = applyPhraseDict(labelEn);
  const coverage = replacedChars / Math.max(labelEn.length, 1);

  let labelZh = text;
  if (!hasSignificantChinese(labelZh) || coverage < 0.15) {
    // 几乎没翻出来：附英文原题，避免纯 ID
    labelZh = seriesId
      ? `${seriesId}（${labelEn}）`
      : labelEn;
  } else if (/[A-Za-z]{3,}/.test(labelZh) && !labelZh.includes(labelEn)) {
    // 有中文但仍含较长英文残留：括注原题便于核对
    if (labelZh.length < 80 && labelEn.length < 120 && !labelZh.includes("（")) {
      labelZh = `${labelZh}（${labelEn}）`;
    }
  }

  return { labelZh, labelEn, weak: true };
}

/** 是否像「已是比率/利率」——默认不加同比 */
export function looksLikePercentSeries(units: string | null | undefined, titleEn?: string | null): boolean {
  const u = (units ?? "").toLowerCase();
  const t = (titleEn ?? "").toLowerCase();
  if (/\bpercent\b|%\b|percentage/.test(u)) return true;
  if (/\byield\b|\brate\b|\bspread\b/.test(u) && !/index/.test(u)) return true;
  if (/\bunemployment rate\b|\bfederal funds\b|\binterest rate\b|\byield\b/.test(t)) return true;
  return false;
}

/** 是否像价格指数 —— 默认同比 */
export function looksLikeIndexSeries(units: string | null | undefined, titleEn?: string | null): boolean {
  const u = (units ?? "").toLowerCase();
  const t = (titleEn ?? "").toLowerCase();
  if (/index|2017=100|1982|1984=100|chain/.test(u)) return true;
  if (/\bprice index\b|\bcpi\b|\bppi\b|\bpce\b/.test(t)) return true;
  return false;
}

export type VariantChoiceDefaults = {
  level: boolean;
  yoy: boolean;
  mom: boolean;
};

/** 双击添加弹层默认勾选 */
export function defaultVariantChoices(options: {
  frequency: string | null | undefined;
  units: string | null | undefined;
  titleEn?: string | null;
}): VariantChoiceDefaults {
  const freq = (options.frequency ?? "").toLowerCase();
  const isDaily = /daily|日/.test(freq);
  const isWeekly = /weekly|周/.test(freq);
  const percent = looksLikePercentSeries(options.units, options.titleEn);
  const indexLike = looksLikeIndexSeries(options.units, options.titleEn);

  if (percent) {
    return { level: true, yoy: false, mom: false };
  }
  if (isDaily) {
    return { level: true, yoy: false, mom: false };
  }
  // 周/月/季/年：指数类默认原值+同比；其它水平序列同
  if (indexLike || isWeekly || /month|月|quarter|季|annual|year|年/.test(freq) || !freq) {
    return { level: true, yoy: true, mom: false };
  }
  return { level: true, yoy: false, mom: false };
}

export function variantKeysForBase(
  baseKey: string,
  choices: { level: boolean; yoy: boolean; mom: boolean },
): string[] {
  const base = baseKey.includes("::") ? baseKey.split("::")[0]! : baseKey;
  const keys: string[] = [];
  if (choices.level) keys.push(base);
  if (choices.yoy) keys.push(`${base}::yoy`);
  if (choices.mom) keys.push(`${base}::mom`);
  return keys;
}

export function labelForVariantKey(baseLabelZh: string, key: string): string {
  if (key.endsWith("::yoy")) {
    return /同比/.test(baseLabelZh) ? baseLabelZh : `${baseLabelZh} 同比`;
  }
  if (key.endsWith("::mom")) {
    return /环比/.test(baseLabelZh) ? baseLabelZh : `${baseLabelZh} 环比`;
  }
  return baseLabelZh;
}
