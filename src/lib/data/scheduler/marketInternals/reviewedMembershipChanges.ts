import type { Sp500Change } from "@/lib/equity/wikipediaSp500Changes";

// Publisher evidence, not a ticker alias or a change inferred from ETF holdings.
export const REVIEWED_SP500_CHANGES = [{
  date: "2026-11-04", addedTicker: "OKTA", addedName: "Okta", removedTicker: "KVUE", removedName: "Kenvue",
  reason: "S&P DJI official announcement; effective before US market open",
  source: "https://press.spglobal.com/2026-10-30-Okta-Set-to-Join-S-P-500-Others-to-Join-S-P-MidCap-400-and-S-P-SmallCap-600",
}] as const;

/** Apply only publisher-confirmed events AFTER the baseline and BY the holdings
 * date. The caller still requires a full exact-set SPY match. Never infer an
 * unknown event, reuse an issuer's prices, or validate intervening dates. */
export function applyReviewedMembershipChanges(current: readonly string[], recent: readonly Sp500Change[], baselineAnchor: string, asOf: string) {
  const members = new Set(current);
  const changes = [...recent];
  const sources: string[] = [];
  for (const event of REVIEWED_SP500_CHANGES) {
    if (event.date <= baselineAnchor || event.date > asOf) continue;
    const conflicts = changes.filter(c => c.date === event.date &&
      (c.addedTicker === event.addedTicker || c.removedTicker === event.removedTicker));
    if (conflicts.some(c => c.addedTicker !== event.addedTicker || c.removedTicker !== event.removedTicker)) throw new Error("官方成分事件与现有历史冲突");
    if (members.has(event.removedTicker) && !members.has(event.addedTicker)) {
      members.delete(event.removedTicker); members.add(event.addedTicker);
    } else if (!members.has(event.addedTicker) || members.has(event.removedTicker)) {
      throw new Error("官方成分事件与基线不一致，禁止猜测应用");
    }
    if (!conflicts.length) changes.push(event);
    sources.push(event.source);
  }
  return { current: [...members], changes, sources };
}
