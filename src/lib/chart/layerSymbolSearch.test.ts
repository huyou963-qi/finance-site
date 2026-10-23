import assert from "node:assert/strict";
import { test } from "node:test";
import { requireExactLayerSymbols } from "./layerSymbolSearch";

test("layer validation rejects fuzzy matches, empty results and unavailable search", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ results: [{ symbol: "XLK", name: "Technology ETF", exchange: "NYSE Arca" }] });
  await requireExactLayerSymbols(["XLK"]);
  await assert.rejects(requireExactLayerSymbols(["XL"]), /未找到资产：XL/);
  globalThis.fetch = async () => Response.json({ results: [] });
  await assert.rejects(requireExactLayerSymbols(["MISSING"]), /未找到资产/);
  globalThis.fetch = async () => Response.json({ error: "搜索暂不可用" }, { status: 502 });
  await assert.rejects(requireExactLayerSymbols(["XLK"]), /搜索暂不可用/);
});
