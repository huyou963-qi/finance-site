/**
 * Japan core-scope retirement list approved on 2026-09-14.
 *
 * Keep this explicit and fail closed: the destructive cleanup script and the
 * source catalogs use the same list, so a later seed cannot recreate a retired
 * detail series. These 79 codes are regional, demographic, maturity, or narrow
 * component detail removed from the optimized Japan macro scope.
 */
export const JAPAN_RETIRED_DETAIL_CODES = [
  // MOF JGB curve: keep 2Y/5Y/10Y/20Y/30Y/40Y.
  "mof_jp_jgb_1y",
  "mof_jp_jgb_3y",
  "mof_jp_jgb_4y",
  "mof_jp_jgb_6y",
  "mof_jp_jgb_7y",
  "mof_jp_jgb_8y",
  "mof_jp_jgb_9y",
  "mof_jp_jgb_15y",
  "mof_jp_jgb_25y",

  // ESRI GDP: keep the headline nominal level and selected real/deflator/contribution series.
  "esri_jp_gdp_private_consumption_nominal_saar",
  "esri_jp_gdp_private_residential_nominal_saar",
  "esri_jp_gdp_private_business_nominal_saar",
  "esri_jp_gdp_private_inventories_nominal_saar",
  "esri_jp_gdp_government_consumption_nominal_saar",
  "esri_jp_gdp_public_investment_nominal_saar",
  "esri_jp_gdp_public_inventories_nominal_saar",
  "esri_jp_gdp_net_exports_nominal_saar",
  "esri_jp_gdp_exports_nominal_saar",
  "esri_jp_gdp_imports_nominal_saar",
  "esri_jp_gdp_private_inventories_real_saar",
  "esri_jp_gdp_public_inventories_real_saar",
  "esri_jp_gdp_net_exports_real_saar",
  "esri_jp_gdp_private_residential_deflator_sa",
  "esri_jp_gdp_private_business_deflator_sa",
  "esri_jp_gdp_government_consumption_deflator_sa",
  "esri_jp_gdp_public_investment_deflator_sa",
  "esri_jp_gdp_private_residential_real_contribution_sa",
  "esri_jp_gdp_public_inventories_real_contribution_sa",
  "esri_jp_gdp_exports_real_contribution_sa",
  "esri_jp_gdp_imports_real_contribution_sa",

  // Tokyo CPI is regional; keep all 13 nationwide CPI series.
  "jp_estat_cpi_2025_tokyo_all",
  "jp_estat_cpi_2025_tokyo_ex_fresh",
  "jp_estat_cpi_2025_tokyo_ex_fresh_energy",
  "jp_estat_cpi_2025_tokyo_food",
  "jp_estat_cpi_2025_tokyo_housing",
  "jp_estat_cpi_2025_tokyo_utilities",
  "jp_estat_cpi_2025_tokyo_furnishings",
  "jp_estat_cpi_2025_tokyo_clothing",
  "jp_estat_cpi_2025_tokyo_health",
  "jp_estat_cpi_2025_tokyo_transport",
  "jp_estat_cpi_2025_tokyo_education",
  "jp_estat_cpi_2025_tokyo_recreation",
  "jp_estat_cpi_2025_tokyo_misc",

  // Labour Force Survey: keep total, remove sex breakdowns.
  "jp_estat_lfs_employed_male_nsa",
  "jp_estat_lfs_employed_female_nsa",
  "jp_estat_lfs_unemployed_male_nsa",
  "jp_estat_lfs_unemployed_female_nsa",
  "jp_estat_lfs_participation_rate_male_nsa",
  "jp_estat_lfs_participation_rate_female_nsa",
  "jp_estat_lfs_employment_rate_male_nsa",
  "jp_estat_lfs_employment_rate_female_nsa",

  // Economy Watchers: keep nationwide total current/outlook DIs.
  "cao_jp_watchers_current_household_di_sa",
  "cao_jp_watchers_current_corporate_di_sa",
  "cao_jp_watchers_current_employment_di_sa",
  "cao_jp_watchers_outlook_household_di_sa",
  "cao_jp_watchers_outlook_corporate_di_sa",
  "cao_jp_watchers_outlook_employment_di_sa",

  // METI retail: keep total plus four analytically useful groups.
  "meti_jp_retail_general_merchandise_value_nsa",
  "meti_jp_retail_apparel_value_nsa",
  "meti_jp_retail_machinery_equipment_value_nsa",
  "meti_jp_retail_medicine_toiletries_value_nsa",
  "meti_jp_retail_other_value_nsa",

  // ESRI machinery orders: retain five core demand aggregates.
  "esri_jp_machinery_orders_total_sa",
  "esri_jp_machinery_orders_total_ex_ships_sa",
  "esri_jp_machinery_orders_government_sa",
  "esri_jp_machinery_orders_private_sa",
  "esri_jp_machinery_orders_private_ex_ships_sa",
  "esri_jp_machinery_orders_nonmanufacturing_sa",
  "esri_jp_machinery_orders_nonmanufacturing_ex_ships_sa",
  "esri_jp_machinery_orders_through_agencies_sa",

  // MOF reserves: remove secondary reserve-asset components.
  "mof_jp_reserves_imf_position",
  "mof_jp_reserves_sdr",
  "mof_jp_reserves_other_reserve_assets",
  "mof_jp_reserves_other_foreign_currency_assets",

  // JNTO: keep national total only; remove nationality breakdowns.
  "jnto_jp_visitor_arrivals_south_korea",
  "jnto_jp_visitor_arrivals_china",
  "jnto_jp_visitor_arrivals_taiwan",
  "jnto_jp_visitor_arrivals_hong_kong",
  "jnto_jp_visitor_arrivals_united_states",
] as const;

const JAPAN_RETIRED_DETAIL_CODE_SET: ReadonlySet<string> = new Set(
  JAPAN_RETIRED_DETAIL_CODES,
);

export function isJapanRetiredDetailCode(code: string): boolean {
  return JAPAN_RETIRED_DETAIL_CODE_SET.has(code);
}
