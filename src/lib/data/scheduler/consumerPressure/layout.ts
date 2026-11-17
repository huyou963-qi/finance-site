import type { CatalogLayoutDocument } from "../../catalogLayout";
import { CONSUMER_PRESSURE_FRED, NYFED_HHDC_SERIES } from "./catalog";

/** Move only this basket's keys; preserve every other country's layout and manual ordering. */
export function placeConsumerPressureKeys(layout: CatalogLayoutDocument): CatalogLayoutDocument {
  const next = structuredClone(layout);
  const us = next.countries.find(row => row.countryCode === "US");
  if (!us) throw new Error("Consumer pressure: US catalog country missing");
  const rows = [
    ...CONSUMER_PRESSURE_FRED.map(r => ({ key: `fred:${r.fredId}`, subgroup: r.subgroup })),
    ...NYFED_HHDC_SERIES.map(r => ({ key: `mds:${r.code}`, subgroup: "居民消费信贷" })),
  ];
  const keys = new Set(rows.map(r => r.key));
  for (const category of us.categories) {
    category.itemKeys = category.itemKeys.filter(k => !keys.has(k));
    for (const group of category.subgroups) group.itemKeys = group.itemKeys.filter(k => !keys.has(k));
  }
  const category = us.categories.find(c => c.name === "金融条件与银行");
  if (!category) throw new Error("Consumer pressure: canonical financial category missing");
  for (const row of rows) {
    let group = category.subgroups.find(g => g.name === row.subgroup);
    if (!group) {
      group = { id: row.subgroup === "居民流动性资产" ? "us-household-liquid-assets" : "us-household-consumer-credit", name: row.subgroup, itemKeys: [] };
      category.subgroups.push(group);
    }
    group.itemKeys.push(row.key);
    if (group.itemKeys.length > 48) throw new Error("Consumer pressure: catalog leaf exceeds 48");
  }
  return next;
}
