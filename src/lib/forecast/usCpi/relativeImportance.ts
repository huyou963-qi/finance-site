/**
 * BLS CPI-U 相对权重（Relative importance，占全部项目 %），各年 12 月值，用于次年 1–12 月。
 *
 * 来源：BLS「Relative importance of components in the Consumer Price Indexes: U.S. city
 * average, December YYYY」（https://www.bls.gov/cpi/tables/relative-importance/YYYY.htm），
 * 2026-09-23 逐年核对：能源商品 + 能源服务 = 能源、家庭食品 + 外出就餐 = 食品。
 * 2019 年及以前的表 URL 格式不同（404），更早年份按 2020 权重叠加相对价格漂移近似。
 *
 * ⚠ BLS 每年 1 月随 12 月 CPI 发布新权重：新增一年时在此表追加，模型自动取
 * 「不晚于 t 前一年」的最新一年。
 */
export type RelativeImportanceKey =
  | "FAH" | "FAFH" | "FOOD" | "GAS" | "FUEL" | "ELEC" | "UGAS" | "ENE"
  | "CORE" | "CG" | "NEWV" | "USED" | "APP" | "MEDC"
  | "CS" | "SHEL" | "RENT" | "LODG" | "OER" | "MEDS" | "TRS" | "AIR";

export const CPI_RELATIVE_IMPORTANCE: Readonly<Record<number, Record<RelativeImportanceKey, number>>> = {
  2020: {
    FAH: 7.772, FAFH: 6.347, FOOD: 14.119, GAS: 2.811, FUEL: 0.145, ELEC: 2.425, UGAS: 0.71, ENE: 6.155,
    CORE: 79.726, CG: 20.2, NEWV: 3.756, USED: 2.75, APP: 2.663, MEDC: 1.58,
    CS: 59.526, SHEL: 33.316, RENT: 7.862, LODG: 0.825, OER: 24.263, MEDS: 7.289, TRS: 5.142, AIR: 0.633,
  },
  2021: {
    FAH: 8.165, FAFH: 5.205, FOOD: 13.37, GAS: 3.748, FUEL: 0.192, ELEC: 2.454, UGAS: 0.879, ENE: 7.348,
    CORE: 79.282, CG: 21.699, NEWV: 4.105, USED: 4.143, APP: 2.458, MEDC: 1.524,
    CS: 57.583, SHEL: 32.946, RENT: 7.398, LODG: 0.914, OER: 24.251, MEDS: 6.962, TRS: 5.599, AIR: 0.481,
  },
  2022: {
    FAH: 8.728, FAFH: 4.803, FOOD: 13.531, GAS: 3.172, FUEL: 0.215, ELEC: 2.541, UGAS: 0.89, ENE: 6.921,
    CORE: 79.548, CG: 21.361, NEWV: 4.313, USED: 2.668, APP: 2.479, MEDC: 1.455,
    CS: 58.187, SHEL: 34.413, RENT: 7.528, LODG: 1.085, OER: 25.424, MEDS: 6.653, TRS: 5.75, AIR: 0.587,
  },
  2023: {
    FAH: 8.167, FAFH: 5.388, FOOD: 13.555, GAS: 3.261, FUEL: 0.167, ELEC: 2.428, UGAS: 0.688, ENE: 6.655,
    CORE: 79.79, CG: 18.891, NEWV: 3.684, USED: 2.012, APP: 2.512, MEDC: 1.489,
    CS: 60.899, SHEL: 36.191, RENT: 7.671, LODG: 1.338, OER: 26.769, MEDS: 6.515, TRS: 6.294, AIR: 0.751,
  },
  2024: {
    FAH: 8.043, FAFH: 5.648, FOOD: 13.691, GAS: 2.902, FUEL: 0.139, ELEC: 2.343, UGAS: 0.75, ENE: 6.216,
    CORE: 80.094, CG: 19.388, NEWV: 4.393, USED: 2.391, APP: 2.48, MEDC: 1.527,
    CS: 60.705, SHEL: 35.483, RENT: 7.499, LODG: 1.292, OER: 26.282, MEDS: 6.747, TRS: 6.305, AIR: 0.918,
  },
  2025: {
    FAH: 8.325, FAFH: 5.373, FOOD: 13.698, GAS: 2.895, FUEL: 0.14, ELEC: 2.489, UGAS: 0.773, ENE: 6.383,
    CORE: 79.919, CG: 19.176, NEWV: 3.838, USED: 2.759, APP: 2.368, MEDC: 1.489,
    CS: 60.744, SHEL: 35.625, RENT: 7.84, LODG: 1.289, OER: 26.204, MEDS: 6.935, TRS: 6.315, AIR: 0.881,
  },
};

const YEARS = Object.keys(CPI_RELATIVE_IMPORTANCE).map(Number).sort((a, b) => a - b);

/** t 所在年份使用的权重年：前一年 12 月，夹在已登记年份范围内 */
export function relativeImportanceYearFor(year: number): number {
  return Math.min(Math.max(year - 1, YEARS[0]!), YEARS[YEARS.length - 1]!);
}

export const LATEST_RELATIVE_IMPORTANCE_YEAR = YEARS[YEARS.length - 1]!;
