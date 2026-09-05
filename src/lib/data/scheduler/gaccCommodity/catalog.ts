/**
 * 海关总署「主要商品量值表」抓取 —— 仪器与数据源常量（seed / sync / verify / adapter 共用）。
 *
 * 源：GACC 统计月报表(13) Major Export Commodities in Quantity and Value /
 *     表(14) Major Import Commodities in Quantity and Value（= 中文月报表13/表14
 *     出口/进口主要商品量值表，同一份数据的英文版）。
 *
 * 为什么走英文站：中文站 www.customs.gov.cn 与 stats.customs.gov.cn 挂了瑞数动态防护，
 * 首请求恒返回 412 + 混淆 JS，需执行 JS 算动态 cookie 才放行（真实浏览器渲染实测也被判
 * 自动化后 400→403）。英文站为同数据的静态 HTML 镜像，无该防护、无 robots.txt（2026-09
 * 实测 /robots.txt 返回 404，即无任何 Disallow），公开且无需登录。
 *
 * 口径：表内金额单位 US$1,000，数量单位随商品而异（10000T/T/N/10000N/100MN…）。
 * 每个商品落三条序列：当月数量、当月金额、当月单价（= 金额/数量，单位归一到美元/吨等）。
 * 单价是「单位规整」而非分析变换：源表本身即以量值表形式发布，单价为其定义式比值。
 */

export const GACC_COMMODITY_SYNC_SCRIPT = "scripts/data-worker/sync-gacc-commodity.ts";

/**
 * 回填起始年份 = 2020。
 * 英文站归档最早到 2018（monthly2018.html），但 **2018–2019 用的是另一套商品名录**
 * （Crude petroleum oil / Milk Powder / Sugar / Pulp，橡胶还拆成天然+合成两行），
 * 与 2020 年起沿用至今的名录不可直接对齐；强行映射会把不同口径拼成一条序列。
 * 2020-01 起名录稳定，仅个别拼写微调（见各商品的 aliases）。
 */
export const GACC_COMMODITY_FIRST_YEAR = 2020;

export const GACC_SOURCE = {
  id: "gacc-commodity",
  agencyId: "cn-gacc",
  nameZh: "中华人民共和国海关总署",
  nameEn: "General Administration of Customs of China",
  name: "海关总署主要商品量值表",
  baseUrl: "http://english.customs.gov.cn/statics/report/monthly.html",
  termsUrl: "http://english.customs.gov.cn/",
  websiteUrl: "http://www.customs.gov.cn/",
} as const;

export const GACC_COMMODITY_CATEGORY = "外贸与外部部门";

export const GACC_COMMODITY_SOURCE_NOTE =
  "海关总署统计月报表(13)/(14) 主要商品量值表（英文站静态镜像）。落库当月数量与当月金额两个源字段，" +
  "单价为二者的定义式比值并做单位归一；不从累计值推算单月值。";

/** 月报索引页（当年）与历史年份归档页 */
export function gaccMonthlyIndexUrl(year: number, currentYear: number): string {
  return year >= currentYear
    ? "http://english.customs.gov.cn/statics/report/monthly.html"
    : `http://english.customs.gov.cn/statics/report/monthly${year}.html`;
}

export type TradeDirection = "export" | "import";

/** 索引页里两张目标表的标题片段（表号 + 关键词，两者都要命中才算） */
export const GACC_TABLE_TITLE: Record<TradeDirection, { no: number; keyword: string }> = {
  export: { no: 13, keyword: "major export commodities in quantity and value" },
  import: { no: 14, keyword: "major import commodities in quantity and value" },
};

/**
 * 源表数量计量单位 → { 量纲, 折算到该量纲基准单位的倍数 }。
 *
 * 单价 = 金额(千美元) × 1000 ÷ (数量 × factor)，得「美元 / 基准单位」（吨 / 个 / 双 / 升 / 立方米 / 条）。
 * 数量入库时统一折算到目录声明的 qtyUnit，因此**源端换单位不会污染序列**——
 * 实测 2018 年集成电路数量单位是 MN（百万个），2024 年起才是 100MN（亿个），
 * 若不做折算，同一条序列会出现 100 倍的断层。量纲不一致（如计件改计重）则 throw。
 */
export type GaccQtyDimension =
  | "mass"
  | "count"
  | "pair"
  | "volume_l"
  | "volume_cum"
  | "area_sm"
  | "carton"
  | "energy_kwh";

export const GACC_QTY_UNITS: Record<string, { dimension: GaccQtyDimension; factor: number }> = {
  KG: { dimension: "mass", factor: 0.001 },
  T: { dimension: "mass", factor: 1 },
  "10000T": { dimension: "mass", factor: 10_000 },
  N: { dimension: "count", factor: 1 },
  "10000N": { dimension: "count", factor: 10_000 },
  MN: { dimension: "count", factor: 1_000_000 },
  "100MN": { dimension: "count", factor: 100_000_000 },
  "10000PR": { dimension: "pair", factor: 10_000 },
  MPR: { dimension: "pair", factor: 1_000_000 },
  "100MP": { dimension: "pair", factor: 100_000_000 },
  "10000CR": { dimension: "carton", factor: 10_000 },
  L: { dimension: "volume_l", factor: 1 },
  "1000L": { dimension: "volume_l", factor: 1_000 },
  "10000L": { dimension: "volume_l", factor: 10_000 },
  CUM: { dimension: "volume_cum", factor: 1 },
  "10000CUM": { dimension: "volume_cum", factor: 10_000 },
  "10000SM": { dimension: "area_sm", factor: 10_000 },
  MKWH: { dimension: "energy_kwh", factor: 1_000_000 },
};

export function normalizeGaccQtyUnit(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * 商品行名 → 匹配键：全角/半角括号归一 + 折叠空白 + 小写。
 * 源站同一商品在不同年份混用「（」和「(」（Motor vehicles（including chassis…），
 * 不归一会白白丢掉 15 期数据。parser 建 key 与目录查表必须共用这一个函数。
 */
export function gaccRowKey(name: string): string {
  return name
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type GaccCommodity = {
  /** instrument code 片段（≤30 字符，与方向、口径拼成 code） */
  slug: string;
  /** 英文表内商品行名（折叠空白后精确匹配，大小写不敏感） */
  sourceName: string;
  /** 历史别名：源站改过拼写/措辞时按顺序回退匹配（如 Aluminium→Aluminum、Maize and maize flour→Maize） */
  aliases?: readonly string[];
  /** 中文展示名 */
  labelZh: string;
  /** 数量序列入库使用的源单位 token（历史上源端换过单位时按量纲折算到它） */
  qtyUnit: string;
  /** 数量序列单位（中文），须与 qtyUnit 对应 */
  qtyUnitZh: string;
  /** 单价序列单位（中文），分母是该量纲的基准单位（吨/个/双/升/立方米/条） */
  priceUnitZh: string;
};

/**
 * 精选重点商品（进口 25 + 出口 25）。
 * 选取原则：价格弹性大、宏观意义强、数量口径稳定（避开数量列为 "-" 的汇总行）。
 * 表内共 205 项出口 / 173 项进口，全量接入会产生上千条序列；如需扩容，
 * 在此追加条目后重跑 seed + sync 即可，parser 无需改动。
 */
export const GACC_IMPORT_COMMODITIES: readonly GaccCommodity[] = [
  { slug: "crude_oil", sourceName: "Crude petroleum oils", labelZh: "原油", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "refined_oil", sourceName: "Refined petroleum products", labelZh: "成品油", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "natural_gas", sourceName: "Natural gases", labelZh: "天然气", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "lng", sourceName: "Natural gases in liquefied state", labelZh: "液化天然气", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "coal", sourceName: "Coal and lignite", labelZh: "煤及褐煤", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "iron_ore", sourceName: "Iron ores and concentrates", labelZh: "铁矿砂及其精矿", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "copper_ore", sourceName: "Copper ores and concentrates", labelZh: "铜矿砂及其精矿", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "bauxite", sourceName: "Aluminium ores and concentrates", aliases: ["Aluminum ores and concentrates"], labelZh: "铝矿砂及其精矿", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "unwrought_copper", sourceName: "Unwrought copper and copper products", labelZh: "未锻轧铜及铜材", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "steel_products", sourceName: "Products, of steel or iron", labelZh: "钢材", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "soybean", sourceName: "Soya beans", labelZh: "大豆", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "maize", sourceName: "Maize and maize flour", aliases: ["Maize"], labelZh: "玉米及玉米粉", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "wheat", sourceName: "Wheat and wheat flour", aliases: ["Wheat"], labelZh: "小麦及小麦粉", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "edible_veg_oil", sourceName: "Edible vegetable oil", labelZh: "食用植物油", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "meat", sourceName: "Meat(including  meat offal)", labelZh: "肉类（含杂碎）", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "milk_powder", sourceName: "Powdered Milk", labelZh: "奶粉", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "sugar", sourceName: "Sugars", labelZh: "食糖", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "cotton", sourceName: "Cotton", labelZh: "棉花", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "rubber", sourceName: "Natural and synthetic rubber(including Latex)", labelZh: "天然及合成橡胶（含胶乳）", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "paper_pulp", sourceName: "Paper pulp", labelZh: "纸浆", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "plastics_primary", sourceName: "Plastics in primary forms", labelZh: "初级形状的塑料", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "potassium_chloride", sourceName: "Potassium chloride", labelZh: "氯化钾", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "integrated_circuits", sourceName: "Electronic integrated circuits", labelZh: "集成电路", qtyUnit: "100MN", qtyUnitZh: "亿个", priceUnitZh: "美元/个" },
  { slug: "semicon_equipment", sourceName: "Semiconductor Manufacturing Equipments", labelZh: "半导体制造设备", qtyUnit: "N", qtyUnitZh: "台", priceUnitZh: "美元/台" },
  { slug: "passenger_cars", sourceName: "Passenger cars", labelZh: "小轿车", qtyUnit: "N", qtyUnitZh: "辆", priceUnitZh: "美元/辆" },
] as const;

export const GACC_EXPORT_COMMODITIES: readonly GaccCommodity[] = [
  { slug: "refined_oil", sourceName: "Refined petroleum products", labelZh: "成品油", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "coke", sourceName: "Coke and semi-coke", labelZh: "焦炭及半焦炭", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "steel_products", sourceName: "Products, of steel or iron", labelZh: "钢材", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "unwrought_aluminium", sourceName: "Unwrought aluminium and aluminium products", labelZh: "未锻轧铝及铝材", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "rare_earth", sourceName: "Rare-earth ore, metals, compounds", labelZh: "稀土（矿、金属及化合物）", qtyUnit: "T", qtyUnitZh: "吨", priceUnitZh: "美元/吨" },
  { slug: "fertilizers", sourceName: "Fertilizers", labelZh: "肥料", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "urea", sourceName: "Urea", labelZh: "尿素", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "cement", sourceName: "Cement and cement clinkers", labelZh: "水泥及水泥熟料", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "rubber_tyres", sourceName: "Rubber tyres", labelZh: "橡胶轮胎", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "ceramics", sourceName: "Ceramic products", labelZh: "陶瓷产品", qtyUnit: "10000T", qtyUnitZh: "万吨", priceUnitZh: "美元/吨" },
  { slug: "footwear", sourceName: "Footwear", labelZh: "鞋类", qtyUnit: "100MP", qtyUnitZh: "亿双", priceUnitZh: "美元/双" },
  { slug: "mobile_phones", sourceName: "Mobile phones", labelZh: "手机", qtyUnit: "10000N", qtyUnitZh: "万台", priceUnitZh: "美元/台" },
  { slug: "adp_machines", sourceName: "Automatic data processing machines", labelZh: "自动数据处理设备", qtyUnit: "10000N", qtyUnitZh: "万台", priceUnitZh: "美元/台" },
  { slug: "laptops", sourceName: "Laptops", labelZh: "笔记本电脑", qtyUnit: "10000N", qtyUnitZh: "万台", priceUnitZh: "美元/台" },
  { slug: "integrated_circuits", sourceName: "Electronic integrated circuits", labelZh: "集成电路", qtyUnit: "100MN", qtyUnitZh: "亿个", priceUnitZh: "美元/个" },
  { slug: "printed_circuits", sourceName: "Printed circuits", labelZh: "印刷电路", qtyUnit: "100MN", qtyUnitZh: "亿个", priceUnitZh: "美元/个" },
  { slug: "solar_cells", sourceName: "Solar cells", labelZh: "太阳能电池", qtyUnit: "10000N", qtyUnitZh: "万个", priceUnitZh: "美元/个" },
  { slug: "li_batteries", sourceName: "Lithium-ion batteries", labelZh: "锂离子蓄电池", qtyUnit: "10000N", qtyUnitZh: "万个", priceUnitZh: "美元/个" },
  { slug: "motor_vehicles", sourceName: "Motor vehicles（including chassis fitted with engines)", labelZh: "汽车（含底盘）", qtyUnit: "10000N", qtyUnitZh: "万辆", priceUnitZh: "美元/辆" },
  { slug: "passenger_cars", sourceName: "Passenger cars", labelZh: "小轿车", qtyUnit: "N", qtyUnitZh: "辆", priceUnitZh: "美元/辆" },
  { slug: "bev_passenger_cars", sourceName: "Battery electric passenger cars", labelZh: "纯电动乘用车", qtyUnit: "N", qtyUnitZh: "辆", priceUnitZh: "美元/辆" },
  { slug: "ships", sourceName: "Ships", labelZh: "船舶", qtyUnit: "N", qtyUnitZh: "艘", priceUnitZh: "美元/艘" },
  { slug: "containers", sourceName: "Containers", labelZh: "集装箱", qtyUnit: "10000N", qtyUnitZh: "万个", priceUnitZh: "美元/个" },
  { slug: "air_conditioners", sourceName: "Air conditioners", labelZh: "空调", qtyUnit: "10000N", qtyUnitZh: "万台", priceUnitZh: "美元/台" },
  { slug: "lcd_tv", sourceName: "LCD televisions", labelZh: "液晶电视机", qtyUnit: "10000N", qtyUnitZh: "万台", priceUnitZh: "美元/台" },
] as const;

export type GaccMeasure = "qty" | "value" | "price";

export const GACC_MEASURES: readonly { key: GaccMeasure; labelZh: string }[] = [
  { key: "qty", labelZh: "当月数量" },
  { key: "value", labelZh: "当月金额" },
  { key: "price", labelZh: "当月单价" },
] as const;

const DIRECTION_CODE: Record<TradeDirection, string> = { export: "exp", import: "imp" };
const DIRECTION_ZH: Record<TradeDirection, string> = { export: "出口", import: "进口" };
const MEASURE_CODE: Record<GaccMeasure, string> = { qty: "qty", value: "val", price: "price" };

/** Instrument.code 上限 48 字符，slug 已按 ≤30 控制 */
export function gaccCode(direction: TradeDirection, slug: string, measure: GaccMeasure): string {
  return `gacc_cn_${DIRECTION_CODE[direction]}_${slug}_${MEASURE_CODE[measure]}`;
}

/** 展示名：外贸：进口：原油：当月单价 */
export function gaccLabel(direction: TradeDirection, labelZh: string, measure: GaccMeasure): string {
  const measureLabel = GACC_MEASURES.find((m) => m.key === measure)!.labelZh;
  return `外贸：${DIRECTION_ZH[direction]}：${labelZh}：${measureLabel}`;
}

export function gaccUnit(commodity: GaccCommodity, measure: GaccMeasure): string {
  if (measure === "qty") return commodity.qtyUnitZh;
  if (measure === "value") return "亿美元";
  return commodity.priceUnitZh;
}

export function gaccCommodities(direction: TradeDirection): readonly GaccCommodity[] {
  return direction === "export" ? GACC_EXPORT_COMMODITIES : GACC_IMPORT_COMMODITIES;
}

export const GACC_DIRECTIONS: readonly TradeDirection[] = ["export", "import"];

/** 全部仪器 code（seed / verify / 发布包共用） */
export const GACC_COMMODITY_CODES: string[] = GACC_DIRECTIONS.flatMap((direction) =>
  gaccCommodities(direction).flatMap((commodity) =>
    GACC_MEASURES.map((measure) => gaccCode(direction, commodity.slug, measure.key)),
  ),
);
