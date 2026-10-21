import { SourceAdapterKind } from "@prisma/client";
import {
  isNetworkAcquisitionConfirmed,
  resolveAcquisitionStatus,
} from "./catalogAcquisition";
import { readFetchAcquisition } from "./fetchAcquisition";
import { isHistoricalCensusSeries } from "./usTradeDetail/lifecycle";

export function subscriptionEligibleForSchedule(params: {
  subscriptionEnabled: boolean;
  adapterKind: SourceAdapterKind;
  sourceSeriesKey: string | null;
  metadata: unknown;
}): boolean {
  if (isHistoricalCensusSeries(params.sourceSeriesKey)) return false;
  const acquisitionStatus = resolveAcquisitionStatus({
    subscriptionEnabled: params.subscriptionEnabled,
    adapterKind: params.adapterKind,
    sourceSeriesKey: params.sourceSeriesKey,
    metadata: params.metadata,
  });
  const fa = readFetchAcquisition(params.metadata);
  return isNetworkAcquisitionConfirmed({
    inDatabase: true,
    acquisitionStatus,
    fetchAcquisitionStatus: fa?.status ?? null,
  });
}
