/** Fixed monthly reports only. Revision releases / mixed-frequency packages
 * must not be assigned a guessed monthly target. Values are publication-month
 * minus observation-month; all eligible MONTHLY members must meet the target. */
export const MONTHLY_RELEASE_LAG: Readonly<Record<string, number>> = {
  "us.bls.cpi": 1,
  "us.bls.ppi": 1,
  "us.bls.employment_situation": 1,
  "us.adp.ner": 1,
  "us.bls.import_export_prices": 1,
  "us.bls.industrial_production": 1,
  "us.frb.g17_capacity": 1,
  "us.bls.retail_sales": 1,
  "us.bls.housing_starts": 1,
  "us.census.new_home_sales": 1,
  "us.nar.existing_home_sales": 1,
  "us.bea.pce": 1,
  "us.bea.personal_income": 1,
  "us.census.international_trade": 2,
  "us.census.mtis": 2,
  "us.census.mfg_trade_sales": 2,
  "us.case_shiller": 2,
  "us.frb.g19_consumer_credit": 2,
  "cn.nbs.ppi": 1,
  "cn.nbs.industrial-production": 1,
  "cn.nbs.retail-sales": 1,
};

export function expectedMonthlyObservation(releaseAt: Date, lagMonths: number): Date {
  return new Date(Date.UTC(releaseAt.getUTCFullYear(), releaseAt.getUTCMonth() - lagMonths, 1));
}
