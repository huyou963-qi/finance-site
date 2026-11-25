import { XMLParser, XMLValidator } from "fast-xml-parser";
import { validateEtfHoldingSnapshot, type EtfHoldingSnapshotRow, type ParsedEtfHoldingSnapshot } from "./sectorEtfHoldings";

// SEC series identifiers are stable across fund name changes.
const etfBySeries: Readonly<Record<string, string>> = {
  S000006408: "XLY", S000006409: "XLP", S000006410: "XLE", S000006411: "XLF",
  S000006412: "XLV", S000006413: "XLI", S000006414: "XLB", S000006415: "XLK",
  S000006416: "XLU", S000051152: "XLRE", S000062095: "XLC",
};
export const SECTOR_TRUST_CIK = "0001064641";

type Position = {
  name?: string; cusip?: string; assetCat?: string; payoffProfile?: string; pctVal?: string;
  units?: string; balance?: string; identifiers?: { ticker?: { "@_value"?: string }; isin?: { "@_value"?: string } };
};

export function parseSectorNport(xml: string, expectedDate: string): ParsedEtfHoldingSnapshot | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw Error("N-PORT XML 格式异常");
  const result = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false }).parse(xml).edgarSubmission;
  const form = result?.formData;
  const info = form?.genInfo;
  if (Number(info?.regCik) !== Number(SECTOR_TRUST_CIK)) throw Error("N-PORT 注册主体不符");
  const etf = etfBySeries[info.seriesId];
  if (!etf) return null;
  const asOfDate = info.repPdDate;
  if (asOfDate !== expectedDate || !/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(asOfDate)) throw Error("N-PORT 持仓日期不符");
  const positions = form.invstOrSecs?.invstOrSec as Position[] | Position | undefined;
  const rows: EtfHoldingSnapshotRow[] = [];
  for (const position of [positions ?? []].flat()) {
    if (position.assetCat !== "EC") continue;
    const weight = position.pctVal?.trim() ? Number(position.pctVal) / 100 : NaN;
    const reportedCusip = position.cusip?.trim().toUpperCase();
    const isin = position.identifiers?.isin?.["@_value"]?.trim().toUpperCase();
    const cusip = reportedCusip !== "000000000" && /^[A-Z0-9*@#]{9}$/.test(reportedCusip ?? "") ? reportedCusip! : null;
    const holdingKey = cusip ?? (isin && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) ? `ISIN:${isin}` : null);
    const name = position.name?.trim();
    if (position.payoffProfile !== "Long" || position.units !== "NS" || !holdingKey || !name
      || !Number.isFinite(weight) || weight < 0) throw Error(`N-PORT 普通股持仓异常 ${etf}/${asOfDate}/${cusip}`);
    if (weight === 0) continue;
    const ticker = position.identifiers?.ticker?.["@_value"]?.trim().toUpperCase().replace(/[./]/g, "-");
    const symbol = ticker && /^[A-Z][A-Z0-9-]{0,14}$/.test(ticker) ? ticker : null;
    const shares = position.balance?.trim() ? Number(position.balance) : NaN;
    rows.push({ etf, asOfDate, holdingKey, cusip, symbol, name, weight,
      shares: Number.isFinite(shares) && shares >= 0 ? shares : null });
  }
  const { totalWeight } = validateEtfHoldingSnapshot(rows);
  return { etf, asOfDate, rows, totalWeight };
}
