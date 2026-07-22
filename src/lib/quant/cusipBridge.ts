/**
 * CUSIP↔symbol 桥（Phase 5 WS1）。
 *
 * 13F INFOTABLE 只报 CUSIP + NAMEOFISSUER（无 ticker/CIK），EquitySecurity 无 CUSIP →
 * 用「公司名模糊匹配 + filer 频次择优 + 股份类别消歧」把 13F 证券映射到现宇宙 symbol。
 * 头号可行性风险（见 [[phase5-funding-dimension]]）：接受部分覆盖 + 覆盖率透明化。
 *
 * 纯函数（可单测）：名称归一、匹配打分、候选择优。DB 读写在 build-cusip-bridge.ts。
 */

/** 归一化时剔除的公司后缀/噪声词（保守集：保留 GROUP/HOLDINGS 等区分性 token） */
const SUFFIX_TOKENS = new Set([
  "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COS", "COMPANY", "COMPANIES",
  "LTD", "LIMITED", "PLC", "LP", "LLC", "LLP", "SA", "NV", "AG", "AB", "SE",
  "THE", "DEL", "NEW", "CLASS", "CL", "COM", "COMMON", "STK", "CAP", "SHS",
  "HLDG", "REIT",
]);

/**
 * 13F 名称常见缩写 → 规范全称（两侧都过此表即可相遇）。
 * SEC 的 NAMEOFISSUER 定宽截断且高度缩写，现宇宙名多为全称。
 */
const ABBREV: Record<string, string> = {
  PWR: "POWER", MATLS: "MATERIALS", MTLS: "MATERIALS", LABS: "LABORATORIES",
  LAB: "LABORATORIES", INTL: "INTERNATIONAL", INTERNATL: "INTERNATIONAL",
  CHEM: "CHEMICAL", CHEMS: "CHEMICALS", PRODS: "PRODUCTS", PROD: "PRODUCTS",
  RES: "RESOURCES", SYS: "SYSTEMS", SVCS: "SERVICES", SVC: "SERVICES",
  COMM: "COMMUNICATIONS", COMMS: "COMMUNICATIONS", MGMT: "MANAGEMENT",
  MGT: "MANAGEMENT", GRP: "GROUP", HLDGS: "HOLDINGS", FINL: "FINANCIAL",
  FIN: "FINANCIAL", INDS: "INDUSTRIES", IND: "INDUSTRIES", PPTYS: "PROPERTIES",
  PPTY: "PROPERTY", RLTY: "REALTY", ENTMT: "ENTERTAINMENT", TECH: "TECHNOLOGY",
  TECHS: "TECHNOLOGY", PHARM: "PHARMACEUTICALS", PHARMA: "PHARMACEUTICALS",
  NATL: "NATIONAL", MFG: "MANUFACTURING", ELEC: "ELECTRIC", ENGY: "ENERGY",
  PETE: "PETROLEUM", ENTER: "ENTERPRISES", ENTERPRISE: "ENTERPRISES",
  CMNTYS: "COMMUNITIES", CMNTY: "COMMUNITY", STRS: "STORES", STR: "STORES",
  AUTOMOTIVE: "AUTO", MTR: "MOTORS", MTRS: "MOTORS", TRANSN: "TRANSPORTATION",
};

/** 去重音（é→E 等），供归一 */
function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * 公司名归一：去重音、大写、& ↔ AND 统一、去标点/破折号、剔除后缀词、缩写规范化、压缩空白。
 * 例：'Apple Inc.' / 'APPLE INC' → 'APPLE'；'ABBOTT LABS' / 'Abbott Laboratories' → 'ABBOTT LABORATORIES'。
 */
export function normalizeIssuerName(raw: string): string {
  const up = ` ${foldAccents(raw).toUpperCase()} `
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ") // 去所有标点/符号（含花体撇号 ’ 、斜杠、括号）
    .replace(/\s+/g, " ")
    .trim();
  const tokens = up
    .split(" ")
    .filter((t) => t.length > 1 && !SUFFIX_TOKENS.has(t)) // 去单字符噪声（首字母缩写、所有格 's）
    .map((t) => ABBREV[t] ?? t);
  // 全被剔空（如名字仅 "3M"）时退回原始单 token，避免空串
  if (!tokens.length) {
    const raw = up.split(" ").filter(Boolean);
    return raw.join(" ");
  }
  return tokens.join(" ");
}

/**
 * token 近似相等（保守，防 MICROSOFT~MICRON 之类假阳）：
 * - 相等；或
 * - 短者是长者真前缀且短者 ≥4（吸收定宽截断 "TECHN"⊂"TECHNOLOGY"）；或
 * - 公共前缀 ≥6 且两者均 ≥6（极保守，MICROSOFT/MICRON 公共仅 5 不命中）。
 */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && l.startsWith(s)) return true;
  if (s.length >= 6 && l.length >= 6) {
    let i = 0;
    while (i < s.length && s[i] === l[i]) i++;
    if (i >= 6) return true;
  }
  return false;
}

export function nameTokens(raw: string): string[] {
  const n = normalizeIssuerName(raw);
  return n ? n.split(" ") : [];
}

/**
 * 两名称匹配分 0–1：
 * - 归一化完全相等 → 1
 * - 否则 token 集合 Jaccard × 首 token 相等加权（首 token 不等强惩罚，防 "X CORP" 误配 "Y CORP"）。
 */
export function nameMatchScore(a: string, b: string): number {
  const na = normalizeIssuerName(a);
  const nb = normalizeIssuerName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(" ");
  const tb = nb.split(" ");
  // prefix-aware 交集：ta 中有多少 token 在 tb 找到近似匹配（反之亦然，取小）
  const covered = (xs: string[], ys: string[]) =>
    xs.filter((x) => ys.some((y) => tokenMatch(x, y))).length;
  const ca = covered(ta, tb);
  const cb = covered(tb, ta);
  const inter = Math.min(ca, cb);
  const union = ta.length + tb.length - inter;
  const jaccard = union ? inter / union : 0;
  const firstEq = tokenMatch(ta[0]!, tb[0]!) ? 1 : 0.35;
  // 一方全部 token 在另一方近似命中（截断/子集/词序颠倒）→ 保底高分。
  // 「够强」= 该侧 ≥2 token（多词组合已够独特）或单 token ≥5 字符（COSTCO/CISCO 等独特词），
  // 防止短单 token（3M/CO 等）假阳；不强制首 token 相等（吸收 "Lilly (Eli)" 词序颠倒）。
  const strong = (toks: string[]) =>
    toks.length >= 2 || (toks.length === 1 && toks[0]!.length >= 5);
  const subset =
    (ca === ta.length && strong(ta)) || (cb === tb.length && strong(tb)) ? 0.9 : 0;
  // 次级：宇宙名全部 token 被候选覆盖 + 首 token 相等（吸收单短 token "UBER"/"HP"）→ 0.7
  const firstCovered = ca === ta.length && tokenMatch(ta[0]!, tb[0]!) ? 0.7 : 0;
  return Math.max(subset, firstCovered, jaccard * firstEq);
}

/**
 * 硬 CUSIP 覆盖（symbol → 当前规范 9 位 CUSIP）。
 * 用于：dual-class（titleOfClass 文本随 filer 变动不可靠）、名称拼接无法 token 化（ExxonMobil）。
 * 均取自 2024 13F 高 filer 数的规范行，稳定不随时间变。
 */
export const CUSIP_OVERRIDES: Record<string, string> = {
  GOOGL: "02079K305", GOOG: "02079K107",
  "BRK.B": "084670702", "BRK-B": "084670702", BRKB: "084670702",
  XOM: "30231G102",
  // 缩写名/库内名不含全称，无法模糊命中
  IBM: "459200101", // INTERNATIONAL BUSINESS MACHS（库内名仅 "IBM"）
  HON: "438516106", // HONEYWELL INTL（库内名 "Honeywell Technologies" 词不符）
};

/** 13F 侧一个候选证券（distinct CUSIP） */
export type IssuerCandidate = {
  cusip: string;
  nameOfIssuer: string;
  titleOfClass: string;
  /** 持有该 CUSIP 的 filer 数（择优权重：越多越像被广泛持有的规范证券） */
  filerCount: number;
};

/** 股份类别消歧提示：symbol → TITLEOFCLASS 关键词（dual-class 手动种子） */
export const CLASS_HINTS: Record<string, string> = {
  GOOGL: "CL A", GOOG: "CL C",
  "BRK.B": "CL B", "BRK-B": "CL B", BRKB: "CL B",
  FOXA: "CL A", FOX: "CL B",
  NWSA: "CL A", NWS: "CL B",
  "BF.B": "CL B", "BF-B": "CL B",
  UAA: "CL A", UA: "CL C",
  LEN: "COM", // Lennar：LEN=COM，LEN.B=CL B
  HEI: "COM",
  "LGF.A": "CL A", "LGF.B": "CL B",
};

export type BridgeMatch = {
  symbol: string;
  cusip: string;
  matchedName: string;
  titleOfClass: string;
  score: number;
  method: "exact" | "class-hint" | "fuzzy";
};

/**
 * 为单个 symbol 从候选集中选 CUSIP。
 * @param minScore 最低接受分（低于此判未命中）
 */
export function resolveSymbolCusip(
  symbol: string,
  universeName: string,
  candidates: IssuerCandidate[],
  minScore = 0.6,
): BridgeMatch | null {
  if (!universeName) return null;
  // 打分 + 过滤
  const scored = candidates
    .map((c) => ({ c, score: nameMatchScore(universeName, c.nameOfIssuer) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score || b.c.filerCount - a.c.filerCount);
  if (!scored.length) return null;

  const topScore = scored[0]!.score;
  // 与最高分名称并列的候选（可能是同名多股份类别）
  const tied = scored.filter((x) => x.score >= topScore - 1e-9);

  // 类别提示消歧
  const hint = CLASS_HINTS[symbol.toUpperCase()];
  if (hint && tied.length > 1) {
    const byHint = tied.find((x) =>
      x.c.titleOfClass.toUpperCase().includes(hint.toUpperCase()),
    );
    if (byHint) {
      return {
        symbol, cusip: byHint.c.cusip, matchedName: byHint.c.nameOfIssuer,
        titleOfClass: byHint.c.titleOfClass, score: byHint.score, method: "class-hint",
      };
    }
  }

  // 否则取 filer 数最高者（tied 已按 score→filerCount 排序，取首个）
  const best = tied[0]!;
  return {
    symbol, cusip: best.c.cusip, matchedName: best.c.nameOfIssuer,
    titleOfClass: best.c.titleOfClass, score: best.score,
    method: best.score >= 0.999 ? "exact" : "fuzzy",
  };
}
